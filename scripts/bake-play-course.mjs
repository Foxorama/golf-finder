// Bake a built course (from build-play-course.mjs) into the app:
//   - COURSE_PLAY entry -> inline in index.html (small: holes + tee/cen/gbb)
//   - hole-map geometry -> play-geom/<slug>.json (lazy-loaded on open; kept OUT of index.html)
// Usage: node bake-play-course.mjs <index.html> <slug> <built.json>
import fs from 'fs';
import path from 'path';
const [, , indexPath, slug, builtPath] = process.argv;
const built = JSON.parse(fs.readFileSync(builtPath, 'utf8').replace(/^﻿/, ''));
let html = fs.readFileSync(indexPath, 'utf8');
const EOL = html.includes('\r\n') ? '\r\n' : '\n';

if (html.includes(`'${slug}':`) || html.includes(`"${slug}":`)) { console.error('ABORT: slug already present'); process.exit(1); }

// --- COURSE_PLAY entry (formatted like St Lucia), inserted before the "};" that closes COURSE_PLAY ---
const p = built.play;
const teeStr = t => `[${t.join(',')}]`;
const holeLines = p.holes.map(h => {
  const si = h.si != null ? `, si:${h.si}` : '';
  const tees = h.tees ? `, tees:{${Object.keys(h.tees).map(k => `${k}:${teeStr(h.tees[k])}`).join(',')}}` : '';
  return `      {n:${h.n}, par:${h.par}${si}, tee:[${h.tee.join(',')}]${tees}, cen:[${h.cen.join(',')}], pin:${h.pin === null ? 'null' : '[' + h.pin.join(',') + ']'}, gbb:[${h.gbb.join(',')}]},`;
}).join(EOL);
// course-level ratings / multi-tee fields, emitted only when the built file carries them
const hdr = [p.cr != null ? `cr:${p.cr}` : null, p.slope != null ? `slope:${p.slope}` : null,
  p.src != null ? `src:'${String(p.src).replace(/'/g, "\\'")}'` : null,
  p.defaultTee ? `defaultTee:'${p.defaultTee}'` : null,
  p.teeSets ? `teeSets:[${p.teeSets.map(t => `{key:'${t.key}',name:'${t.name}',cr:${t.cr},slope:${t.slope}}`).join(',')}]` : null].filter(Boolean).join(', ');
const playEntry =
  `  '${slug}': {${EOL}` +
  `    name:'${p.name.replace(/'/g, "\\'")}', par:${p.par}, holesN:${p.holesN}${hdr ? ', ' + hdr : ''},${EOL}` +
  `    holes:[${EOL}${holeLines}${EOL}    ],${EOL}  },`;

const anchor = html.indexOf('const COURSE_GEOM');     // COURSE_PLAY closes just before this
if (anchor < 0) { console.error('ABORT: COURSE_GEOM anchor not found'); process.exit(1); }
const playClose = html.lastIndexOf(EOL + '};', anchor);
if (playClose < 0) { console.error('ABORT: COURSE_PLAY close not found'); process.exit(1); }
html = html.slice(0, playClose) + EOL + playEntry + html.slice(playClose);
fs.writeFileSync(indexPath, html);   // utf8 no BOM, EOL preserved

// --- geometry -> external lazy-loaded file ---
const geomDir = path.join(path.dirname(indexPath), 'play-geom');
fs.mkdirSync(geomDir, { recursive: true });
const geomJson = JSON.stringify(built.geom);
fs.writeFileSync(path.join(geomDir, slug + '.json'), geomJson);

console.error('baked ' + slug + ': COURSE_PLAY inline (holes=' + p.holes.length + ' par=' + p.par + '); geometry -> play-geom/' + slug + '.json (' + (geomJson.length / 1024).toFixed(1) + ' KB, ' + built.geom.features.length + ' features)');
