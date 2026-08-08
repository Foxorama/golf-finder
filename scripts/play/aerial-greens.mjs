// Inventory the candidate GREENS on a georeferenced aerial.
//
// For a course OSM has no holes for, the hole numbering has to be triangulated, and the thing worth
// triangulating from is the set of putting surfaces: a green is the one feature whose position is
// both unambiguous on the ground and directly useful (it sets front/centre/back). Finding them is
// much easier than it sounds on a dry-season capture, because a green is irrigated and almost
// nothing else on the property is — the fairways go pale and the rough goes brown while the greens
// stay vivid. So the discriminator is not "green" but "MUCH greener than this course's own turf",
// which is measured off the image rather than hard-coded.
//
// Trees are the one other vivid-green thing, and they separate on two counts: they are darker, and
// they are rough — a canopy has deep inter-leaf shadow where a putting surface is nearly flat. So a
// candidate must also be smooth, and roughly the size and shape of a green.
//
// Usage: node aerial-greens.mjs <aerial.png> [minM2] [maxM2]
// Prints a JSON array of {lat,lng,areaM2,widthM,circ,std} sorted by area, plus a short report on
// stderr. Everything it prints is a CANDIDATE — verify each one with crop-aerial.mjs rings before
// it goes anywhere near a config.
import fs from 'node:fs';
import { decodePNG } from './lib-png.mjs';

const [, , inPng, minS, maxS] = process.argv;
if (!inPng) { console.error('usage: node aerial-greens.mjs <aerial.png> [minM2] [maxM2]'); process.exit(1); }
const MIN_M2 = +(minS || 260), MAX_M2 = +(maxS || 2200);

const { bb } = JSON.parse(fs.readFileSync(inPng.replace(/\.png$/, '') + '.json', 'utf8'));
const { width: W, height: H, channels: CH, data: D } = decodePNG(fs.readFileSync(inPng));
const rad = Math.PI / 180;
const mPerPx = (bb.maxLng - bb.minLng) * 111320 * Math.cos(((bb.minLat + bb.maxLat) / 2) * rad) / W;
const px2ll = (x, y) => [bb.maxLat - y / H * (bb.maxLat - bb.minLat), bb.minLng + x / W * (bb.maxLng - bb.minLng)];

// "greenness" that survives a dry capture: how far the green channel leads the other two.
const gness = i => D[i + 1] - (D[i] + D[i + 2]) / 2;
const bri = i => (D[i] + D[i + 1] + D[i + 2]) / 3;

// Calibrate the cut off the image itself rather than guessing: take the greenness distribution over
// the mid-brightness pixels (turf, not shadow and not roof) and cut near its top. Grass that is
// merely alive sits in the bulk; irrigated putting surface sits in the tail.
const samples = [];
for (let i = 0; i < W * H; i++) { const o = i * CH, b = bri(o); if (b > 60 && b < 200) samples.push(gness(o)); }
samples.sort((a, b) => a - b);
const q = f => samples[Math.min(samples.length - 1, Math.floor(samples.length * f))];
const GCUT = Math.max(14, q(0.93));
console.error(`greenness cut ${GCUT} (median ${q(0.5)}, p99 ${q(0.99)}), ${mPerPx.toFixed(3)} m/px`);

// smoothness over a 5-px cross of the green channel — canopy is rough, putting surface is not
const rough = (x, y) => {
  let mn = 255, mx = 0;
  for (const [dx, dy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy));
    const g = D[(yy * W + xx) * CH + 1]; if (g < mn) mn = g; if (g > mx) mx = g;
  }
  return mx - mn;
};

const mask = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, o = i * CH, b = bri(o);
  if (b < 72 || b > 205) continue;               // shadow / canopy dark, or blown-out sand & roof
  if (gness(o) < GCUT) continue;
  if (rough(x, y) > 26) continue;                // texture: excludes tree canopy
  mask[i] = 1;
}

// connected components (4-neighbour, iterative flood so a big blob can't blow the stack)
const seen = new Uint8Array(W * H), out = [];
const minPx = MIN_M2 / (mPerPx * mPerPx), maxPx = MAX_M2 / (mPerPx * mPerPx);
for (let s = 0; s < W * H; s++) {
  if (!mask[s] || seen[s]) continue;
  const stack = [s]; seen[s] = 1; const cell = [];
  while (stack.length) {
    const p = stack.pop(); cell.push(p);
    const x = p % W, y = (p - x) / W;
    if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
    if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
    if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
    if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
  }
  if (cell.length < minPx || cell.length > maxPx) continue;
  let sx = 0, sy = 0, mnx = W, mxx = 0, mny = H, mxy = 0;
  for (const p of cell) { const x = p % W, y = (p - x) / W; sx += x; sy += y; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
  const cx = sx / cell.length, cy = sy / cell.length;
  const bw = (mxx - mnx + 1), bh = (mxy - mny + 1);
  const fill = cell.length / (bw * bh);                       // blobbiness vs a straggly corridor
  const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
  if (fill < 0.42 || aspect > 3.4) continue;                  // a green is compact and not a ribbon
  const [lat, lng] = px2ll(cx, cy);
  out.push({
    lat: +lat.toFixed(6), lng: +lng.toFixed(6),
    areaM2: Math.round(cell.length * mPerPx * mPerPx),
    widthM: Math.round(Math.max(bw, bh) * mPerPx),
    fill: +fill.toFixed(2), aspect: +aspect.toFixed(2),
  });
}
out.sort((a, b) => b.areaM2 - a.areaM2);
console.error(`${out.length} candidates in ${MIN_M2}-${MAX_M2} m2`);
console.log(JSON.stringify(out, null, 1));
