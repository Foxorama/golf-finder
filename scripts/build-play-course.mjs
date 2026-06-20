// OSM golf course -> COURSE_PLAY + COURSE_GEOM for the Play feature.
// Usage: node build-play.mjs <osm-geom.json> "<Course Name>"
// Input: an Overpass `out geom` JSON (ways with .geometry, golf tags).
// Output: <osm>_built.json = { play:{name,par,holesN,holes:[{n,par,tee,cen,pin,gbb}]}, geom:{features,lines} }
// SI/CR/slope are intentionally NOT emitted (unreliable third-party data; entered-handicap scoring covers it).
import fs from 'fs';
const [, , osmPath, name, parCSV] = process.argv;
// Optional authoritative per-hole par (CSV by hole ref: ref 1 -> first value), used when OSM
// par tags are missing or wrong. ONLY supply after verifying the OSM hole numbering matches the
// source card (e.g. OSM par-3/par-5 hole positions, by length, line up with the card's).
const parOverride = parCSV ? parCSV.split(',').map(s => parseInt(s.trim(), 10)) : null;
const parOf = h => (parOverride && parOverride[h.ref - 1] != null && !Number.isNaN(parOverride[h.ref - 1])) ? parOverride[h.ref - 1] : h.par;
const r = JSON.parse(fs.readFileSync(osmPath, 'utf8').replace(/^﻿/, ''));
const els = r.elements;
const R = 6371000, rad = Math.PI / 180;
const hav = (a, b, c, d) => { const dla = (c - a) * rad, dlo = (d - b) * rad; const h = Math.sin(dla / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
const perp = (p, a, b) => { const lat0 = a[0] * rad, kx = 111320 * Math.cos(lat0), ky = 110540; const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky; const L = bx * bx + by * by; if (L === 0) return Math.hypot(px, py); const t = Math.max(0, Math.min(1, (px * bx + py * by) / L)); return Math.hypot(px - t * bx, py - t * by); };
function rdp(pts, eps) { if (pts.length < 3) return pts.slice(); let dmax = 0, idx = 0; for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } } if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps)); return [pts[0], pts[pts.length - 1]]; }
const r6 = pts => pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
const simp = pts => r6(rdp(pts, 2.0));
const r7 = v => +v.toFixed(7);
const tmap = { fairway: 'fairway', green: 'green', bunker: 'bunker', tee: 'tee', water_hazard: 'water', lateral_water_hazard: 'water' };
const greens = [], holesW = [], feats = [];
for (const e of els) {
  if (e.type !== 'way') continue;
  const g = e.tags && e.tags.golf; if (!g) continue;
  const pts = (e.geometry || []).filter(x => x).map(x => [+x.lat, +x.lon]); if (pts.length < 2) continue;
  if (g === 'hole') { holesW.push({ pts, ref: +e.tags.ref, par: e.tags.par != null ? +e.tags.par : null, hcp: e.tags.handicap != null ? +e.tags.handicap : null }); continue; }
  if (g === 'green') { let la = 0, lo = 0, mila = 999, milo = 999, mala = -999, malo = -999; for (const p of pts) { la += p[0]; lo += p[1]; if (p[0] < mila) mila = p[0]; if (p[0] > mala) mala = p[0]; if (p[1] < milo) milo = p[1]; if (p[1] > malo) malo = p[1]; } greens.push({ cen: [la / pts.length, lo / pts.length], bb: [mila, milo, mala, malo] }); }
  if (tmap[g]) feats.push({ t: tmap[g], pts: simp(pts) });
}
// Dedupe holes sharing a ref (a mapping error / practice hole tagged with a real hole's ref —
// e.g. Sandy Gallop's two "11"s): keep the one with the longest centreline, drop the rest.
{
  const byRef = {};
  for (const h of holesW) {
    const len = h.pts.length > 1 ? hav(h.pts[0][0], h.pts[0][1], h.pts[h.pts.length - 1][0], h.pts[h.pts.length - 1][1]) : 0;
    if (!byRef[h.ref] || len > byRef[h.ref].len) byRef[h.ref] = { h, len };
  }
  const kept = Object.values(byRef).map(x => x.h);
  holesW.length = 0; for (const h of kept) holesW.push(h);
}
holesW.sort((a, b) => a.ref - b.ref);
const holes = [], lines = {}, diag = [];
// Pass 1: orient each hole tee->green and find the nearest green (by index, for uniqueness).
const match = holesW.map(h => {
  const a = h.pts[0], b = h.pts[h.pts.length - 1];
  let bA = 1e9, bB = 1e9, iA = -1, iB = -1;
  greens.forEach((gr, i) => {
    const da = hav(a[0], a[1], gr.cen[0], gr.cen[1]), db = hav(b[0], b[1], gr.cen[0], gr.cen[1]);
    if (da < bA) { bA = da; iA = i; } if (db < bB) { bB = db; iB = i; }
  });
  return (bB <= bA) ? { h, tee: a, gi: iB, gd: bB, line: h.pts } : { h, tee: b, gi: iA, gd: bA, line: h.pts.slice().reverse() };
});
// Pass 2: each green belongs to its single closest hole. A hole whose green is claimed by a
// closer hole (a resort's spare/practice greens cause this) — or whose nearest green is >25 m —
// is "displaced" and falls back to its centreline-end, so no two holes ever share a green.
const ownerGd = {};
match.forEach(m => { if (m.gd <= 25 && (ownerGd[m.gi] === undefined || m.gd < ownerGd[m.gi])) ownerGd[m.gi] = m.gd; });
match.forEach(m => { m.displaced = (m.gd > 25) || (ownerGd[m.gi] === undefined) || (m.gd > ownerGd[m.gi]); });
// Pass 3: emit.
for (const m of match) {
  const { h, tee, gi, gd, line } = m;
  const gEnd = line[line.length - 1];
  let cen, gbb, synth = false;
  if (m.displaced) { synth = true; cen = gEnd; const dLat = 0.00010, dLng = 0.00010 / Math.cos(cen[0] * rad); gbb = [cen[0] - dLat, cen[1] - dLng, cen[0] + dLat, cen[1] + dLng]; }
  else { cen = greens[gi].cen; gbb = greens[gi].bb; }
  holes.push({ n: h.ref, par: parOf(h), tee: [r7(tee[0]), r7(tee[1])], cen: [r7(cen[0]), r7(cen[1])], pin: null, gbb: [r7(gbb[0]), r7(gbb[1]), r7(gbb[2]), r7(gbb[3])] });
  lines[h.ref] = simp(line);
  diag.push({ n: h.ref, par: parOf(h), hcp: h.hcp, gd: +gd.toFixed(1), len: Math.round(hav(tee[0], tee[1], cen[0], cen[1])), synth });
}
const par = holes.reduce((s, h) => s + (h.par || 0), 0);
const out = { play: { name, par, holesN: holes.length, holes }, geom: { features: feats, lines } };
const outPath = osmPath.replace(/\.json$/, '_built.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const hcps = diag.map(d => d.hcp);
const hcpSorted = hcps.filter(x => x != null).slice().sort((a, b) => a - b);
const hcpOK = hcpSorted.length === holes.length && hcpSorted.every((v, i) => v === i + 1);
console.error('holes=' + holesW.length + ' greens=' + greens.length + ' feats=' + feats.length + ' par=' + par);
console.error('pars=[' + diag.map(d => d.par).join(',') + ']');
console.error('osmHcp=[' + hcps.join(',') + ']  (valid 1..N permutation: ' + hcpOK + ')');
console.error('greenMatch m=[' + diag.map(d => d.gd).join(',') + ']  max=' + Math.max(...diag.map(d => d.gd)));
console.error('synthGreens (no polygon, centreline-end used): [' + diag.filter(d => d.synth).map(d => d.n).join(',') + ']');
const missingPar = diag.filter(d => d.par == null || Number.isNaN(d.par)).map(d => d.n);
console.error('holesMissingPar: [' + missingPar.join(',') + ']' + (missingPar.length ? '  *** NEEDS PAR ***' : ''));
console.error('len m=[' + diag.map(d => d.len).join(',') + ']');
console.error('-> ' + outPath + '  (' + (JSON.stringify(out).length / 1024).toFixed(1) + ' KB)');
