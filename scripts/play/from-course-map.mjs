// Trace a club's printed COURSE MAP into Play geometry — bunkers, water, trees, rough and the real
// fairway corridors — for a course whose routing is already surveyed (OSM tees/greens/centrelines)
// but whose hazards are nowhere in open data.
//
// Usage:  node from-course-map.mjs <map.png> <course-map.config.json> <play-geom/<slug>.json> <out.json>
// Pure Node: PNG via lib-png.mjs, geometry via lib-geo.mjs. Export the club's map to PNG first
// (the decoder is PNG-only); the club image itself is not committed.
//
// ── Why it works this way ───────────────────────────────────────────────────────────────────────
// A club course map is an ARTISTIC PANORAMA, not a plan. Fitting one global transform to it is
// hopeless: on McLeod a least-squares affine over 18 control points left 47 m RMS, and a smooth
// local warp was worse (89 m LOOCV) because the drawing's local scale genuinely swings 0.76-3.06 m
// per pixel between consecutive tees. The skill's warning about metric-overlaying a stylised map is
// real — for a GLOBAL fit.
//
// So nothing global is attempted. Each hole gets its OWN similarity transform, and every feature is
// carried through the transform of the hole it belongs to. Two correspondences fix each hole's pose
// in closed form, and both are ground truth:
//     hole N's tee     <-> hole N's number badge on the map
//     hole N+1's tee   <-> hole N+1's badge
// That seed is then refined a few degrees / a few percent against the drawing itself, scored on the
// dashed centreline the map draws down each corridor plus the corridor mask. Refinement is bounded,
// so it can only polish the pose, never wander onto a neighbouring hole.
//
// ── The one manual step ─────────────────────────────────────────────────────────────────────────
// `badges` in the config maps HOLE NUMBER -> the pixel position of that hole's number badge, and it
// must be read off the map by eye (the numbers are printed art; there is no OCR here). Do NOT try to
// infer it from a fit — inferring it is what put six McLeod holes on their neighbour's tee, and it
// is invisible in the diagnostics because a wrong hole still lands on *a* corridor. Render the
// badges with their blob ids (`--badges` below), read the printed numbers, fill the config in.
//   node from-course-map.mjs map.png cfg.json geom.json out.json --badges   # dumps detected blobs
//
// ── Verify, don't assume ────────────────────────────────────────────────────────────────────────
// The script prints per-hole on-corridor % and the green->next-tee slack. The decisive check is
// visual and structural: every hole's GREEN must land beside the NEXT hole's tee. If it does for all
// 18, the routing is registered correctly; if one lands somewhere else, that hole's badge is wrong.
import fs from 'node:fs';
import { distM, simp, rad } from './lib-geo.mjs';
import { decodePNG } from './lib-png.mjs';

const [, , mapPath, cfgPath, geomPath, outPath, ...flags] = process.argv;
if (!mapPath || !cfgPath) { console.error('usage: node from-course-map.mjs <map.png> <config.json> <play-geom.json> <out.json> [--badges]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, ''));
const png = decodePNG(fs.readFileSync(mapPath));
const W = png.width, H = png.height, CH = png.channels, D = png.data;
const TOP = cfg.mapTopY ?? 0;                    // ignore the poster header band above the map

// ── classify the drawing ────────────────────────────────────────────────────────────────────────
// Calibrated on McLeod's palette: white paper, blue water, tan sand, three greens (bright fairway /
// mid rough / dark trees), grey ink. Retune the thresholds if a club prints a different style.
const C = { paper: 0, fair: 1, water: 2, badge: 3, sand: 4, rough: 5, trees: 6, ink: 7, other: 8 };
function classOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn, bri = (r + g + b) / 3;
  if (bri > 218 && sat < 28) return C.paper;
  if (b > r + 25 && b > g + 12 && b > 70) return C.water;
  if (r > 150 && g > 90 && b < 110 && r > g + 45) return C.badge;
  if (r > 175 && g > 155 && b < 175 && sat > 22 && r >= g) return C.sand;
  if (g > r && g > b) return g > 150 ? C.fair : g > 92 ? C.rough : C.trees;
  if (sat < 34 && bri < 170) return C.ink;
  return C.other;
}
const code = new Uint8Array(W * H), bri = new Float32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += CH) {
  code[i] = classOf(D[p], D[p + 1], D[p + 2]);
  bri[i] = (D[p] + D[p + 1] + D[p + 2]) / 3;
}

