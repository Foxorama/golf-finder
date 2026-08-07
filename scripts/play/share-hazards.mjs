// Share hazards between the holes they actually affect.
//
// A feature gets ONE owning hole (the app's _featOwner, or an explicit `own` from the trace scripts),
// chosen by whichever centreline is nearest the feature's CENTROID. That is right for a greenside
// bunker and wrong for anything sitting BETWEEN two holes: a creek running down a boundary is
// centroid-nearest to one hole, so on the other it renders as a dimmed neighbour — practically
// invisible. McLeod's 3rd tee shot carries a creek that was tagged to the 17th, so the app showed
// no water on a hole whose tee shot is a water carry. That is exactly backwards for a playability map.
//
// Fix, at the data level: a hazard whose polygon comes within `--near` metres of another hole's play
// line is in play on that hole too, so it is emitted again with that hole's `own`. Geometry is
// unchanged and duplicated — only ownership differs, so each hole draws the hazards it must carry or
// avoid at full strength.
//
// Only water and bunkers are shared. Trees and rough are context, and duplicating them would bloat
// the file for no gain in playability.
//
// Usage: node share-hazards.mjs <play-geom.json> <out.json> [--near 22] [--types water,bunker]
import fs from 'node:fs';
import { rad } from './lib-geo.mjs';

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) { console.error('usage: node share-hazards.mjs <play-geom.json> <out.json> [--near 22] [--types water,bunker]'); process.exit(1); }
const arg = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const NEAR = +arg('near', 22);
const TYPES = arg('types', 'water,bunker').split(',');

const geom = JSON.parse(fs.readFileSync(inPath, 'utf8'));
// metric distance from a point to a segment, in a local flat frame (fine at hole scale)
const segD = (p, a, b) => {
  const kx = 111320 * Math.cos(a[0] * rad);
  const P = [(p[1] - a[1]) * kx, (p[0] - a[0]) * 110540], B = [(b[1] - a[1]) * kx, (b[0] - a[0]) * 110540];
  const L = B[0] * B[0] + B[1] * B[1];
  if (!L) return Math.hypot(P[0], P[1]);
  const t = Math.max(0, Math.min(1, (P[0] * B[0] + P[1] * B[1]) / L));
  return Math.hypot(P[0] - t * B[0], P[1] - t * B[1]);
};
const lineDist = (pts, line) => {
  let d = 1e9;
  for (const p of pts) for (let i = 1; i < line.length; i++) d = Math.min(d, segD(p, line[i - 1], line[i]));
  return d;
};

const holes = Object.keys(geom.lines).map(Number).sort((a, b) => a - b);
const out = [], added = [];
for (const f of geom.features) {
  out.push(f);
  if (!TYPES.includes(f.t)) continue;
  for (const n of holes) {
    if (n === f.own) continue;
    const d = lineDist(f.pts, geom.lines[n]);
    if (d <= NEAR) { out.push({ ...f, own: n }); added.push({ t: f.t, from: f.own, to: n, d: Math.round(d) }); }
  }
}
fs.writeFileSync(outPath, JSON.stringify({ features: out, lines: geom.lines }));

console.error(`shared within ${NEAR} m: +${added.length} feature copies (${TYPES.join(',')})`);
for (const a of added) console.error(`  ${a.t} owned by h${a.from} is ${a.d} m from h${a.to}'s line -> also drawn on h${a.to}`);
const per = {};
for (const f of out) if (TYPES.includes(f.t)) { per[f.own] = per[f.own] || {}; per[f.own][f.t] = (per[f.own][f.t] || 0) + 1; }
console.error('per hole: ' + holes.map(n => `${n}:${Object.entries(per[n] || {}).map(([t, c]) => t[0] + c).join('') || '-'}`).join(' '));
console.error(`-> ${outPath} (${(JSON.stringify({ features: out, lines: geom.lines }).length / 1024).toFixed(1)} KB, ${out.length} features)`);
