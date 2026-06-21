// Unified open-data Play build. Combines OSM (where present) with the open-data gap-fillers
// from the Oxley pilot — driven by a per-course config that carries the human-resolved bits
// (hole numbering, scorecard par/SI/CR, per-tee card distances, any OSM-missing holes).
// Output matches build-play-course.mjs: { play:{…}, geom:{features,lines} } + si/cr/slope/tees.
//
// Usage:  node gap-fill.mjs <osm-geom.json> <course-config.json>   ->  <slug>_built.json
// Config: see scripts/play/README.md (and oxley-golf-club.config.json for a worked example).
import fs from 'node:fs';
import { distM, bearing, dest, centroid, bbox as bboxOf, pointAlong, lineLen, simp, rdp, round6, rad } from './lib-geo.mjs';
import { traceFairway, traceHoleCorridor, traceBunkers } from './imagery.mjs';

const [, , osmPath, cfgPath] = process.argv;
if (!osmPath || !cfgPath) { console.error('usage: node gap-fill.mjs <osm.json> <config.json>'); process.exit(1); }
const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8').replace(/^﻿/, ''));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, ''));
const r7 = v => +v.toFixed(7);
const perpM = (p, a, b) => { const kx = 111320 * Math.cos(a[0] * rad), Px = (p[1] - a[1]) * kx, Py = (p[0] - a[0]) * 110540, Bx = (b[1] - a[1]) * kx, By = (b[0] - a[0]) * 110540, L = Bx * Bx + By * By; if (!L) return 0; const t = Math.max(0, Math.min(1, (Px * Bx + Py * By) / L)); return Math.hypot(Px - t * Bx, Py - t * By); };

// ---- parse OSM (golf features + hydrology → water) ----
const waysById = {}, greens = [], bunkers = [], feats = [];
const tmap = { green: 'green', bunker: 'bunker', tee: 'tee', water_hazard: 'water', lateral_water_hazard: 'water', fairway: 'fairway' };
const isHydro = t => t.natural === 'water' || t.water || t.landuse === 'reservoir' || t.landuse === 'basin' || t.waterway === 'riverbank';
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.tags) continue;
  const g = e.tags.golf, pts = (e.geometry || []).filter(x => x).map(x => [+x.lat, +x.lon]); if (pts.length < 2) continue;
  if (g === 'hole') { waysById[e.id] = pts; continue; }
  if (g === 'green') { const cen = centroid(pts); greens.push({ cen, bb: bboxOf(pts), pts }); }
  if (g === 'bunker') bunkers.push(centroid(pts));
  if (g && tmap[g] && g !== 'hole' && g !== 'green') feats.push({ t: tmap[g], pts: simp(pts) });
  else if (!g && isHydro(e.tags) && pts.length >= 4) feats.push({ t: 'water', pts: simp(pts) });   // OSM pond/lake/basin → water (when the query fetched it)
}
const realGreenNear = pt => { let best = null, bd = 1e9; for (const gr of greens) { const d = distM(pt, gr.cen); if (d < bd) { bd = d; best = gr; } } return bd <= 25 ? best : null; };
const bunkersNear = (pt, R = 40) => bunkers.reduce((n, b) => n + (distM(pt, b) <= R ? 1 : 0), 0);
const ovalM = cfg.options?.greenOvalM ?? 26, HALF = (ovalM / 2) / 111320;
const ovalGbb = cen => { const dLng = HALF / Math.cos(cen[0] * rad); return [r7(cen[0] - HALF), r7(cen[1] - dLng), r7(cen[0] + HALF), r7(cen[1] + dLng)]; };
const ovalPts = gbb => { const [mnLa, mnLo, mxLa, mxLo] = gbb, cLa = (mnLa + mxLa) / 2, cLo = (mnLo + mxLo) / 2, sLa = (mxLa - mnLa) / 2, sLo = (mxLo - mnLo) / 2, o = []; for (let k = 0; k < 20; k++) { const th = k / 20 * 2 * Math.PI; o.push([+(cLa + sLa * Math.cos(th)).toFixed(6), +(cLo + sLo * Math.sin(th)).toFixed(6)]); } return o; };