// ── badge blobs (for the --badges dump that seeds the manual read) ───────────────────────────────
function blobs(pred, minPx, maxPx, conn8 = false) {
  const lab = new Int32Array(W * H).fill(-1), out = [];
  for (let y = TOP; y < H; y++) for (let x = 0; x < W; x++) {
    const s = y * W + x; if (lab[s] !== -1 || !pred(s)) continue;
    const st = [s]; lab[s] = 1; const pts = [];
    const NB = conn8 ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1]];
    while (st.length) { const q = st.pop(), qx = q % W, qy = (q / W) | 0; pts.push([qx, qy]);
      for (const [dx, dy] of NB) {
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < TOP || nx >= W || ny >= H) continue;
        const t = ny * W + nx; if (lab[t] === -1 && pred(t)) { lab[t] = 1; st.push(t); } } }
    if (pts.length >= minPx && (!maxPx || pts.length <= maxPx)) out.push(pts);
  }
  return out;
}
if (flags.includes('--badges')) {
  const bs = blobs(i => code[i] === C.badge, 60, 900, true);
  console.log('detected badge blobs — read the printed number on each and fill config.badges:');
  bs.forEach((pts, i) => { let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; }
    console.log(`  #${i}  x=${(cx / pts.length).toFixed(1)} y=${(cy / pts.length).toFixed(1)}  (${pts.length}px)`); });
  process.exit(0);
}

