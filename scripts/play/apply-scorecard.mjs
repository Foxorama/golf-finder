// Overlay scorecard facts onto a build-play-course.mjs output.
//
// build-play-course.mjs emits geometry + par (from OSM) but deliberately NOT
// stroke index / CR / Slope (not in OSM). For an OSM-clean course those still
// have to come from the published card; this merges them in, and also nudges any
// hole whose OSM centreline stops short of its green so play-line-up + length +
// green ownership are right.
//
// Usage: node apply-scorecard.mjs <built.json> <config.json>
// Writes the patched <built.json> in place.

import fs from 'fs';
const [, , builtPath, cfgPath] = process.argv;
if (!builtPath || !cfgPath) { console.error('usage: node apply-scorecard.mjs <built.json> <config.json>'); process.exit(2); }
const built = JSON.parse(fs.readFileSync(builtPath, 'utf8').replace(/^﻿/, ''));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, ''));
const P = built.play, G = built.geom;

if (cfg.cr != null) P.cr = cfg.cr;
if (cfg.slope != null) P.slope = cfg.slope;
if (cfg.src) P.src = cfg.src;

// stroke index per hole — must end up a 1..18 permutation
if (cfg.si) {
  for (const h of P.holes) { const si = cfg.si[h.n] ?? cfg.si[String(h.n)]; if (si != null) h.si = si; }
  const sis = P.holes.map(h => h.si).filter(x => x != null).sort((a, b) => a - b);
  const ok = sis.length === P.holes.length && sis.every((v, i) => v === i + 1);
  console.error('SI permutation 1..' + P.holes.length + ': ' + ok + (ok ? '' : ' -> ' + sis.join(',')));
  if (!ok) process.exit(1);
}

// extend a centreline that stops short of its green so it actually reaches it
const R = 6371000, rad = Math.PI / 180;
const hav = (a, b, c, d) => { const dla = (c - a) * rad, dlo = (d - b) * rad; const x = Math.sin(dla / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
const thr = cfg.fixGreenReachM;
if (thr != null) {
  for (const h of P.holes) {
    const ln = G.lines[h.n]; if (!ln) continue;
    const end = ln[ln.length - 1];
    const gap = hav(end[0], end[1], h.cen[0], h.cen[1]);
    // skip synthetic greens (cen == line end already => gap ~0)
    if (gap > thr) {
      ln.push([+h.cen[0].toFixed(6), +h.cen[1].toFixed(6)]);
      console.error(`hole ${h.n}: centreline extended ${gap.toFixed(1)}m to reach its green`);
    }
  }
}

fs.writeFileSync(builtPath, JSON.stringify(built));
console.error(`patched ${builtPath}: cr=${P.cr} slope=${P.slope} src='${P.src}' holes=${P.holes.length} par=${P.par}`);
