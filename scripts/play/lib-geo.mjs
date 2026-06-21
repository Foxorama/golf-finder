// Geometry helpers for the open-data Play build pipeline. Pure Node, no deps.
export const R = 6371000, rad = Math.PI / 180;
export const distM = (a, b) => {        // a,b = [lat,lng]
  const dla = (b[0] - a[0]) * rad, dlo = (b[1] - a[1]) * rad;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const bearing = (a, b) => {       // deg a->b
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
};
export const dest = (p, brgDeg, d) => {  // move from p by d metres along bearing
  const br = brgDeg * rad, la1 = p[0] * rad, lo1 = p[1] * rad, dr = d / R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
  return [la2 / rad, lo2 / rad];
};
export const centroid = pts => { let la = 0, lo = 0; for (const p of pts) { la += p[0]; lo += p[1]; } return [la / pts.length, lo / pts.length]; };
export const bbox = pts => { let mnLa = 99, mnLo = 999, mxLa = -99, mxLo = -999; for (const p of pts) { mnLa = Math.min(mnLa, p[0]); mxLa = Math.max(mxLa, p[0]); mnLo = Math.min(mnLo, p[1]); mxLo = Math.max(mxLo, p[1]); } return [mnLa, mnLo, mxLa, mxLo]; };
// walk d metres from pts[0] toward pts[end] (extrapolates past the end if needed)
export const pointAlong = (pts, d) => {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) { const seg = distM(pts[i - 1], pts[i]); if (acc + seg >= d) { const t = (d - acc) / seg; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } acc += seg; }
  const n = pts.length, A = pts[n - 2], B = pts[n - 1], seg = distM(A, B), t = 1 + (d - acc) / seg;
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
};
export const lineLen = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += distM(pts[i - 1], pts[i]); return d; };
// Ramer–Douglas–Peucker on [lat,lng] with metric tolerance
const perp = (p, a, b) => { const lat0 = a[0] * rad, kx = 111320 * Math.cos(lat0), ky = 110540; const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky, L = bx * bx + by * by; if (!L) return Math.hypot(px, py); const t = Math.max(0, Math.min(1, (px * bx + py * by) / L)); return Math.hypot(px - t * bx, py - t * by); };
export function rdp(pts, eps) { if (pts.length < 3) return pts.slice(); let dm = 0, idx = 0; for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], pts[0], pts[pts.length - 1]); if (d > dm) { dm = d; idx = i; } } return dm > eps ? rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps)) : [pts[0], pts[pts.length - 1]]; }
export const round6 = pts => pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
export const simp = (pts, eps = 2.0) => round6(rdp(pts, eps));
