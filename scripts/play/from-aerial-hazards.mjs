// Trace BUNKERS from a georeferenced aerial and replace a course's existing bunkers with them.
//
// Why only bunkers: on the aerial, sand is unambiguous — small, bright, warm-toned, and sitting in
// mown turf. Water is NOT taken from imagery (dark tree shadow and dark water are indistinguishable
// in RGB — the long-standing rule in this pipeline), and fairway/rough/tree extents are a matter of
// taste that the club's own course map renders more legibly. So this is a surgical upgrade: the one
// feature class where a drawing's corridor-relative accuracy isn't good enough, because a bunker
// either catches your ball or it doesn't.
//
// Usage: node from-aerial-hazards.mjs <aerial.raw> <aerial.meta.json> <aerial.json> <play-geom.json> <out.json>
//   aerial.raw  = RGBA dump of the aerial     aerial.meta.json = {w,h}
//   aerial.json = {bb:{minLat,minLng,maxLat,maxLng}}   (written by fetch-aerial.mjs)
// The export is EPSG:4326, so pixel <-> lat/lng is a plain linear map.
import fs from 'node:fs';
import { distM, simp } from './lib-geo.mjs';

const [, , rawPath, metaPath, geoPath, geomPath, outPath] = process.argv;
if (!outPath) { console.error('usage: node from-aerial-hazards.mjs <aerial.raw> <meta.json> <aerial.json> <play-geom.json> <out.json>'); process.exit(1); }
const { w: W, h: H } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const { bb } = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
const D = fs.readFileSync(rawPath);
const geom = JSON.parse(fs.readFileSync(geomPath, 'utf8'));

const ll2px = ([la, lo]) => [ (lo - bb.minLng) / (bb.maxLng - bb.minLng) * W, (bb.maxLat - la) / (bb.maxLat - bb.minLat) * H ];
const px2ll = ([x, y]) => [ bb.maxLat - y / H * (bb.maxLat - bb.minLat), bb.minLng + x / W * (bb.maxLng - bb.minLng) ];
const mPerPx = distM(px2ll([0, 0]), px2ll([100, 0])) / 100;

// ── sand: bright, warm, and desaturated-ish. Grass is green-dominant; sand runs R >= G > B. ──
const isSand = i => {
  const r = D[i], g = D[i + 1], b = D[i + 2], bri = (r + g + b) / 3;
  return bri > 118 && r >= g - 6 && g > b + 8 && r > b + 22 && (r - b) < 110 && bri < 245;
};

// only look near a hole corridor — roofs, roads and dry lawns elsewhere are the same colour
const CL = Object.keys(geom.lines).map(n => ({ n: +n, px: geom.lines[n].map(ll2px) }));
const segD = (p, a, b) => { const vx = b[0]-a[0], vy = b[1]-a[1], wx = p[0]-a[0], wy = p[1]-a[1], L = vx*vx + vy*vy;
  if (!L) return Math.hypot(wx, wy); const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / L)); return Math.hypot(wx - t*vx, wy - t*vy); };
const nearest = p => { let own = null, bd = 1e9;
  for (const c of CL) for (let i = 1; i < c.px.length; i++) { const d = segD(p, c.px[i-1], c.px[i]); if (d < bd) { bd = d; own = c.n; } }
  return [own, bd]; };

// Turf surround is the discriminator that matters. Sand and a tiled roof are the same colour; what
// separates them is that a bunker sits IN MOWN GRASS. Holes here run along suburban boundaries, so
// proximity to a centreline alone pulls in roofs, driveways and dry lawns by the hundred.
const isTurf = i => { const r = D[i], g = D[i+1], b = D[i+2], bri = (r+g+b)/3;
  return g > r + 4 && g > b + 16 && bri > 40 && bri < 180; };

