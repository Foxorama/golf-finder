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

// Faintest stars to include. ~5.0 ≈ the practical naked-eye limit under
// suburban skies (~1,600 stars whole-sky) and keeps the file small. Bump toward
// 6.5 for true dark-sky depth at the cost of size, or ~7 for "binocular".
const MAG_LIMIT = Number(process.env.MAG_LIMIT || 5.0);

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

function parse(csv) {
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
    if (!isFinite(mag) || mag > MAG_LIMIT) continue;
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

async function main() {
  const stars = parse(await fetchCsv());
  console.log(`Kept ${stars.length} stars at mag ≤ ${MAG_LIMIT}`);
  if (stars.length < 200) {
    // A real mag-5 catalogue has ~1,600 stars; far fewer means a bad parse —
    // don't clobber a good file (the app's seed still covers the marquee figures).
    let prev = 0;
    try { prev = (JSON.parse(readFileSync(OUT, 'utf8')).stars || []).length; } catch {}
    console.error(`Refusing to overwrite: only ${stars.length} stars parsed (had ${prev}).`);
    process.exit(1);
  }
  const out = { generated: new Date().toISOString(), mag_limit: MAG_LIMIT, count: stars.length, stars };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`Wrote star-catalog.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
