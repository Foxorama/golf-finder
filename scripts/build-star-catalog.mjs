// Pre-bakes the naked-eye star field for night mode into star-catalog.json from
// the public-domain HYG database (Hipparcos/Yale/Gliese merge). Runs in CI
// (Node 18+, global fetch). The app draws this with buildStarField(); every star
// is positioned at runtime by the same altAz() transform, so the catalog is just
// a region-agnostic list of [ra°, dec°, mag] — correct for any place and date.
//
// Constellation LINES are NOT baked here: they live as curated figures in
// index.html (STAR_FIGURES), so this file only enriches the background field and
// needs no fragile HIP→line remapping. If the fetch fails the app falls back to
// its embedded seed, so a missing/empty catalog is harmless.
//
// Data: HYG database, public domain (https://github.com/astronexus/HYG-Database).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'star-catalog.json');
const OUT_DEEP = join(ROOT, 'star-catalog-deep.json');

// Two tiers, baked in one pass:
//  • star-catalog.json      mag ≤ MAG_LIMIT  (~1,600 stars) — the lean default
//    lazy-loaded for everyone on first night render ("naked eye").
//  • star-catalog-deep.json mag ≤ DEEP_LIMIT (~14,000 stars) — fetched ONLY when
//    the viewer switches to "dark sky" / "binoculars", so default users never
//    pay for it. The app client-filters this one down per preset (6.5 / 7.0).
// 5.0 ≈ practical naked-eye limit under suburban skies; 6.5 ≈ true dark-sky
// naked-eye limit; ~7 is about as deep as the small night strip stays legible
// (real binoculars reach ~9, but that's 100k+ stars — a smear and a 1 MB file).
const MAG_LIMIT = Number(process.env.MAG_LIMIT || 5.0);
const DEEP_LIMIT = Number(process.env.DEEP_LIMIT || 7.0);

// HYG v3 CSV mirrors (one big file; pick whichever responds). Public domain.
const SOURCES = [
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v3.csv',
  'https://raw.githubusercontent.com/astronexus/HYG-Database/master/hygdata_v3.csv',
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hygdata_v3.csv',
];

async function fetchCsv() {
  let lastErr;
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'golf-finder-star-baker/1.0' } });
      if (!r.ok) { lastErr = new Error(`${r.status} @ ${url}`); continue; }
      const text = await r.text();
      if (text.length > 10000) { console.log(`Fetched ${url} (${(text.length / 1e6).toFixed(1)} MB)`); return text; }
      lastErr = new Error(`suspiciously small response @ ${url}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no HYG source responded');
}

// Parse the HYG CSV into [ra°, dec°, mag] for every star down to `limit`.
function parse(csv, limit) {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',');
  const iRa = header.indexOf('ra');     // hours
  const iDec = header.indexOf('dec');   // degrees
  const iMag = header.indexOf('mag');   // apparent visual magnitude
  if (iRa < 0 || iDec < 0 || iMag < 0) throw new Error(`unexpected HYG header: ${header.slice(0, 20).join(',')}`);
  const stars = [];
  for (let li = 1; li < lines.length; li++) {
    const row = lines[li];
    if (!row) continue;
    const f = row.split(',');           // HYG numeric columns are comma-clean
    const mag = parseFloat(f[iMag]);
    if (!isFinite(mag) || mag > limit) continue;
    const raH = parseFloat(f[iRa]), dec = parseFloat(f[iDec]);
    if (!isFinite(raH) || !isFinite(dec)) continue;
    if (raH === 0 && dec === 0 && mag < -20) continue;   // the Sun (id 0)
    stars.push([
      +(((raH * 15) % 360 + 360) % 360).toFixed(2),       // hours → degrees
      +dec.toFixed(2),
      +mag.toFixed(1),
    ]);
  }
  stars.sort((a, b) => a[2] - b[2]);    // brightest first (nicer draw order)
  return stars;
}

function write(path, name, stars, limit) {
  const out = { generated: new Date().toISOString(), mag_limit: limit, count: stars.length, stars };
  writeFileSync(path, JSON.stringify(out) + '\n');
  console.log(`Wrote ${name} — ${stars.length} stars at mag ≤ ${limit} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
}

async function main() {
  const csv = await fetchCsv();
  const deep = parse(csv, DEEP_LIMIT);
  const naked = deep.filter((s) => s[2] <= MAG_LIMIT);   // subset — parse once
  console.log(`Parsed ${naked.length} naked-eye (≤${MAG_LIMIT}) of ${deep.length} deep (≤${DEEP_LIMIT}) stars`);
  if (naked.length < 200) {
    // A real mag-5 catalogue has ~1,600 stars; far fewer means a bad parse —
    // don't clobber a good file (the app's seed still covers the marquee figures).
    let prev = 0;
    try { prev = (JSON.parse(readFileSync(OUT, 'utf8')).stars || []).length; } catch {}
    console.error(`Refusing to overwrite: only ${naked.length} stars parsed (had ${prev}).`);
    process.exit(1);
  }
  write(OUT, 'star-catalog.json', naked, MAG_LIMIT);
  write(OUT_DEEP, 'star-catalog-deep.json', deep, DEEP_LIMIT);
}

main().catch((e) => { console.error(e); process.exit(1); });
