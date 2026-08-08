// Refine a hand-seeded green (or tee) position against a georeferenced aerial.
//
// The fully-absent-OSM path in the add-play-course skill: with no golf=hole ways to anchor to,
// every green is placed by eye off the imagery, and by-eye is worth about a green's radius. This
// pulls the estimate onto the putting surface itself.
//
// A green is the smoothest lush turf in its neighbourhood: it reads brighter and greener than the
// surrounding rough, and — the part that actually separates it from the fairway apron it touches —
// it has almost no local texture, where fairway carries mower stripes and rough carries speckle. So
// each pixel is weighted by lushness AND by a Gaussian falloff from the seed AND by 1/(1+(localStd/k)^2),
// and the weighted mean is iterated to convergence (mean-shift). The apron loses on texture even
// where it ties on colour.
//
// Usage: node aerial-centroid.mjs <aerial.png> <lat> <lng> [radiusM] [sigmaM] [kind]
//   kind: green (default) | tee     — tee boxes are smaller, so they use a tighter kernel
// Prints JSON {lat,lng,movedM,px,frac} — frac is the share of the kernel that looked like turf,
// which is the honesty check: a low frac means the seed was not on grass and the answer is noise.
import fs from 'node:fs';
import { decodePNG } from './lib-png.mjs';
import { distM } from './lib-geo.mjs';

const [, , inPng, latS, lngS, radS, sigS, kindS] = process.argv;
if (!lngS) { console.error('usage: node aerial-centroid.mjs <aerial.png> <lat> <lng> [radiusM] [sigmaM] [green|tee]'); process.exit(1); }
const kind = (kindS || 'green').toLowerCase();
const radiusM = +(radS || (kind === 'tee' ? 16 : 22));
const sigmaM = +(sigS || (kind === 'tee' ? 7 : 9));

const meta = JSON.parse(fs.readFileSync(inPng.replace(/\.png$/, '') + '.json', 'utf8'));
const bb = meta.bb;
const { width: W, height: H, channels: CH, data: D } = decodePNG(fs.readFileSync(inPng));
const rad = Math.PI / 180;
const ll2px = (la, lo) => [(lo - bb.minLng) / (bb.maxLng - bb.minLng) * W, (bb.maxLat - la) / (bb.maxLat - bb.minLat) * H];
const px2ll = (x, y) => [bb.maxLat - y / H * (bb.maxLat - bb.minLat), bb.minLng + x / W * (bb.maxLng - bb.minLng)];
const mPerPx = (bb.maxLng - bb.minLng) * 111320 * Math.cos(((bb.minLat + bb.maxLat) / 2) * rad) / W;

const at = (x, y) => { const i = (y * W + x) * CH; return [D[i], D[i + 1], D[i + 2]]; };
// lush mown turf: green channel leads, and it is neither shadow-dark nor blown-out
const isTurf = (r, g, b) => g >= r + 2 && g > b + 20 && (r + g + b) / 3 > 62 && (r + g + b) / 3 < 210;
// local texture over a 3x3 of the green channel — a putting surface is nearly flat
const localStd = (x, y) => {
  let s = 0, s2 = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const g = D[(yy * W + xx) * CH + 1]; s += g; s2 += g * g; n++;
  }
  const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
};

let [cx, cy] = ll2px(+latS, +lngS);
const rPx = radiusM / mPerPx, sPx = sigmaM / mPerPx;
let frac = 0;
for (let it = 0; it < 40; it++) {
  let wx = 0, wy = 0, wsum = 0, turf = 0, tot = 0;
  const x0 = Math.max(0, Math.floor(cx - rPx)), x1 = Math.min(W - 1, Math.ceil(cx + rPx));
  const y0 = Math.max(0, Math.floor(cy - rPx)), y1 = Math.min(H - 1, Math.ceil(cy + rPx));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > rPx * rPx) continue;
    tot++;
    const [r, g, b] = at(x, y); if (!isTurf(r, g, b)) continue;
    turf++;
    const sd = localStd(x, y);
    const w = Math.exp(-d2 / (2 * sPx * sPx)) * (1 / (1 + (sd / 7) ** 2));
    wx += x * w; wy += y * w; wsum += w;
  }
  frac = tot ? turf / tot : 0;
  if (!wsum) break;
  const nx = wx / wsum, ny = wy / wsum;
  const step = Math.hypot(nx - cx, ny - cy);
  cx = nx; cy = ny;
  if (step < 0.05) break;
}
const [la, lo] = px2ll(cx, cy);
console.log(JSON.stringify({
  lat: +la.toFixed(6), lng: +lo.toFixed(6),
  movedM: +distM([+latS, +lngS], [la, lo]).toFixed(1),
  frac: +frac.toFixed(2), mPerPx: +mPerPx.toFixed(3),
}));
