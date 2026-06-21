// Open aerial imagery → traced fairway corridors (and bunkers/water). Fetches georeferenced Esri
// World Imagery (OSM-tracing-approved), classifies turf/sand/water, and traces hole geometry. All
// geometry in Node (lib-geo); PNG via lib-png. The mown-fairway/rough edge isn't separable in this
// imagery — the tree-bounded grass corridor is, so that's what's traced (see play-triangulation notes).
import { decodePNG } from './lib-png.mjs';
import { distM, rdp, round6, rad, lineLen } from './lib-geo.mjs';

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
// bb = {minLat,minLng,maxLat,maxLng}; returns {width,height,channels,data,bb}
export async function fetchTile(bb, mPerPx = 0.6, max = 1400) {
  const latM = (bb.maxLat - bb.minLat) * 111320;
  const lngM = (bb.maxLng - bb.minLng) * 111320 * Math.cos((bb.minLat + bb.maxLat) / 2 * rad);
  const W = Math.min(max, Math.max(64, Math.round(lngM / mPerPx))), H = Math.min(max, Math.max(64, Math.round(latM / mPerPx)));
  const url = `${ESRI}?bbox=${bb.minLng},${bb.minLat},${bb.maxLng},${bb.maxLat}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png24&f=image`;
  const r = await fetch(url, { headers: { 'User-Agent': 'golf-finder-build/1.0' } });
  if (!r.ok) throw new Error('imagery fetch ' + r.status);
  const png = decodePNG(Buffer.from(await r.arrayBuffer()));
  return { ...png, bb };
}
// grass = green-dominant, mid-brightness (excludes dark trees, bright bunkers/paths, grey roads)
const isGrass = (d, i) => { const R = d[i], G = d[i + 1], B = d[i + 2], bri = (R + G + B) / 3; return G >= R - 4 && G > B + 10 && bri >= 60 && bri <= 175; };

// Trace one hole's fairway along a given centreline. Returns {pts} (closed ring) or null.
export async function traceFairway(centreline, { padM = 40, capM = 22, minM = 8 } = {}) {
  let mnLa = 99, mnLo = 999, mxLa = -99, mxLo = -999;
  for (const p of centreline) { mnLa = Math.min(mnLa, p[0]); mxLa = Math.max(mxLa, p[0]); mnLo = Math.min(mnLo, p[1]); mxLo = Math.max(mxLo, p[1]); }
  const padLat = padM / 111320, padLng = padM / (111320 * Math.cos((mnLa + mxLa) / 2 * rad));
  const bb = { minLat: mnLa - padLat, maxLat: mxLa + padLat, minLng: mnLo - padLng, maxLng: mxLo + padLng };
  const { width: W, height: H, channels: ch, data, bb: B } = await fetchTile(bb);
  const grass = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= W || y < 0 || y >= H) return false; return isGrass(data, (y * W + x) * ch); };
  const g2px = (lat, lng) => [(lng - B.minLng) / (B.maxLng - B.minLng) * W, (B.maxLat - lat) / (B.maxLat - B.minLat) * H];
  const px2g = (x, y) => [B.maxLat - (y / H) * (B.maxLat - B.minLat), B.minLng + (x / W) * (B.maxLng - B.minLng)];
  const mpp = (((B.maxLng - B.minLng) * 111320 * Math.cos((B.minLat + B.maxLat) / 2 * rad) / W) + ((B.maxLat - B.minLat) * 111320 / H)) / 2;
  const cl = centreline.map(p => g2px(p[0], p[1])), step = 12 / mpp, st = [cl[0]]; let acc = 0;
  for (let i = 1; i < cl.length; i++) { let [x0, y0] = cl[i - 1], [x1, y1] = cl[i]; let seg = Math.hypot(x1 - x0, y1 - y0); while (acc + seg >= step) { const t = (step - acc) / seg; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; st.push([x0, y0]); seg = Math.hypot(x1 - x0, y1 - y0); acc = 0; } acc += seg; }
  st.push(cl[cl.length - 1]); if (st.length < 3) return null;
  const cap = capM / mpp, mn = minM / mpp, tan = i => { const a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const wl = [], wr = [];
  st.forEach((s, i) => { const [tx, ty] = tan(i), px = -ty, py = tx; for (const sg of [-1, 1]) { let e = mn, gap = 0; for (let dd = 3; dd <= cap; dd++) { if (grass(s[0] + px * dd * sg, s[1] + py * dd * sg)) { e = dd; gap = 0; } else { gap++; if (gap >= 5) break; } } (sg < 0 ? wl : wr).push(e); } });
  const sm = a => a.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; c++; } } return Math.max(mn, Math.min(cap, s / c)); });
  const swl = sm(wl), swr = sm(wr), L = [], Rr = [];
  st.forEach((s, i) => { const [tx, ty] = tan(i), px = -ty, py = tx; L.push([s[0] - px * swl[i], s[1] - py * swl[i]]); Rr.push([s[0] + px * swr[i], s[1] + py * swr[i]]); });
  const geo = [...L, ...Rr.reverse()].map(p => px2g(p[0], p[1]));
  return { pts: round6(rdp(geo, 3)) };
}

