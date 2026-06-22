// Build a course from HAND-TRACED geometry (trace-tool.html export) + a scorecard config.
// The traced JSON supplies accurate positions (tees, green polygons, centrelines, fairways,
// bunkers, water); the config supplies the numbers (par, SI, per-tee card distances, CR/Slope,
// teeSets). Output matches gap-fill.mjs: { play, geom } → bake with ../bake-play-course.mjs.
//
// Usage:  node from-traced.mjs <course.traced.json> <course.config.json>  ->  <traced>_built.json
import fs from 'node:fs';
import { distM, bearing, dest, centroid, bbox as bboxOf, simp, round6, rad } from './lib-geo.mjs';

const [, , tracedPath, cfgPath] = process.argv;
if (!tracedPath || !cfgPath) { console.error('usage: node from-traced.mjs <traced.json> <config.json>'); process.exit(1); }
const traced = JSON.parse(fs.readFileSync(tracedPath, 'utf8').replace(/^﻿/, ''));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, ''));
const r7 = v => +v.toFixed(7);
const byN = {}; for (const h of cfg.holes) byN[h.n] = h;
const ovalM = cfg.options?.greenOvalM ?? 26, HALF = (ovalM / 2) / 111320;
const ovalGbb = c => { const dLng = HALF / Math.cos(c[0] * rad); return [r7(c[0] - HALF), r7(c[1] - dLng), r7(c[0] + HALF), r7(c[1] + dLng)]; };
const ovalPts = gbb => { const [a, b, d, e] = gbb, cLa = (a + d) / 2, cLo = (b + e) / 2, sLa = (d - a) / 2, sLo = (e - b) / 2, o = []; for (let k = 0; k < 20; k++) { const t = k / 20 * 2 * Math.PI; o.push([+(cLa + sLa * Math.cos(t)).toFixed(6), +(cLo + sLo * Math.sin(t)).toFixed(6)]); } return o; };

