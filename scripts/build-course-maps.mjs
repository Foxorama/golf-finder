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
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const SLEEP_MS = 1600; // be polite to Overpass

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
  const r = await fetch(OVERPASS, { method: 'POST', body: q });
  if (!r.ok) throw new Error('overpass ' + r.status);
  return (await r.json()).elements || [];
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
  const result = {};
  for (const c of courses) {
    const slug = slugify(c.name);
    if (result[slug]) continue; // de-dupe
    try {
      const data = await fetchCourseOSM(c.lat, c.lng);
      result[slug] = data;
      const n = data.hasGeom ? `${data.features.length} features, ${data.holes.length} holes` : 'no geometry';
      console.log(`  ${data.hasGeom ? 'OK ' : '-- '} ${c.name} (${slug}): ${n}`);
    } catch (err) {
      result[slug] = { hasGeom: false };
      console.log(`  !! ${c.name} (${slug}): ${err.message}`);
    }
    await sleep(SLEEP_MS);
  }
  const have = Object.values(result).filter((v) => v.hasGeom).length;
  console.log(`\nGeometry for ${have}/${Object.keys(result).length} courses.`);
  writeFileSync(join(ROOT, 'course-maps.json'), JSON.stringify(result) + '\n');
  console.log('Wrote course-maps.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
