// Open aerial imagery → traced fairway corridors. Fetches georeferenced Esri World
// Imagery (OSM-tracing-approved), classifies the grass corridor between tree lines, and
// marches the hole centreline to a ribbon polygon. All geometry in Node (lib-geo); PNG via
// lib-png. The mown-fairway/rough edge isn't separable in this imagery — the tree-bounded
// grass corridor is, so that's what's traced (see the play-triangulation notes).
import { decodePNG } from './lib-png.mjs';
import { distM, rdp, round6, rad } from './lib-geo.mjs';

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

// Trace one hole's fairway. centreline = [[lat,lng]…] tee→green. Returns {pts} (closed ring) or null.
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
  // resample centreline densely (px space)
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

// Remove near-reversal spikes (endpoint snap / pixel artefacts) from a [lat,lng] polyline.
function despike(pts) {
  let out = pts.slice(), ch = true;
  while (ch && out.length > 2) { ch = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const d1 = Math.hypot(v1[0], v1[1]), d2 = Math.hypot(v2[0], v2[1]);
      if (!d1 || !d2) { out.splice(i, 1); ch = true; break; }
      let cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2); cs = Math.max(-1, Math.min(1, cs));
      if (Math.acos(cs) / rad > 115) { out.splice(i, 1); ch = true; break; }
    }
  }
  return out;
}