// ── distance transforms ─────────────────────────────────────────────────────────────────────────
function dtOf(on) {
  const a = new Float32Array(W * H).fill(1e9);
  for (let i = 0; i < W * H; i++) if (on(i)) a[i] = 0;
  const F = [[-1,-1,1.414],[0,-1,1],[1,-1,1.414],[-1,0,1]], B = [[1,1,1.414],[0,1,1],[-1,1,1.414],[1,0,1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y*W+x;
    for (const [dx,dy,c] of F) { const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const v=a[ny*W+nx]+c; if(v<a[i]) a[i]=v; } }
  for (let y = H-1; y >= 0; y--) for (let x = W-1; x >= 0; x--) { const i = y*W+x;
    for (const [dx,dy,c] of B) { const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const v=a[ny*W+nx]+c; if(v<a[i]) a[i]=v; } }
  return a;
}
// The drawn centreline is a thin dark dash over green; JPEG/PNG resampling makes it dark GREEN, not
// grey, so no colour class catches it — detect by LOCAL CONTRAST inside a playing-surface window,
// then drop anything near the corridor edge (that's the outline, which the same test finds).
const dash = new Uint8Array(W * H);
{ const K = 6;
  for (let y = Math.max(K, TOP); y < H-K; y++) for (let x = K; x < W-K; x++) {
    const i = y*W+x; let f = 0, tot = 0, sum = 0;
    for (let dy=-K; dy<=K; dy+=2) for (let dx=-K; dx<=K; dx+=2) { const j=(y+dy)*W+x+dx; tot++; if (code[j]===C.fair||code[j]===C.rough) f++; sum += bri[j]; }
    if (f/tot >= 0.55 && bri[i] < sum/tot - 26) dash[i] = 1; } }
const INSIDE = dtOf(i => code[i] !== C.fair && code[i] !== C.rough);
for (let i = 0; i < W*H; i++) if (dash[i] && INSIDE[i] < 3.5) dash[i] = 0;
const DASH = dtOf(i => dash[i] === 1), FAIR = dtOf(i => code[i] === C.fair);
const at = (A, x, y) => { const xi = Math.round(x), yi = Math.round(y); return (xi<0||yi<0||xi>=W||yi>=H) ? 200 : A[yi*W+xi]; };

// ── per-hole similarity ─────────────────────────────────────────────────────────────────────────
const geom = JSON.parse(fs.readFileSync(geomPath, 'utf8'));
const BADGE = cfg.badges, TEE = cfg.tees, CEN = cfg.greens;
const N = Object.keys(TEE).length, NEXT = n => (n % N) + 1;
const EN = (p, t) => [ (p[1]-t[1]) * 111320 * Math.cos(t[0]*rad), (p[0]-t[0]) * 110540 ];
const samp = {};
for (let n = 1; n <= N; n++) {
  const L = geom.lines[n], out = [];
  for (let i = 1; i < L.length; i++) { const a=L[i-1], b=L[i], d=distM(a,b), k=Math.max(1,Math.round(d/5));
    for (let t = 0; t < k; t++) out.push([a[0]+(b[0]-a[0])*t/k, a[1]+(b[1]-a[1])*t/k]); }
  out.push(L[L.length-1]); samp[n] = out.map(p => EN(p, TEE[n]));
}
const mk = (n, th, s, ox, oy) => { const c = Math.cos(th), si = Math.sin(th), [bx, by] = BADGE[n];
  return ([e, nn]) => [bx + ox + s*(c*e - si*nn), by + oy - s*(si*e + c*nn)]; };
const fit = {};
for (let n = 1; n <= N; n++) {
  const m = NEXT(n), gap = distM(CEN[n], TEE[m]);
  const v = EN(TEE[m], TEE[n]), u = [BADGE[m][0]-BADGE[n][0], BADGE[m][1]-BADGE[n][1]];
  const zz = v[0]*v[0] + v[1]*v[1];
  const qr = (u[0]*v[0] + (-u[1])*v[1]) / zz, qi = ((-u[1])*v[0] - u[0]*v[1]) / zz;
  const seedS = Math.hypot(qr, qi), seedTh = Math.atan2(qi, qr);
  const score = (th, s, ox, oy) => {
    const T = mk(n, th, s, ox, oy); let c = 0;
    for (const p of samp[n]) { const [x,y] = T(p); c += Math.min(at(DASH,x,y),14) + 0.6*Math.min(at(FAIR,x,y),14); }
    c /= samp[n].length;
    const [gx, gy] = T(EN(CEN[n], TEE[n]));
    return c + 0.20 * Math.max(0, Math.hypot(gx-BADGE[m][0], gy-BADGE[m][1]) - (gap*s + 14));
  };
  let best = { th: seedTh, s: seedS, ox: 0, oy: 0 }; best.v = score(best.th, best.s, 0, 0);
  for (const [dth, ds, dox, doy] of [[2*rad,0,0,0],[-2*rad,0,0,0],[0,0.03,0,0],[0,-0.03,0,0],[0,0,6,0],[0,0,-6,0],[0,0,0,6],[0,0,0,-6],
                                     [0.7*rad,0,0,0],[-0.7*rad,0,0,0],[0,0.01,0,0],[0,-0.01,0,0],[0,0,2,0],[0,0,-2,0],[0,0,0,2],[0,0,0,-2]])
    for (let it = 0; it < 60; it++) {
      const c = { th: best.th+dth, s: best.s+ds, ox: best.ox+dox, oy: best.oy+doy };
      if (Math.abs(c.th-seedTh) > 9*rad || Math.abs(c.s-seedS) > 0.18*seedS || Math.hypot(c.ox,c.oy) > 14) break;
      const val = score(c.th, c.s, c.ox, c.oy);
      if (val < best.v - 1e-9) best = { v: val, ...c }; else break;
    }
  let on = 0; const T = mk(n, best.th, best.s, best.ox, best.oy);
  for (const p of samp[n]) { const [x,y] = T(p); if (at(FAIR,x,y) <= 1.5) on++; }
  const [gx, gy] = T(EN(CEN[n], TEE[n]));
  fit[n] = { ...best, onFair: on/samp[n].length*100, mPerPx: 1/best.s,
             greenSlackPx: Math.hypot(gx-BADGE[m][0], gy-BADGE[m][1]) - gap*best.s };
}
const fwd = n => mk(n, fit[n].th, fit[n].s, fit[n].ox, fit[n].oy);
const invT = n => { const f = fit[n], t = TEE[n], c = Math.cos(f.th), si = Math.sin(f.th);
  return ([x, y]) => { const X = (x-BADGE[n][0]-f.ox)/f.s, Y = -(y-BADGE[n][1]-f.oy)/f.s;
    const e = c*X + si*Y, nn = -si*X + c*Y;
    return [ t[0] + nn/110540, t[1] + e/(111320*Math.cos(t[0]*rad)) ]; }; };

// hole centrelines in pixels — ownership and relevance are decided in the drawing's own frame
const CL = {};
for (let n = 1; n <= N; n++) { const F = fwd(n); CL[n] = geom.lines[n].map(p => F(EN(p, TEE[n]))); }
const segD = (p,a,b) => { const vx=b[0]-a[0], vy=b[1]-a[1], wx=p[0]-a[0], wy=p[1]-a[1], L=vx*vx+vy*vy;
  if (!L) return Math.hypot(wx,wy); const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/L)); return Math.hypot(wx-t*vx, wy-t*vy); };
