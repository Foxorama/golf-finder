// Pre-bakes golf-course map geometry for every course in index.html from
// OpenStreetMap (Overpass API) into course-maps.json. Runs in CI (Node 18+,
// global fetch). The app renders this data with renderCourseMapSVG(); courses
// with no usable OSM geometry get {hasGeom:false}, which greys out their map
// button. Keep osmToData() in sync with the copy in index.html.
//
// Data © OpenStreetMap contributors, ODbL.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Multiple Overpass endpoints — the main instance often blocks datacenter IPs
// (CI runners) with 406/429, so we fail over to mirrors that tolerate them.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'golf-finder-map-baker/1.0 (+https://github.com/Foxorama/golf-finder)';
const SLEEP_MS = 2500; // be polite to Overpass

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Extract {name, lat, lng} for every COURSES entry from index.html.
function readCourses() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const re = /\{name:"((?:[^"\\]|\\.)*)"[^}]*?lat:(-?\d+\.?\d*),\s*lng:(-?\d+\.?\d*)/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push({ name: m[1].replace(/\\"/g, '"').replace(/\\'/g, "'"), lat: +m[2], lng: +m[3] });
  }
  return out;
}

async function overpass(q) {
  let lastErr;
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': UA,
        },
        body: 'data=' + encodeURIComponent(q),
      });
      if (r.status === 406 || r.status === 429 || r.status === 504 || r.status >= 500) {
        lastErr = new Error(`overpass ${r.status} @ ${url}`);
        await sleep(5000 + attempt * 3000);
        continue;
      }
      if (!r.ok) throw new Error(`overpass ${r.status} @ ${url}`);
      return (await r.json()).elements || [];
    } catch (e) {
      lastErr = e;
      await sleep(4000 + attempt * 2000);
    }
  }
  throw lastErr || new Error('overpass failed');
}

async function fetchCourseOSM(lat, lng) {
  // Primary: features of the golf_course polygon that CONTAINS the point —
  // exact, never grabs a neighbouring course. Fallback: nearest polygon by
  // radius (for stored coords that sit just outside their course).
  const isIn =
    `[out:json][timeout:60];is_in(${lat},${lng})->.a;area.a["leisure"="golf_course"]->.g;` +
    `(way["golf"](area.g);relation["golf"](area.g);node["golf"](area.g);way(pivot.g););out geom;`;
  let data = osmToData(await overpass(isIn));
  if (data.hasGeom) return data;
  const around =
    `[out:json][timeout:60];(way["leisure"="golf_course"](around:1000,${lat},${lng});relation["leisure"="golf_course"](around:1000,${lat},${lng});)->.c;` +
    `.c map_to_area->.a;(way["golf"](area.a);relation["golf"](area.a);node["golf"](area.a);.c;);out geom;`;
  return osmToData(await overpass(around));
}

// Overpass elements -> compact intermediate format. MUST match index.html.
function osmToData(els) {
  if (!els || !els.length) return { hasGeom: false };
  const features = [];
  const holes = [];
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  const acc = (pts) => {
    for (const p of pts) {
      if (p[0] < latMin) latMin = p[0];
      if (p[0] > latMax) latMax = p[0];
      if (p[1] < lngMin) lngMin = p[1];
      if (p[1] > lngMax) lngMax = p[1];
    }
  };
  for (const e of els) {
    const g = e.tags && e.tags.golf;
    const lt = e.tags && e.tags.leisure;
    const geo = e.geometry;
    if (e.type === 'node') {
      if (g && (g === 'bunker' || g === 'tee')) features.push({ t: g, pts: [[+e.lat.toFixed(6), +e.lon.toFixed(6)]] });
      continue;
    }
    if (!geo || !geo.length) continue;
    const pts = geo.map((p) => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
    if (g === 'hole') {
      holes.push({ ref: e.tags.ref || '', par: e.tags.par || '', pts });
      acc(pts);
    } else if (
      ['fairway', 'green', 'tee', 'bunker', 'water_hazard', 'lateral_water_hazard', 'rough', 'cartpath', 'path', 'driving_range'].includes(g)
    ) {
      const t = g === 'lateral_water_hazard' ? 'water_hazard' : g === 'path' ? 'cartpath' : g;
      features.push({ t, pts });
      if (t !== 'cartpath') acc(pts);
    } else if (lt === 'golf_course') {
      features.push({ t: 'rough', pts });
      acc(pts);
    }
  }
  const hasGeom = features.some((f) => f.t === 'fairway' || f.t === 'green') || holes.length > 0;
  if (!hasGeom || !isFinite(latMin)) return { hasGeom: false };
  return { hasGeom: true, bbox: [latMin, lngMin, latMax, lngMax], features, holes };
}

async function main() {
  const courses = readCourses();
  console.log(`Found ${courses.length} courses in index.html`);
  // Keep any previously-baked geometry so a transient fetch failure this run
  // doesn't wipe a course that was fine last time.
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(join(ROOT, 'course-maps.json'), 'utf8'));
  } catch {
    /* first run / placeholder */
  }
  const keepPrev = (slug) => (existing[slug] && existing[slug].hasGeom ? existing[slug] : { hasGeom: false });
  const result = {};
  let fetched = 0;
  for (const c of courses) {
    const slug = slugify(c.name);
    if (result[slug]) continue; // de-dupe
    try {
      const data = await fetchCourseOSM(c.lat, c.lng);
      if (data.hasGeom) {
        result[slug] = data;
        fetched++;
        console.log(`  OK ${c.name} (${slug}): ${data.features.length} features, ${data.holes.length} holes`);
      } else {
        result[slug] = keepPrev(slug);
        console.log(`  -- ${c.name} (${slug}): no geometry${result[slug].hasGeom ? ' (kept previous)' : ''}`);
      }
    } catch (err) {
      result[slug] = keepPrev(slug);
      console.log(`  !! ${c.name} (${slug}): ${err.message}${result[slug].hasGeom ? ' (kept previous)' : ''}`);
    }
    await sleep(SLEEP_MS);
  }
  const have = Object.values(result).filter((v) => v.hasGeom).length;
  console.log(`\nFreshly fetched ${fetched}; geometry for ${have}/${Object.keys(result).length} courses.`);
  // Never overwrite with an empty manifest (e.g. Overpass blocked the runner) —
  // that would grey out every map button.
  if (have === 0) {
    console.error('No geometry fetched — refusing to overwrite course-maps.json.');
    process.exit(1);
  }
  writeFileSync(join(ROOT, 'course-maps.json'), JSON.stringify(result) + '\n');
  console.log('Wrote course-maps.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