// ---- resolve each hole ----
const holes = [], lines = {}, qa = [], traceJobs = [];
for (const hc of cfg.holes) {
  const card = hc.tees || {}, white = card.white;
  let cen, tee, gbb, line, greenSrc, note = '';
  if (hc.way) {
    let pts = waysById[hc.way]; if (!pts) { qa.push(`h${hc.n}: WAY ${hc.way} not in OSM`); continue; }
    // green end: config override, else bunker-proximity (more bunkers within 40 m), else end nearer a real green
    let gEnd = hc.greenEnd;
    if (!gEnd) { const a = pts[0], b = pts[pts.length - 1], ba = bunkersNear(a), bb = bunkersNear(b); gEnd = ba > bb ? 'a' : bb > ba ? 'b' : (realGreenNear(a) ? 'a' : 'b'); }
    if (gEnd === 'a') pts = pts.slice().reverse();           // orient tee(first)→green(last)
    const greenPt = pts[pts.length - 1], teeEnd = pts[0];
    const rg = realGreenNear(greenPt); cen = rg ? rg.cen.map(r7) : greenPt.map(r7); greenSrc = rg ? 'osm' : 'oval';
    gbb = rg ? rg.bb.map(r7) : ovalGbb(cen);
    // white tee: explicit coord, else card-placed (overshoot holes), else OSM tee end
    if (hc.tee) tee = hc.tee.map(r7);
    else if (hc.cardPlaceWhite && white) { tee = pointAlong(pts.slice().reverse(), white).map(r7); note += ' white card-placed'; }
    else tee = teeEnd.map(r7);
    line = (hc.cardPlaceWhite || hc.tee) ? [tee, cen] : simp(pts);   // trim overshoot to tee→green
    lines[hc.n] = round6(line);
  } else if (hc.green && hc.tee) {                            // OSM-missing hole, placed by hand
    cen = hc.green.map(r7); tee = hc.tee.map(r7); gbb = ovalGbb(cen); greenSrc = 'placed'; line = [tee, cen]; lines[hc.n] = round6(line); note = ' (no OSM line — placed)';
    if (cfg.options?.traceFairways) traceJobs.push({ n: hc.n, placed: true, tee, green: cen, via: hc.via || [] });   // dogleg centreline + fairway from aerial (hc.via = optional dogleg waypoints)
  } else { qa.push(`h${hc.n}: needs "way" or "green"+"tee"`); continue; }
  // per-tee positions: white = tee; others stepped back by the card delta along the play line
  const tees = {};
  if (Object.keys(card).length && white) {
    const ln = lines[hc.n], back = bearing(ln[1] || cen, ln[0]);   // from 2nd pt back through the tee
    for (const k of Object.keys(card)) tees[k] = k === 'white' ? tee : dest(tee, back, card[k] - white).map(r7);
    tees.white = tee;
  }
  holes.push({ n: hc.n, par: hc.par, si: hc.si, tee, ...(Object.keys(tees).length ? { tees } : {}), cen, pin: null, gbb });
  // cross-check: tee→green vs card white
  const len = Math.round(distM(tee, cen));
  if (white != null && Math.abs(len - white) > white * 0.15) qa.push(`h${hc.n}: tee→green ${len} m vs card ${white} m (>15% — check)`);
  if (hc.way && greenSrc === 'oval' && bunkersNear(cen, 35) === 0) qa.push(`h${hc.n}: green has no greenside bunker within 35 m (orientation?)`);
  if (cfg.options?.traceFairways && hc.way) traceJobs.push({ n: hc.n, line: lines[hc.n] });
}

// ---- greens: keep real OSM polygons + an oval for every hole that lacked one ----
for (const gr of greens) feats.push({ t: 'green', pts: simp(gr.pts) });
for (const h of holes) { const onOsm = greens.some(gr => distM(gr.cen, h.cen) <= 25); if (!onOsm) feats.push({ t: 'green', pts: ovalPts(h.gbb) }); }

// ---- fairways from imagery (sequential, polite) ----
for (const job of traceJobs) {
  try {
    if (job.placed) {   // OSM-missing hole: trace the dogleg centreline (overrides the straight line) + fairway
      const r = await traceHoleCorridor(job.tee, job.green, { via: job.via || [] });
      if (r.line && r.line.length > 2) lines[job.n] = r.line;
      if (r.fairway) feats.push({ t: 'fairway', pts: r.fairway.pts });
      let mx = 0; for (const p of lines[job.n]) mx = Math.max(mx, perpM(p, job.tee, job.green));
      if (mx > 30 && !(job.via && job.via.length)) qa.push(`h${job.n}: corridor drifts ${Math.round(mx)} m off the tee→green axis — if not a real dogleg, add a "via":[[lat,lng]] waypoint`);
    } else { const f = await traceFairway(job.line); if (f) feats.push({ t: 'fairway', pts: f.pts }); else qa.push(`h${job.n}: fairway trace too short`); }
  } catch (e) { qa.push(`h${job.n}: fairway/corridor trace failed (${e.message})`); }
}

// ---- bunkers from imagery (opt-in via options.traceBunkers; supplements OSM, deduped) ----
if (cfg.options?.traceBunkers) {
  let added = 0;
  for (const h of holes) { const line = lines[h.n]; if (!line || line.length < 2) continue;
    try { for (const b of await traceBunkers(line)) {
      if (bunkers.some(o => distM(o, b._c) < 14)) continue;                                    // already an OSM bunker
      if (feats.some(f => f.t === 'bunker' && f._c && distM(f._c, b._c) < 12)) continue;       // already traced (shared between holes)
      feats.push({ t: 'bunker', pts: b.pts, _c: b._c }); added++;
    } } catch (e) { qa.push(`h${h.n}: bunker trace failed (${e.message})`); }
  }
  feats.forEach(f => delete f._c);
  qa.push(`+${added} imagery bunkers (best-effort — eyeball for false positives / grass bunkers won't show)`);
}

// ---- emit ----
const c = cfg.course, parSum = holes.reduce((s, h) => s + h.par, 0);
const play = { name: cfg.name, par: c.par ?? parSum, holesN: holes.length, ...(c.cr != null ? { cr: c.cr } : {}), ...(c.slope != null ? { slope: c.slope } : {}), ...(c.defaultTee ? { defaultTee: c.defaultTee } : {}), ...(c.teeSets ? { teeSets: c.teeSets } : {}), ...(c.src != null ? { src: c.src } : {}), holes };
const out = { play, geom: { features: feats, lines } };
const outPath = osmPath.replace(/\.json$/, '_built.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const siSet = new Set(holes.map(h => h.si));
console.error(`holes=${holes.length} par=${parSum} (cfg ${c.par}) | features=${feats.length} (greens ${feats.filter(f => f.t === 'green').length}, bunkers ${feats.filter(f => f.t === 'bunker').length}, fairways ${feats.filter(f => f.t === 'fairway').length}) | lines=${Object.keys(lines).length}`);
console.error(`SI 1..N unique: ${siSet.size === holes.length} | tees: ${holes.filter(h => h.tees).length}/${holes.length} holes`);
console.error('QA:' + (qa.length ? '\n  - ' + qa.join('\n  - ') : ' all checks pass'));
console.error('-> ' + outPath + '  (' + (JSON.stringify(out).length / 1024).toFixed(1) + ' KB)');
