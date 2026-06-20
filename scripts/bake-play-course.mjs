// Bake a built course (from build-play.mjs) into index.html's COURSE_PLAY + COURSE_GEOM.
// Usage: node bake-play.mjs <index.html> <slug> <built.json>
import fs from 'fs';
const [, , indexPath, slug, builtPath] = process.argv;
const built = JSON.parse(fs.readFileSync(builtPath, 'utf8').replace(/^﻿/, ''));
let html = fs.readFileSync(indexPath, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n';

if (html.includes(`'${slug}':`) || html.includes(`"${slug}":`)) { console.error('ABORT: slug already present'); process.exit(1); }

// --- COURSE_PLAY entry (formatted like St Lucia) ---
const p = built.play;
const holeLines = p.holes.map(h =>
  `      {n:${h.n}, par:${h.par}, tee:[${h.tee.join(',')}], cen:[${h.cen.join(',')}], pin:${h.pin === null ? 'null' : '[' + h.pin.join(',') + ']'}, gbb:[${h.gbb.join(',')}]},`
).join(EOL);
const playEntry =
  `  '${slug}': {${EOL}` +
  `    name:'${p.name.replace(/'/g, "\\'")}', par:${p.par}, holesN:${p.holesN},${EOL}` +
  `    holes:[${EOL}${holeLines}${EOL}    ],${EOL}  },`;

// insert before the "};" that closes COURSE_PLAY (the last "\n};" before COURSE_GEOM)
const geomIdx = html.indexOf('const COURSE_GEOM=');
if (geomIdx < 0) { console.error('ABORT: COURSE_GEOM not found'); process.exit(1); }
const closeNeedle = EOL + '};';
const playClose = html.lastIndexOf(closeNeedle, geomIdx);
if (playClose < 0) { console.error('ABORT: COURSE_PLAY close not found'); process.exit(1); }
html = html.slice(0, playClose) + EOL + playEntry + html.slice(playClose);

// --- COURSE_GEOM entry (compact JSON, appended to the object literal) ---
const cgStart = html.indexOf('const COURSE_GEOM=');
const cgSemi = html.indexOf(';', cgStart);            // end of the statement
if (cgSemi < 0 || html[cgSemi - 1] !== '}') { console.error('ABORT: COURSE_GEOM terminator unexpected'); process.exit(1); }
const geomJson = ',' + JSON.stringify(slug) + ':' + JSON.stringify(built.geom);
html = html.slice(0, cgSemi - 1) + geomJson + html.slice(cgSemi - 1);

fs.writeFileSync(indexPath, html);   // utf8 no BOM, EOL preserved
console.error('baked ' + slug + ': COURSE_PLAY holes=' + p.holes.length + ' par=' + p.par + ', COURSE_GEOM features=' + built.geom.features.length + ' lines=' + Object.keys(built.geom.lines).length);