const NEAR_M = 45;                       // a bunker in play is within ~45 m of the hole's line
const nearPx = NEAR_M / mPerPx;
const cand = new Uint8Array(W * H);
{ // cheap corridor mask first, so the per-pixel nearest-centreline test runs on a small subset
  const band = new Uint8Array(W * H);
  for (const c of CL) for (let i = 1; i < c.px.length; i++) {
    const [x0, y0] = c.px[i-1], [x1, y1] = c.px[i], steps = Math.ceil(Math.hypot(x1-x0, y1-y0));
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x0 + (x1-x0)*s/steps), cy = Math.round(y0 + (y1-y0)*s/steps);
      for (let dy = -nearPx; dy <= nearPx; dy += 3) for (let dx = -nearPx; dx <= nearPx; dx += 3) {
        const nx = Math.round(cx+dx), ny = Math.round(cy+dy);
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && dx*dx + dy*dy <= nearPx*nearPx) band[ny*W+nx] = 1;
      }
    }
  }
  for (let i = 0, p = 0; i < W*H; i++, p += 4) if (band[i] && isSand(p)) cand[i] = 1;
}
// close small gaps so a bunker split by its own rake lines / shadow stays one blob
const closed = new Uint8Array(W * H);
for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) { if (!cand[y*W+x]) continue;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) closed[(y+dy)*W + x+dx] = 1; }

const MIN_M2 = 18, MAX_M2 = 1300;        // a real bunker; bigger is a dirt patch, path or building
const minPx = MIN_M2 / (mPerPx*mPerPx), maxPx = MAX_M2 / (mPerPx*mPerPx);
const lab = new Int32Array(W*H).fill(-1); const comps = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = y*W+x; if (!closed[s] || lab[s] !== -1) continue;
  const st = [s]; lab[s] = 1; const pts = [];
  while (st.length) { const q = st.pop(), qx = q % W, qy = (q / W) | 0; pts.push([qx, qy]);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = qx+dx, ny = qy+dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const t = ny*W+nx;
      if (closed[t] && lab[t] === -1) { lab[t] = 1; st.push(t); } } }
  comps.push(pts);
}
// contour + smooth, same treatment the course-map trace gets
function ring(pts) {
  let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;
  for (const [x,y] of pts) { mnx=Math.min(mnx,x); mxx=Math.max(mxx,x); mny=Math.min(mny,y); mxy=Math.max(mxy,y); }
  const w = mxx-mnx+3, h = mxy-mny+3, m = new Uint8Array(w*h);
  for (const [x,y] of pts) m[(y-mny+1)*w + (x-mnx+1)] = 1;
  const on = (x,y) => (x<0||y<0||x>=w||y>=h) ? 0 : m[y*w+x];
  let sx=-1, sy=-1;
  outer: for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (on(x,y)) { sx=x; sy=y; break outer; }
  if (sx<0) return null;
  const N8=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const out=[[sx,sy]]; let cx=sx, cy=sy, dir=6, guard=0;
  do { let f=false;
    for (let k=0;k<8;k++){ const d=(dir+6+k)%8, [dx,dy]=N8[d], nx=cx+dx, ny=cy+dy;
      if (on(nx,ny)) { cx=nx; cy=ny; dir=d; out.push([cx,cy]); f=true; break; } }
    if (!f) break;
  } while ((cx!==sx||cy!==sy) && ++guard<40000);
  return out.map(([x,y]) => [x+mnx-1, y+mny-1]);
}
function chaikin(p, n = 2) { let r = p.slice();
  for (let k = 0; k < n && r.length > 3; k++) { const o = [];
    for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i+1)%r.length];
      o.push([a[0]*.75+b[0]*.25, a[1]*.75+b[1]*.25]); o.push([a[0]*.25+b[0]*.75, a[1]*.25+b[1]*.75]); }
    r = o; }
  return r; }
const perp=(p,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1],L=vx*vx+vy*vy;
  if(!L)return Math.hypot(wx,wy);const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/L));return Math.hypot(wx-t*vx,wy-t*vy);};
function rdp(p,e){ if(p.length<3) return p.slice(); let dm=0,idx=0;
  for(let i=1;i<p.length-1;i++){const d=perp(p[i],p[0],p[p.length-1]); if(d>dm){dm=d;idx=i;}}
  return dm>e ? rdp(p.slice(0,idx+1),e).slice(0,-1).concat(rdp(p.slice(idx),e)) : [p[0],p[p.length-1]]; }