// Remove near-reversal spikes from a [lat,lng] polyline.
function despike(pts) {
  let out = pts.slice(), ch = true;
  while (ch && out.length > 2) { ch = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1], v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const d1 = Math.hypot(v1[0], v1[1]), d2 = Math.hypot(v2[0], v2[1]);
      if (!d1 || !d2) { out.splice(i, 1); ch = true; break; }
      let cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2); cs = Math.max(-1, Math.min(1, cs));
      if (Math.acos(cs) / rad > 115) { out.splice(i, 1); ch = true; break; }
    }
  }
  return out;
}

// Trace a hole's DOGLEG centreline + fairway from imagery, for an OSM-missing hole placed by
// tee+green coords (e.g. Minnippi). Routes tee → via… → green as a centre-biased shortest path
// over the grass mask, but with a STRAIGHT-LINE "tube" prior so it can't wander off the hole axis
// into a neighbouring fairway (the old failure). `via` = optional dogleg waypoints from the config;
// a quality gate falls back to the straight/waypoint line if the trace bloats. Returns
// { line:[[lat,lng]… tee→green], fairway:{pts} } or { line:[tee,…via,green] } on failure.
export async function traceHoleCorridor(tee, green, { padM = 45, mPerPx = 1.0, via = [], tubeM = 18, axisPen = 0.6, gate = 1.5 } = {}) {
  const seq = [tee, ...via, green];
  let mnLa = 99, mxLa = -99, mnLo = 999, mxLo = -999;
  for (const p of seq) { mnLa = Math.min(mnLa, p[0]); mxLa = Math.max(mxLa, p[0]); mnLo = Math.min(mnLo, p[1]); mxLo = Math.max(mxLo, p[1]); }
  const padLa = padM / 111320, padLo = padM / (111320 * Math.cos((mnLa + mxLa) / 2 * rad));
  const { width: W, height: H, channels: ch, data, bb } = await fetchTile({ minLat: mnLa - padLa, maxLat: mxLa + padLa, minLng: mnLo - padLo, maxLng: mxLo + padLo }, mPerPx);
  const g2px = (lat, lng) => [Math.round((lng - bb.minLng) / (bb.maxLng - bb.minLng) * W), Math.round((bb.maxLat - lat) / (bb.maxLat - bb.minLat) * H)];
  const px2g = (x, y) => [bb.maxLat - (y / H) * (bb.maxLat - bb.minLat), bb.minLng + (x / W) * (bb.maxLng - bb.minLng)];
  const mpp = (((bb.maxLng - bb.minLng) * 111320 * Math.cos((bb.minLat + bb.maxLat) / 2 * rad) / W) + ((bb.maxLat - bb.minLat) * 111320 / H)) / 2;
  const gr = i => { const Rr = data[i], G = data[i + 1], B = data[i + 2], bri = (Rr + G + B) / 3; return G >= Rr - 3 && G > B + 6 && bri >= 70 && bri <= 185; };
  const grass = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) grass[i] = gr(i * ch) ? 1 : 0;
  const dt = new Int32Array(W * H).fill(-1); const dq = []; for (let i = 0; i < W * H; i++) if (!grass[i]) { dt[i] = 0; dq.push(i); }
  for (let h = 0; h < dq.length; h++) { const i = dq[h], x = i % W, y = (i / W) | 0, nd = dt[i] + 1; const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]; for (const j of nb) if (j >= 0 && dt[j] < 0) { dt[j] = nd; dq.push(j); } }
  const snap = ([lat, lng]) => { let [x, y] = g2px(lat, lng); x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); if (grass[y * W + x]) return [x, y]; let best = null, bd = 1e9; for (let r = 1; r < 50; r++) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; if (grass[yy * W + xx]) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [xx, yy]; } } } if (best) break; } return best || [x, y]; };
  const CB_T = 12, CB_W = 0.4, NON = 14, tube = tubeM / mpp, base = i => grass[i] ? 1 + Math.max(0, CB_T - dt[i]) * CB_W : NON;
  // one Dijkstra segment a→b with a straight-line tube prior (perp drift beyond `tube` is penalised)
  const seg = (a, b) => {
    const [ax, ay] = snap(a), [bx, by] = snap(b), lx = bx - ax, ly = by - ay, L2 = lx * lx + ly * ly || 1;
    const perp = (x, y) => { let t = ((x - ax) * lx + (y - ay) * ly) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (ax + t * lx), y - (ay + t * ly)); };
    const N = W * H, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
    const push = (p, c) => { heap.push([c, p]); let i = heap.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break;[heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let l = 2 * i + 1, r = 2 * i + 2, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break;[heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
    const sI = ay * W + ax, gI = by * W + bx; cost[sI] = 0; push(sI, 0);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length) { const [c, i] = pop(); if (c > cost[i]) continue; if (i === gI) break; const x = i % W, y = (i / W) | 0; for (const [dx, dy, sl] of dirs) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; const j = yy * W + xx; const nc = c + sl * (base(j) + axisPen * Math.max(0, perp(xx, yy) - tube)); if (nc < cost[j]) { cost[j] = nc; prev[j] = i; push(j, nc); } } }
    if (gI !== sI && prev[gI] < 0) return null;
    let p = []; for (let i = gI; i >= 0; i = prev[i]) { p.push([i % W, (i / W) | 0]); if (i === sI) break; } return p.reverse();
  };
  let acc = []; let ok = true;
  for (let k = 0; k < seq.length - 1; k++) { const sp = seg(seq[k], seq[k + 1]); if (!sp || sp.length < 1) { ok = false; break; } acc = acc.length ? acc.concat(sp.slice(1)) : sp; }
  if (!ok || acc.length < 2) return { line: round6(seq) };
  const win = 7, sm = acc.map((p, i) => { let sx = 0, sy = 0, c = 0; for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < acc.length) { sx += acc[j][0]; sy += acc[j][1]; c++; } } return [sx / c, sy / c]; });
  sm[0] = acc[0]; sm[sm.length - 1] = acc[acc.length - 1];
  let ll = sm.map(([x, y]) => px2g(x, y)); ll[0] = tee; ll[ll.length - 1] = green;
  let line = round6(despike(rdp(ll, 5)));
  const ref = lineLen(seq);            // straight (or via-polyline) reference length
  if (lineLen(line) > ref * gate) line = round6(seq);   // gate: bloated trace → fall back
  // fairway ribbon around the line
  const cl = line.map(p => g2px(p[0], p[1])), stepPx = 8 / mpp, dense = [cl[0]]; let acc2 = 0;
  for (let i = 1; i < cl.length; i++) { let [x0, y0] = cl[i - 1], [x1, y1] = cl[i]; let s2 = Math.hypot(x1 - x0, y1 - y0); while (acc2 + s2 >= stepPx) { const t = (stepPx - acc2) / s2; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; dense.push([x0, y0]); s2 = Math.hypot(x1 - x0, y1 - y0); acc2 = 0; } acc2 += s2; }
  dense.push(cl[cl.length - 1]);
  const capPx = 30 / mpp, minPx = 6 / mpp, isG = (x, y) => { x |= 0; y |= 0; if (x < 0 || x >= W || y < 0 || y >= H) return false; return !!grass[y * W + x]; };
  const tan = i => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const wl = [], wr = []; dense.forEach((s, i) => { const [tnx, tny] = tan(i), pxn = -tny, pyn = tnx; for (const sg of [-1, 1]) { let e = minPx, gap = 0; for (let dd = 3; dd <= capPx; dd++) { if (isG(s[0] + pxn * dd * sg, s[1] + pyn * dd * sg)) { e = dd; gap = 0; } else { gap++; if (gap >= 5) break; } } (sg < 0 ? wl : wr).push(e); } });
  const smW = a => a.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; c++; } } return Math.max(minPx, Math.min(capPx, s / c)); });
  const swl = smW(wl), swr = smW(wr), Lr = [], Rr = []; dense.forEach((s, i) => { const [tnx, tny] = tan(i), pxn = -tny, pyn = tnx; Lr.push([s[0] - pxn * swl[i], s[1] - pyn * swl[i]]); Rr.push([s[0] + pxn * swr[i], s[1] + pyn * swr[i]]); });
  const ring = [...Lr, ...Rr.reverse()].map(p => px2g(p[0], p[1]));
  return { line, fairway: { pts: round6(rdp(ring, 2.5)) } };
}

