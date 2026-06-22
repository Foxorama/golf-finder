// Rebake-to-REPLACE an EXISTING course (bake-play-course.mjs only ADDS — it aborts on an
// existing slug). Regenerates the COURSE_PLAY entry exactly as the baker does, splices it
// over the current entry in index.html, and overwrites play-geom/<slug>.json. Use this to
// re-ship a course after re-tracing more holes (from-traced.mjs -> this).
// Usage: node rebake-play-course.mjs <index.html> <slug> <built.json>
import fs from 'node:fs';
import path from 'node:path';
const [, , indexPath, slug, builtPath] = process.argv;
if (!indexPath || !slug || !builtPath) { console.error('usage: node rebake-play-course.mjs <index.html> <slug> <built.json>'); process.exit(1); }

const built = JSON.parse(fs.readFileSync(builtPath, 'utf8').replace(/^﻿/, ''));
let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');   // normalise; git re-applies autocrlf
const EOL = '\n';

// --- regenerate the COURSE_PLAY entry (verbatim from bake-play-course.mjs) ---
const p = built.play;
const teeStr = t => `[${t.join(',')}]`;
const holeLines = p.holes.map(h => {
  const si = h.si != null ? `, si:${h.si}` : '';
  const tees = h.tees ? `, tees:{${Object.keys(h.tees).map(k => `${k}:${teeStr(h.tees[k])}`).join(',')}}` : '';
  return `      {n:${h.n}, par:${h.par}${si}, tee:[${h.tee.join(',')}]${tees}, cen:[${h.cen.join(',')}], pin:${h.pin === null ? 'null' : '[' + h.pin.join(',') + ']'}, gbb:[${h.gbb.join(',')}]},`;
}).join(EOL);
const hdr = [p.cr != null ? `cr:${p.cr}` : null, p.slope != null ? `slope:${p.slope}` : null,
  p.src != null ? `src:'${String(p.src).replace(/'/g, "\\'")}'` : null,
  p.defaultTee ? `defaultTee:'${p.defaultTee}'` : null,
  p.teeSets ? `teeSets:[${p.teeSets.map(t => `{key:'${t.key}',name:'${t.name}',cr:${t.cr},slope:${t.slope}}`).join(',')}]` : null].filter(Boolean).join(', ');
const playEntry =
  `  '${slug}': {${EOL}` +
  `    name:'${p.name.replace(/'/g, "\\'")}', par:${p.par}, holesN:${p.holesN}${hdr ? ', ' + hdr : ''},${EOL}` +
  `    holes:[${EOL}${holeLines}${EOL}    ],${EOL}  },`;

// --- splice over the existing entry: from `  '<slug>': {` to its closing `  },` ---
const start = html.indexOf(`  '${slug}': {`);
if (start < 0) { console.error(`ABORT: existing entry for '${slug}' not found (use bake-play-course.mjs to ADD)`); process.exit(1); }
// the holes-array `]` (4-space indent, optional trailing comma) then EOL + the entry-closing `  },`
const m = html.slice(start).match(/\n {4}\],?\n {2}\},/);
if (!m) { console.error('ABORT: entry close not found'); process.exit(1); }
const end = start + m.index + m[0].length;

html = html.slice(0, start) + playEntry + html.slice(end);
fs.writeFileSync(indexPath, html);

const geomDir = path.join(path.dirname(indexPath), 'play-geom');
fs.mkdirSync(geomDir, { recursive: true });
fs.writeFileSync(path.join(geomDir, slug + '.json'), JSON.stringify(built.geom));

const ft = {}; for (const f of built.geom.features) ft[f.t] = (ft[f.t] || 0) + 1;
console.error(`rebaked ${slug}: holes=${p.holes.length} par=${p.par}; geom ${built.geom.features.length} features ${JSON.stringify(ft)}`);
