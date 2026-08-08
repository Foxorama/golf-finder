// Cut a georeferenced window out of an aerial fetched by fetch-aerial.mjs, and write it as its
// own PNG + world JSON.
//
// Why this exists: the imagery host is unreachable from the sandboxed/remote dev environment, so
// the aerial is fetched once on a runner and committed. That one file is the whole course at a
// few hundred metres across — far too coarse to judge where a green actually is by eye. Cropping
// locally gives a native-resolution look at any feature without another network round trip, and
// the crop carries its own bb so anything measured on it maps straight back to lat/lng.
//
// Usage:
//   node crop-aerial.mjs <aerial.png> <out.png> <lat> <lng> <spanM> [scale] [mark=lat,lng[,r];...]
//     lat,lng  centre of the window        spanM  window width in metres (height matches)
//     scale    integer pixel magnifier (default 1; 2-3 helps when reading a small feature)
//     mark     optional crosshair rings drawn at those coords, radius r metres (default 12) —
//              this is the registration check: fetch a crop centred on a computed green centroid
//              with a ring on it and the ring must sit on the putting surface.
import fs from 'node:fs';
import { decodePNG, encodePNG } from './lib-png.mjs';

const [, , inPng, outPng, latS, lngS, spanS, scaleS, marksS] = process.argv;
if (!spanS) { console.error('usage: node crop-aerial.mjs <aerial.png> <out.png> <lat> <lng> <spanM> [scale] [marks]'); process.exit(1); }
const lat = +latS, lng = +lngS, spanM = +spanS, scale = Math.max(1, Math.round(+(scaleS || 1)));

const meta = JSON.parse(fs.readFileSync(inPng.replace(/\.png$/, '') + '.json', 'utf8'));
const bb = meta.bb;
const img = decodePNG(fs.readFileSync(inPng));
const { width: W, height: H, channels: CH, data: D } = img;

const rad = Math.PI / 180;
const ll2px = (la, lo) => [(lo - bb.minLng) / (bb.maxLng - bb.minLng) * W, (bb.maxLat - la) / (bb.maxLat - bb.minLat) * H];
const mPerPxX = (bb.maxLng - bb.minLng) * 111320 * Math.cos(((bb.minLat + bb.maxLat) / 2) * rad) / W;
const mPerPxY = (bb.maxLat - bb.minLat) * 110540 / H;

const [cx, cy] = ll2px(lat, lng);
const halfX = spanM / 2 / mPerPxX, halfY = spanM / 2 / mPerPxY;
const x0 = Math.round(cx - halfX), y0 = Math.round(cy - halfY);
const cw = Math.round(halfX * 2), chh = Math.round(halfY * 2);
if (cw < 2 || chh < 2) { console.error('crop is empty — spanM too small for this image resolution'); process.exit(1); }

const out = Buffer.alloc(cw * scale * chh * scale * 3);
const OW = cw * scale;
for (let y = 0; y < chh * scale; y++) {
  const sy = y0 + Math.floor(y / scale);
  for (let x = 0; x < OW; x++) {
    const sx = x0 + Math.floor(x / scale), o = (y * OW + x) * 3;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) { out[o] = out[o + 1] = out[o + 2] = 40; continue; }
    const i = (sy * W + sx) * CH;
    out[o] = D[i]; out[o + 1] = D[i + 1]; out[o + 2] = D[i + 2];
  }
}

// crosshair rings, drawn in the crop's own pixel space
for (const m of (marksS || '').split(';').filter(Boolean)) {
  const [mla, mlo, mr] = m.split(',').map(Number);
  const [mx, my] = ll2px(mla, mlo);
  const px = (mx - x0) * scale, py = (my - y0) * scale;
  const rx = ((mr || 12) / mPerPxX) * scale, ry = ((mr || 12) / mPerPxY) * scale;
  for (let a = 0; a < 1440; a++) {
    const t = a / 1440 * Math.PI * 2;
    for (const k of [0.98, 1, 1.02]) {
      const x = Math.round(px + Math.cos(t) * rx * k), y = Math.round(py + Math.sin(t) * ry * k);
      if (x < 0 || y < 0 || x >= OW || y >= chh * scale) continue;
      const o = (y * OW + x) * 3; out[o] = 255; out[o + 1] = 40; out[o + 2] = 40;
    }
  }
  for (let d = -Math.round(ry * 1.5); d <= Math.round(ry * 1.5); d++) {   // centre cross
    for (const [x, y] of [[Math.round(px), Math.round(py + d)], [Math.round(px + d), Math.round(py)]]) {
      if (x < 0 || y < 0 || x >= OW || y >= chh * scale) continue;
      const o = (y * OW + x) * 3; out[o] = 255; out[o + 1] = 40; out[o + 2] = 40;
    }
  }
}

fs.writeFileSync(outPng, encodePNG(OW, chh * scale, out));
const cbb = {
  minLat: bb.maxLat - (y0 + chh) / H * (bb.maxLat - bb.minLat), maxLat: bb.maxLat - y0 / H * (bb.maxLat - bb.minLat),
  minLng: bb.minLng + x0 / W * (bb.maxLng - bb.minLng), maxLng: bb.minLng + (x0 + cw) / W * (bb.maxLng - bb.minLng),
};
fs.writeFileSync(outPng.replace(/\.png$/, '') + '.json', JSON.stringify({ bb: cbb, W: OW, H: chh * scale, scale, mPerPx: mPerPxX / scale }));
console.error(`-> ${outPng} ${OW}x${chh * scale} (${(mPerPxX / scale).toFixed(3)} m/px) centred ${lat},${lng}`);