// Trace a whole hole's DOGLEG centreline + fairway corridor from imagery, for an OSM-missing
// hole placed by tee+green coords (the no-OSM-line case, e.g. Minnippi). Finds the grass-corridor
// route as a centre-biased shortest path (Dijkstra over the green-turf mask, weighted toward the
// corridor centre via a distance transform), smooths/de-spikes it, then traces a ribbon around it.
// Returns { line:[[lat,lng]… tee→green], fairway:{pts} }, or { line:[tee,green] } on failure.
export async function traceHoleCorridor(tee, green, { padM = 45, mPerPx = 1.0 } = {}) {
  const mnLa = Math.min(tee[0], green[0]), mxLa = Math.max(tee[0], green[0]);
  const mnLo = Math.min(tee[1], green[1]), mxLo = Math.max(tee[1], green[1]);
  const padLa = padM / 111320, padLo = padM / (111320 * Math.cos((mnLa + mxLa) / 2 * rad));
  const { width: W, height: H, channels: ch, data, bb } = await fetchTile(
    { minLat: mnLa - padLa, maxLat: mxLa + padLa, minLng: mnLo - padLo, maxLng: mxLo + padLo }, mPerPx);
  const g2px = (lat, lng) => [Math.round((lng - bb.minLng) / (bb.maxLng - bb.minLng) * W), Math.round((bb.maxLat - lat) / (bb.maxLat - bb.minLat) * H)];
  const px2g = (x, y) => [bb.maxLat - (y / H) * (bb.maxLat - bb.minLat), bb.minLng + (x / W) * (bb.maxLng - bb.minLng)];
  const mpp = (((bb.maxLng - bb.minLng) * 111320 * Math.cos((bb.minLat + bb.maxLat) / 2 * rad) / W) + ((bb.maxLat - bb.minLat) * 111320 / H)) / 2;
  // grass corridor mask (fairway + green rough; looser than putting-green, excludes sand/trees)
  const gr = i => { const Rr = data[i], G = data[i + 1], B = data[i + 2], bri = (Rr + G + B) / 3; return G >= Rr - 3 && G > B + 6 && bri >= 70 && bri <= 185; };
  const grass = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) grass[i] = gr(i * ch) ? 1 : 0;
  // distance transform: px-distance from nearest non-grass (corridor-centre bias)
  const dt = new Int32Array(W * H).fill(-1); const q = []; for (let i = 0; i < W * H; i++) if (!grass[i]) { dt[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0, nd = dt[i] + 1; const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]; for (const j of nb) if (j >= 0 && dt[j] < 0) { dt[j] = nd; q.push(j); } }
  const snap = ([lat, lng]) => { let [x, y] = g2px(lat, lng); x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); if (grass[y * W + x]) return [x, y]; let best = null, bd = 1e9; for (let r = 1; r < 50; r++) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; if (grass[yy * W + xx]) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [xx, yy]; } } } if (best) break; } return best || [x, y]; };
  const [tx, ty] = snap(tee), [gx, gy] = snap(green);
  const Nn = W * H, cost = new Float64Array(Nn).fill(Infinity), prev = new Int32Array(Nn).fill(-1);
  const CB_T = 12, CB_W = 0.4, NON = 14, wgt = i => grass[i] ? 1 + Math.max(0, CB_T - dt[i]) * CB_W : NON;
  const heap = [], push = (p, c) => { heap.push([c, p]); let i = heap.length - 1; while (i > 0) { const par = (i - 1) >> 1; if (heap[par][0] <= heap[i][0]) break;[heap[par], heap[i]] = [heap[i], heap[par]]; i = par; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let l = 2 * i + 1, r = 2 * i + 2, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break;[heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  const sIdx = ty * W + tx, gIdx = gy * W + gx; cost[sIdx] = 0; push(sIdx, 0);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  while (heap.length) { const [c, i] = pop(); if (c > cost[i]) continue; if (i === gIdx) break; const x = i % W, y = (i / W) | 0; for (const [dx, dy, sl] of dirs) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; const j = yy * W + xx; const nc = c + sl * wgt(j); if (nc < cost[j]) { cost[j] = nc; prev[j] = i; push(j, nc); } } }
  let path = []; for (let i = gIdx; i >= 0; i = prev[i]) { path.push(i); if (i === sIdx) break; } path.reverse();
  if (path[0] !== sIdx) return { line: [tee, green] };
  const px = path.map(i => [i % W, (i / W) | 0]);
  const win = 7, sm = px.map((p, i) => { let sx = 0, sy = 0, c = 0; for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < px.length) { sx += px[j][0]; sy += px[j][1]; c++; } } return [sx / c, sy / c]; });
  sm[0] = px[0]; sm[sm.length - 1] = px[px.length - 1];
  let ll = sm.map(([x, y]) => px2g(x, y)); ll[0] = tee; ll[ll.length - 1] = green;
  const line = round6(despike(rdp(ll, 5)));
  // fairway ribbon around the traced centreline
  const cl = line.map(p => g2px(p[0], p[1])), stepPx = 8 / mpp, dense = [cl[0]]; let acc = 0;
  for (let i = 1; i < cl.length; i++) { let [x0, y0] = cl[i - 1], [x1, y1] = cl[i]; let seg = Math.hypot(x1 - x0, y1 - y0); while (acc + seg >= stepPx) { const t = (stepPx - acc) / seg; x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; dense.push([x0, y0]); seg = Math.hypot(x1 - x0, y1 - y0); acc = 0; } acc += seg; }
  dense.push(cl[cl.length - 1]);
  const capPx = 30 / mpp, minPx = 6 / mpp, isG = (x, y) => { x |= 0; y |= 0; if (x < 0 || x >= W || y < 0 || y >= H) return false; return !!grass[y * W + x]; };
  const tan = i => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const wl = [], wr = []; dense.forEach((s, i) => { const [tnx, tny] = tan(i), pxn = -tny, pyn = tnx; for (const sg of [-1, 1]) { let e = minPx, gap = 0; for (let dd = 3; dd <= capPx; dd++) { if (isG(s[0] + pxn * dd * sg, s[1] + pyn * dd * sg)) { e = dd; gap = 0; } else { gap++; if (gap >= 5) break; } } (sg < 0 ? wl : wr).push(e); } });
  const smW = a => a.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; c++; } } return Math.max(minPx, Math.min(capPx, s / c)); });
  const swl = smW(wl), swr = smW(wr), Lr = [], Rr = []; dense.forEach((s, i) => { const [tnx, tny] = tan(i), pxn = -tny, pyn = tnx; Lr.push([s[0] - pxn * swl[i], s[1] - pyn * swl[i]]); Rr.push([s[0] + pxn * swr[i], s[1] + pyn * swr[i]]); });
  const ring = [...Lr, ...Rr.reverse()].map(p => px2g(p[0], p[1]));
  return { line, fairway: { pts: round6(rdp(ring, 2.5)) } };
}