// ── bunkers from imagery ──────────────────────────────────────────────────────
// sand = bright tan (R≳G>B, high brightness). Water is NOT traced from imagery — dark tree
// shadows are indistinguishable from dark water in RGB; water comes from OSM hydrology (gap-fill).
const isSand = (d, i) => { const R = d[i], G = d[i + 1], B = d[i + 2], bri = (R + G + B) / 3; return bri >= 150 && R >= B + 22 && G >= B + 10 && R >= G - 6 && R <= G + 28; };
async function _ctx(pts, padM, mPerPx) {
  let mnLa = 99, mxLa = -99, mnLo = 999, mxLo = -999;
  for (const p of pts) { mnLa = Math.min(mnLa, p[0]); mxLa = Math.max(mxLa, p[0]); mnLo = Math.min(mnLo, p[1]); mxLo = Math.max(mxLo, p[1]); }
  const padLa = padM / 111320, padLo = padM / (111320 * Math.cos((mnLa + mxLa) / 2 * rad));
  const { width: W, height: H, channels: ch, data, bb } = await fetchTile({ minLat: mnLa - padLa, maxLat: mxLa + padLa, minLng: mnLo - padLo, maxLng: mxLo + padLo }, mPerPx);
  const mpp = (((bb.maxLng - bb.minLng) * 111320 * Math.cos((bb.minLat + bb.maxLat) / 2 * rad) / W) + ((bb.maxLat - bb.minLat) * 111320 / H)) / 2;
  const px2g = (x, y) => [bb.maxLat - (y / H) * (bb.maxLat - bb.minLat), bb.minLng + (x / W) * (bb.maxLng - bb.minLng)];
  return { W, H, ch, data, mpp, px2g };
}
function components(mask, W, H) {  // 4-connected; returns arrays of pixel indices
  const seen = new Uint8Array(W * H), out = [];
  for (let s = 0; s < W * H; s++) { if (!mask[s] || seen[s]) continue; const st = [s]; seen[s] = 1; const px = [];
    while (st.length) { const i = st.pop(); px.push(i); const x = i % W, y = (i / W) | 0; const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]; for (const j of nb) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; st.push(j); } }
    out.push(px); }
  return out;
}
function ellipse(px, W) {           // moment ellipse → {poly,cx,cy,a,b}
  let cx = 0, cy = 0; for (const i of px) { cx += i % W; cy += (i / W) | 0; } cx /= px.length; cy /= px.length;
  let Sxx = 0, Syy = 0, Sxy = 0; for (const i of px) { const x = i % W - cx, y = ((i / W) | 0) - cy; Sxx += x * x; Syy += y * y; Sxy += x * y; } Sxx /= px.length; Syy /= px.length; Sxy /= px.length;
  const tr = Sxx + Syy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - (Sxx * Syy - Sxy * Sxy))), l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const th = Math.abs(Sxy) > 1e-6 ? Math.atan2(l1 - Sxx, Sxy) : (Sxx >= Syy ? 0 : Math.PI / 2);
  const a = 2 * Math.sqrt(Math.max(0.5, l1)), b = 2 * Math.sqrt(Math.max(0.5, l2)), ct = Math.cos(th), sn = Math.sin(th), poly = [];
  for (let k = 0; k < 16; k++) { const t = k / 16 * 2 * Math.PI, ex = a * Math.cos(t), ey = b * Math.sin(t); poly.push([cx + ex * ct - ey * sn, cy + ex * sn + ey * ct]); }
  return { poly, cx, cy, a, b };
}
const _minDistToLine = (pt, line) => { let md = 1e9; for (let i = 1; i < line.length; i++) { const a = line[i - 1], b = line[i], n = Math.max(1, Math.round(distM(a, b) / 8)); for (let k = 0; k <= n; k++) { const t = k / n, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; const d = distM(pt, q); if (d < md) md = d; } } return md; };

// Trace sand bunkers near a hole centreline → [{pts}]. Compact blobs only (rejects cart paths).
export async function traceBunkers(centreline, { padM = 38, mPerPx = 0.5, nearM = 45, minM2 = 18, maxM2 = 340 } = {}) {
  const { W, H, ch, data, mpp, px2g } = await _ctx(centreline, padM, mPerPx);
  const mask = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) mask[i] = isSand(data, i * ch) ? 1 : 0;
  const out = [];
  for (const px of components(mask, W, H)) {
    const aM2 = px.length * mpp * mpp; if (aM2 < minM2 || aM2 > maxM2) continue;
    const e = ellipse(px, W); if (e.b < 1.5 || e.a / e.b > 3.6) continue;            // reject linear cart paths
    if (px.length / (Math.PI * e.a * e.b) < 0.5) continue;                            // reject scattered speckle (low fill)
    const cg = px2g(e.cx, e.cy); if (_minDistToLine(cg, centreline) > nearM) continue;  // greenside/fairway only
    out.push({ pts: round6(e.poly.map(([x, y]) => px2g(x, y))), _c: round6([cg])[0] });
  }
  return out;
}