const clDist = (p, n) => { let d = 1e9; for (let i=1;i<CL[n].length;i++) d = Math.min(d, segD(p, CL[n][i-1], CL[n][i])); return d; };
const nearestHole = p => { let own=null, bd=1e9; for (let n=1;n<=N;n++){ const d=clDist(p,n); if(d<bd){bd=d;own=n;} } return [own, bd]; };

// ── contours ────────────────────────────────────────────────────────────────────────────────────
function ring(pts) {
  let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;
  for (const [x,y] of pts) { mnx=Math.min(mnx,x); mxx=Math.max(mxx,x); mny=Math.min(mny,y); mxy=Math.max(mxy,y); }
  const w = mxx-mnx+3, h = mxy-mny+3, m = new Uint8Array(w*h);
  for (const [x,y] of pts) m[(y-mny+1)*w + (x-mnx+1)] = 1;
  const on = (x,y) => (x<0||y<0||x>=w||y>=h) ? 0 : m[y*w+x];
  let sx=-1, sy=-1;
  outer: for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (on(x,y)) { sx=x; sy=y; break outer; }
  if (sx < 0) return null;
  const N8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const out = [[sx,sy]]; let cx=sx, cy=sy, dir=6, guard=0;
  do { let found = false;
    for (let k = 0; k < 8; k++) { const d=(dir+6+k)%8, [dx,dy]=N8[d], nx=cx+dx, ny=cy+dy;
      if (on(nx,ny)) { cx=nx; cy=ny; dir=d; out.push([cx,cy]); found=true; break; } }
    if (!found) break;
  } while ((cx!==sx || cy!==sy) && ++guard < 40000);
  return out.map(([x,y]) => [x+mnx-1, y+mny-1]);
}
// A contour traced off pixels is a staircase; round it so shapes read as turf and sand, not polygons.
function chaikin(p, passes = 2) {
  let r = p.slice();
  for (let k = 0; k < passes && r.length > 3; k++) { const out = [];
    for (let i = 0; i < r.length; i++) { const a=r[i], b=r[(i+1)%r.length];
      out.push([a[0]*.75+b[0]*.25, a[1]*.75+b[1]*.25]); out.push([a[0]*.25+b[0]*.75, a[1]*.25+b[1]*.75]); }
    r = out; }
  return r;
}
const perpPx = (p,a,b) => { const vx=b[0]-a[0], vy=b[1]-a[1], wx=p[0]-a[0], wy=p[1]-a[1], L=vx*vx+vy*vy;
  if (!L) return Math.hypot(wx,wy); const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/L)); return Math.hypot(wx-t*vx, wy-t*vy); };
function rdpPx(p, eps) { if (p.length < 3) return p.slice();
  let dm = 0, idx = 0;
  for (let i = 1; i < p.length-1; i++) { const d = perpPx(p[i], p[0], p[p.length-1]); if (d > dm) { dm = d; idx = i; } }
  return dm > eps ? rdpPx(p.slice(0,idx+1), eps).slice(0,-1).concat(rdpPx(p.slice(idx), eps)) : [p[0], p[p.length-1]]; }
const contour = (pts, eps) => { const r = ring(pts); if (!r || r.length < 6) return null;
  let s = rdpPx(r, eps); if (s.length < 4) return null;
  s = rdpPx(chaikin(s), eps * 0.45); return s.length >= 4 ? s : null; };

