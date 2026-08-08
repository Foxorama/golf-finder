// Minimal pure-Node PNG codec (8-bit RGB/RGBA, non-interlaced) — enough to read
// the aerial-imagery exports the fairway tracer fetches, and to write crops back out.
// Uses Node's built-in zlib so the build pipeline stays dependency-free (no npm).
// Not a general PNG library.
import zlib from 'node:zlib';
const PAETH = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, plte = null; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('only 8-bit PNG supported (got ' + bitDepth + ')');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 3 ? 1 : 0;
  if (!ch) throw new Error('unsupported PNG colorType ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filt = raw[y * (stride + 1)], rowI = y * (stride + 1) + 1, rowO = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[rowO + x - ch] : 0, b = y > 0 ? out[rowO - stride + x] : 0, c = (x >= ch && y > 0) ? out[rowO - stride + x - ch] : 0;
      let v = raw[rowI + x];
      if (filt === 1) v += a; else if (filt === 2) v += b; else if (filt === 3) v += (a + b) >> 1; else if (filt === 4) v += PAETH(a, b, c);
      out[rowO + x] = v & 0xff;
    }
  }
  if (colorType === 3) {        // indexed → expand to RGB via the PLTE palette
    if (!plte) throw new Error('indexed PNG without PLTE');
    const rgb = Buffer.alloc(width * height * 3);
    for (let p = 0; p < width * height; p++) { const idx = out[p] * 3; rgb[p * 3] = plte[idx]; rgb[p * 3 + 1] = plte[idx + 1]; rgb[p * 3 + 2] = plte[idx + 2]; }
    return { width, height, channels: 3, data: rgb };
  }
  return { width, height, channels: ch, data: out };   // data = row-major RGB(A)
}

// ── encoder ──────────────────────────────────────────────────────────────────────
// Writes an 8-bit RGB PNG with no per-row filtering (filter 0). Deliberately dumb:
// the point is to get a decoded/cropped/annotated raster back onto disk as a file a
// viewer can open, not to compete with a real encoder on size.
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
export function encodePNG(width, height, rgb) {
  const stride = width * 3, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {                       // filter byte 0 + the row
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