const holes = [], lines = {}, feats = [], qa = [];
for (let n = 1; n <= (cfg.course?.holesN || 18); n++) {
  const t = traced.holes?.[n], hc = byN[n]; if (!hc) { qa.push(`h${n}: no scorecard config`); continue; }
  if (!t) { qa.push(`h${n}: not traced — skipped`); continue; }
  const card = hc.tees || {}, white = card.white;
  // green polygon → centre + bbox + feature; else fall back to config/placed green + oval
  let cen, gbb;
  if (t.green && t.green.length >= 3) { cen = centroid(t.green).map(r7); gbb = bboxOf(t.green).map(r7); feats.push({ t: 'green', pts: simp(t.green) }); }
  else if (hc.green) { cen = hc.green.map(r7); gbb = ovalGbb(cen); feats.push({ t: 'green', pts: ovalPts(gbb) }); qa.push(`h${n}: no traced green — oval from config`); }
  else { qa.push(`h${n}: no green at all`); continue; }
  // tee: clicked white tee, else config tee, else card-place not possible without a line start
  const whiteTee = t.tees?.white || hc.tee; if (!whiteTee) { qa.push(`h${n}: no tee`); continue; }
  const tee = whiteTee.map(r7);
  // centreline: traced, else [tee, cen]
  const line = (t.centreline && t.centreline.length >= 2) ? round6(t.centreline) : [tee, cen];
  lines[n] = line;
  // per-tee positions: use clicked tees where present; derive the rest from card deltas along the play line
  const tees = {}; const back = bearing(line[1] || cen, line[0]);
  for (const k of Object.keys(card)) {
    if (t.tees?.[k]) tees[k] = t.tees[k].map(r7);
    else if (white != null) tees[k] = k === 'white' ? tee : dest(tee, back, card[k] - white).map(r7);
  }
  if (Object.keys(tees).length) tees.white = tees.white || tee;
  holes.push({ n, par: hc.par, si: hc.si, tee, ...(Object.keys(tees).length ? { tees } : {}), cen, pin: null, gbb });
  // traced area features (polygons ≥3 pts) and line features (creek/OB/path ≥2 pts) → geom features
  if (t.fairway && t.fairway.length >= 3) feats.push({ t: 'fairway', pts: simp(t.fairway) });
  for (const b of t.bunkers || []) if (b.length >= 3) feats.push({ t: 'bunker', pts: simp(b) });
  for (const w of t.water || []) if (w.length >= 3) feats.push({ t: 'water', pts: simp(w) });
  for (const r of t.rough || []) if (r.length >= 3) feats.push({ t: 'rough', pts: simp(r) });
  for (const tr of t.trees || []) if (tr.length >= 3) feats.push({ t: 'trees', pts: simp(tr) });
  for (const bd of t.buildings || []) if (bd.length >= 3) feats.push({ t: 'building', pts: simp(bd) });
  for (const ck of t.creeks || []) if (ck.length >= 2) feats.push({ t: 'creek', pts: simp(ck) });
  for (const o of t.ob || []) if (o.length >= 2) feats.push({ t: 'ob', pts: simp(o) });
  for (const p of t.paths || []) if (p.length >= 2) feats.push({ t: 'path', pts: simp(p) });
  for (const dt of t.ditch || []) if (dt.length >= 2) feats.push({ t: 'ditch', pts: simp(dt) });
  for (const wa of t.waste || []) if (wa.length >= 3) feats.push({ t: 'waste', pts: simp(wa) });
  for (const nv of t.native || []) if (nv.length >= 3) feats.push({ t: 'native', pts: simp(nv) });
  for (const tb of t.teeboxes || []) if (tb.length >= 3) feats.push({ t: 'tee', pts: simp(tb) });   // tee box → reuse the 'tee' renderer
  for (const br of t.bridges || []) if (br.length >= 3) feats.push({ t: 'bridge', pts: simp(br) });
  // point markers — pts is a single [lat,lng] wrapped as one-vertex array
  for (const m of t.mk100 || []) feats.push({ t: 'mk100', pts: [m] });
  for (const m of t.mk150 || []) feats.push({ t: 'mk150', pts: [m] });
  for (const m of t.mk200 || []) feats.push({ t: 'mk200', pts: [m] });
  for (const m of t.dz    || []) feats.push({ t: 'dz',    pts: [m] });
  // cross-check vs card length
  if (white != null) { const d = Math.round(distM(tee, cen)); if (Math.abs(d - white) > white * 0.2) qa.push(`h${n}: tee→green ${d} m vs card ${white} m (>20%)`); }
}
const c = cfg.course, parSum = holes.reduce((s, h) => s + h.par, 0);
const play = { name: cfg.name, par: c.par ?? parSum, holesN: holes.length, ...(c.cr != null ? { cr: c.cr } : {}), ...(c.slope != null ? { slope: c.slope } : {}), ...(c.defaultTee ? { defaultTee: c.defaultTee } : {}), ...(c.teeSets ? { teeSets: c.teeSets } : {}), ...(c.src != null ? { src: c.src } : {}), holes };
const out = { play, geom: { features: feats, lines } };
const outPath = tracedPath.replace(/\.json$/, '_built.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const cnt = t => feats.filter(f => f.t === t).length;
console.error(`holes=${holes.length} par=${parSum} | greens ${cnt('green')} fairways ${cnt('fairway')} bunkers ${cnt('bunker')} water ${cnt('water')} creeks ${cnt('creek')} rough ${cnt('rough')} trees ${cnt('trees')} buildings ${cnt('building')} ob ${cnt('ob')} paths ${cnt('path')} | lines=${Object.keys(lines).length} | tees ${holes.filter(h => h.tees).length}/${holes.length}`);
console.error('QA:' + (qa.length ? '\n  - ' + qa.join('\n  - ') : ' all traced'));
console.error('-> ' + outPath);