const bunkers = []; let tooSmall = 0, tooBig = 0, tooFar = 0, thin = 0, notInTurf = 0, lowContrast = 0;
for (const pts of comps) {
  if (pts.length < minPx) { tooSmall++; continue; }
  if (pts.length > maxPx) { tooBig++; continue; }
  let cx = 0, cy = 0; for (const [x,y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
  const [own, d] = nearest([cx, cy]);
  if (d > nearPx) { tooFar++; continue; }
  // compactness: a bunker is a blob, a cart path is a ribbon
  let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;
  for (const [x,y] of pts) { mnx=Math.min(mnx,x); mxx=Math.max(mxx,x); mny=Math.min(mny,y); mxy=Math.max(mxy,y); }
  const bw = mxx-mnx+1, bh = mxy-mny+1;
  if (Math.max(bw,bh) / Math.min(bw,bh) > 4.5) { thin++; continue; }
  if (pts.length / (bw*bh) < 0.34) { thin++; continue; }
  // turf surround: sample a ring just outside the blob; most of it must be mown grass
  const ccx = (mnx+mxx)/2, ccy = (mny+mxy)/2, rr = Math.max(bw,bh)/2 + Math.max(3, 4/mPerPx);
  let turf = 0, tot = 0;
  for (let a = 0; a < 40; a++) { const th = a/40*2*Math.PI;
    const sx = Math.round(ccx + Math.cos(th)*rr), sy = Math.round(ccy + Math.sin(th)*rr);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    tot++; if (isTurf((sy*W+sx)*4)) turf++; }
  if (!tot || turf/tot < 0.55) { notInTurf++; continue; }
  // Raked sand is markedly BRIGHTER than what it sits in; bare dirt, worn turf and a cart path are
  // not. Requiring real contrast against the surrounding ring is what separates them — colour alone
  // does not, because dry ground is the same hue as sand.
  let bs = 0; for (const [x,y] of pts) { const i=(y*W+x)*4; bs += (D[i]+D[i+1]+D[i+2])/3; }
  const blobBri = bs / pts.length;
  let rs = 0, rn = 0;
  for (let a = 0; a < 40; a++) { const th = a/40*2*Math.PI;
    const sx = Math.round(ccx + Math.cos(th)*rr), sy = Math.round(ccy + Math.sin(th)*rr);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const i = (sy*W+sx)*4; rs += (D[i]+D[i+1]+D[i+2])/3; rn++; }
  const ringBri = rn ? rs/rn : 0;
  if (blobBri < 138 || blobBri - ringBri < 52) { lowContrast++; continue; }
  const r = ring(pts); if (!r || r.length < 6) continue;
  const c = rdp(chaikin(rdp(r, 1.2)), 0.6);
  bunkers.push({ t: 'bunker', pts: simp(c.map(px2ll), 0.8), own, _m2: Math.round(pts.length * mPerPx * mPerPx) });
}
bunkers.sort((a, b) => a.own - b.own);
const areas = bunkers.map(b => b._m2).sort((a, b) => a - b);
bunkers.forEach(b => delete b._m2);

const kept = geom.features.filter(f => f.t !== 'bunker');
const out = { features: [...kept, ...bunkers], lines: geom.lines };
fs.writeFileSync(outPath, JSON.stringify(out));

const per = {};
for (const b of bunkers) per[b.own] = (per[b.own] || 0) + 1;
console.error(`aerial ${W}x${H} @ ${mPerPx.toFixed(2)} m/px | blobs ${comps.length} rejected: small ${tooSmall}, big ${tooBig}, far ${tooFar}, thin ${thin}, not-in-turf ${notInTurf}, low-contrast ${lowContrast}`);
console.error(`bunkers: ${bunkers.length} | area median ${areas[areas.length>>1]} m2, max ${areas[areas.length-1]} m2`);
console.error('per hole: ' + Object.keys(geom.lines).map(n => `${n}:${per[n]||0}`).join(' '));
console.error(`-> ${outPath} (${(JSON.stringify(out).length/1024).toFixed(1)} KB)`);
