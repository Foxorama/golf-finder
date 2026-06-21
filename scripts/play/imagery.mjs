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
