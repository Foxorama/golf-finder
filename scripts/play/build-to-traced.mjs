// Convert an already-built Play course (play-geom/<slug>.json + the baked COURSE_PLAY
// tees in index.html) into a trace-tool importable <slug>.traced.json, so you DRAG the
// existing features into accurate shape in trace-tool.html instead of placing 18 holes
// from scratch. The seed greens/fairways are auto ovals/ribbons and the hazards are
// aerial-detected contours — all roughly right, ready to refine. The .traced.json is a
// local working file (re-export from the tool as you edit); not committed.
//
//   node build-to-traced.mjs <slug>
//   e.g. node build-to-traced.mjs wolston-park-golf-club
//
// Then trace in trace-tool.html (Import the file) and `from-traced.mjs <slug>.traced.json
// <slug>.config.json` to rebuild.
import fs from 'node:fs';

const slug = process.argv[2];
if (!slug) { console.error('usage: node build-to-traced.mjs <slug>'); process.exit(1); }

const r6 = v => Math.round(v * 1e6) / 1e6;
const centroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
// distance (m) from point p to a polyline — min over its segments (the _featOwner rule)
function distToLine(p, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const k = Math.cos(a[0] * Math.PI / 180);
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy) * 111320;
    if (d < best) best = d;
  }
  return best;
}

const geom = JSON.parse(fs.readFileSync(`../../play-geom/${slug}.json`, 'utf8'));
const html = fs.readFileSync('../../index.html', 'utf8').replace(/\r\n/g, '\n');

// ── parse the baked tees from the COURSE_PLAY block ───────────────────────
const start = html.indexOf(`'${slug}'`);
if (start < 0) { console.error(`slug '${slug}' not found in index.html`); process.exit(1); }
const end = html.indexOf('\n  },\n', start);
const block = html.slice(start, end);
const teesByHole = {};
// match each hole's tees:{ colour:[lat,lng], ... }
const holeRe = /\{n:(\d+),[^]*?tees:\{([^}]+)\}/g;
let m;
while ((m = holeRe.exec(block)) !== null) {
  const n = +m[1], tees = {};
  const cRe = /(\w+):\[([^\]]+)\]/g; let cm;
  while ((cm = cRe.exec(m[2])) !== null) tees[cm[1]] = cm[2].split(',').map(Number);
  teesByHole[n] = tees;
}
const N = Object.keys(geom.lines).length;
console.error(`parsed tees for ${Object.keys(teesByHole).length} holes; ${N} centrelines`);

// ── per-hole traced object ────────────────────────────────────────────────
const holes = {};
for (let n = 1; n <= N; n++) {
  holes[n] = { tees: teesByHole[n] || {}, bunkers: [], water: [], rough: [], trees: [], buildings: [], creeks: [] };
  if (geom.lines[n]) holes[n].centreline = geom.lines[n].map(p => p.map(r6));
}

// greens + fairways carry explicit `own`
for (const f of geom.features) {
  if (f.t === 'green' && f.own != null) holes[f.own].green = f.pts.map(p => p.map(r6));
  else if (f.t === 'fairway' && f.own != null) holes[f.own].fairway = f.pts.map(p => p.map(r6));
}

// hazards/scenery (no own) → assign to nearest centreline, same as the app's _featOwner
const typeToKey = { bunker: 'bunkers', water: 'water', rough: 'rough', trees: 'trees', building: 'buildings', creek: 'creeks' };
for (const f of geom.features) {
  const key = typeToKey[f.t];
  if (!key || f.own != null) continue;
  const c = centroid(f.pts);
  let best = null, bd = Infinity;
  for (let n = 1; n <= N; n++) { if (!geom.lines[n]) continue; const d = distToLine(c, geom.lines[n]); if (d < bd) { bd = d; best = n; } }
  if (best) holes[best][key].push(f.pts.map(p => p.map(r6)));
}

const name = (block.match(/name:'([^']+)'/) || [, slug])[1];
fs.writeFileSync(`${slug}.traced.json`, JSON.stringify({ name, holes }, null, 1), 'utf8');

for (let n = 1; n <= N; n++) {
  const h = holes[n];
  console.error(`H${n}: green:${h.green ? 'Y' : '—'} fw:${h.fairway ? 'Y' : '—'} cl:${h.centreline ? h.centreline.length : 0}pt tees:${Object.keys(h.tees).length} bunk:${h.bunkers.length} water:${h.water.length} rough:${h.rough.length} trees:${h.trees.length} bldg:${h.buildings.length} creek:${h.creeks.length}`);
}
console.error(`\nwrote scripts/play/${slug}.traced.json — Import it in trace-tool.html`);