// ── extract ─────────────────────────────────────────────────────────────────────────────────────
const feats = [], stats = {};
// Discrete hazards: connected components, owned by the nearest hole.
// maxPx on sand matters: the club map draws the CLUBHOUSE and the PRACTICE RANGE outline in the
// same cream as bunkers, and those blobs are far bigger than any bunker (McLeod's real ones run
// 9-155 px, median 23). Without the cap they render as a huge waste area over hole 12's green.
for (const sp of [{ t:'water', cls:C.water, minPx:26, eps:1.6, maxD:130 },
                  { t:'bunker', cls:C.sand, minPx:9, maxPx:160, eps:1.0, maxD:85 }]) {
  const comps = blobs(i => code[i] === sp.cls, sp.minPx, sp.maxPx); let kept = 0;
  for (const pts of comps) {
    let cx=0, cy=0; for (const [x,y] of pts) { cx+=x; cy+=y; } cx/=pts.length; cy/=pts.length;
    const [own, d] = nearestHole([cx,cy]); if (d > sp.maxD) continue;
    const c = contour(pts, sp.eps); if (!c) continue;
    feats.push({ t: sp.t, pts: simp(c.map(invT(own)), 1.2), own }); kept++;
  }
  stats[sp.t] = { found: comps.length, kept };
}
// Area classes MERGE across holes in the drawing (one McLeod fairway blob spans holes 1/2/10/11/12),
// so a whole blob must never go to one hole. Partition the pixels by nearest centreline FIRST, then
// contour each hole's own region — which also yields that hole's real drawn corridor.
const owner = new Int8Array(W*H).fill(-1);
const AREA = { [C.fair]:'fairway', [C.rough]:'rough', [C.trees]:'trees' };
const MAXD = { [C.fair]:60, [C.rough]:70, [C.trees]:70 };
for (let y = TOP; y < H; y++) for (let x = 0; x < W; x++) {
  const c = code[y*W+x]; if (!AREA[c]) continue;
  const [own, d] = nearestHole([x,y]); if (d <= MAXD[c]) owner[y*W+x] = own;
}
for (const cls of [C.fair, C.rough, C.trees]) {
  const t = AREA[cls], eps = cls === C.fair ? 2.0 : 3.0, minPx = cls === C.fair ? 120 : 200;
  let kept = 0, found = 0;
  for (let n = 1; n <= N; n++)
    for (const pts of blobs(i => code[i] === cls && owner[i] === n, 1)) {
      found++; if (pts.length < minPx) continue;
      const c = contour(pts, eps); if (!c) continue;
      feats.push({ t, pts: simp(c.map(invT(n)), 2.5), own: n }); kept++;
    }
  stats[t] = { found, kept };
}

// ── merge + report ──────────────────────────────────────────────────────────────────────────────
// The surveyed greens stay exactly as they are — they drive front/centre/back distances, and the
// drawing is nowhere near accurate enough to touch them. Only display features come from the map.
const greens = geom.features.filter(f => f.t === 'green');
const out = { features: [...greens, ...feats], lines: geom.lines };
fs.writeFileSync(outPath, JSON.stringify(out));

console.error(' n  m/px  on-corridor%  green-slack_px');
for (let n = 1; n <= N; n++) { const f = fit[n];
  console.error(`${String(n).padStart(2)} ${f.mPerPx.toFixed(2).padStart(5)} ${f.onFair.toFixed(0).padStart(12)} ${f.greenSlackPx.toFixed(0).padStart(14)}`); }
console.error('extracted: ' + JSON.stringify(stats));
const per = {};
for (const f of feats) { per[f.own] = per[f.own] || {}; per[f.own][f.t] = (per[f.own][f.t]||0)+1; }
for (let n = 1; n <= N; n++) console.error(` h${String(n).padStart(2)} ` + JSON.stringify(per[n] || {}));
console.error(`-> ${outPath} (${(JSON.stringify(out).length/1024).toFixed(1)} KB, ${out.features.length} features)`);
console.error('CHECK EVERY HOLE: its green must land beside the NEXT hole\'s tee. If one does not, that hole\'s badge is wrong.');
