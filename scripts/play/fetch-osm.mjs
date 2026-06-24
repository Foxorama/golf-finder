// Fetch a golf course's OSM geometry from Overpass and write it as an
// Overpass `out geom` JSON (the input build-play-course.mjs / gap-fill.mjs expect).
//
// Why this exists: Overpass throttles/blocks many cloud IPs, and some sandboxed
// dev environments can't reach Overpass at all. A GitHub Actions runner has open
// internet, so this script is meant to run in CI (see
// .github/workflows/play-osm-fetch.yml) to source the data the app can't fetch
// locally. Pure Node, no deps (built-in fetch).
//
// Usage:
//   node fetch-osm.mjs "<name regex>" <outPath> [interiorLat] [interiorLng]
// Primary query is by course name (robust, coordinate-free); if it comes back
// thin and an interior lat/lng is given, it falls back to the app's own `is_in`
// containment query at that point.

import fs from 'fs';
import path from 'path';

const [, , name, outPath, latS, lngS] = process.argv;
if (!name || !outPath) { console.error('usage: node fetch-osm.mjs "<name regex>" <outPath> [lat] [lng]'); process.exit(2); }

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

const nameQ =
  `[out:json][timeout:90];` +
  `nwr["leisure"="golf_course"]["name"~"${name}",i]->.gc;` +
  `.gc map_to_area->.g;` +
  `(way["golf"](area.g);relation["golf"](area.g);node["golf"](area.g);)->.f;` +
  `(.f;.gc;);out geom;`;

const isInQ = (la, lo) =>
  `[out:json][timeout:90];is_in(${la},${lo})->.a;area.a["leisure"="golf_course"]->.g;` +
  `(way["golf"](area.g);relation["golf"](area.g);node["golf"](area.g);way(pivot.g););out geom;`;

function golfWays(j) {
  return (j.elements || []).filter(e => e.type === 'way' && e.tags && e.tags.golf).length;
}

async function run(q, label) {
  for (const m of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(m, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
        });
        if (!r.ok) { console.error(`[${label}] ${m} -> HTTP ${r.status}`); }
        else {
          const j = await r.json();
          const gw = golfWays(j);
          console.error(`[${label}] ${m} -> ${j.elements?.length || 0} elements, ${gw} golf ways`);
          if (gw > 0) return j;
        }
      } catch (e) { console.error(`[${label}] ${m} -> ${e.message}`); }
      await new Promise(res => setTimeout(res, 3000 * (attempt + 1)));
    }
  }
  return null;
}

let data = await run(nameQ, 'name');
if ((!data || golfWays(data) < 5) && latS && lngS) {
  console.error('name query thin — trying is_in fallback');
  const alt = await run(isInQ(latS, lngS), 'is_in');
  if (alt && (!data || golfWays(alt) > golfWays(data))) data = alt;
}
if (!data || golfWays(data) === 0) { console.error('FAILED: no golf geometry from any mirror'); process.exit(1); }

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data));
const greens = data.elements.filter(e => e.tags?.golf === 'green').length;
const holes = data.elements.filter(e => e.tags?.golf === 'hole').length;
const fair = data.elements.filter(e => e.tags?.golf === 'fairway').length;
const bunk = data.elements.filter(e => e.tags?.golf === 'bunker').length;
const tees = data.elements.filter(e => e.tags?.golf === 'tee').length;
console.error(`wrote ${outPath}: holes=${holes} greens=${greens} fairways=${fair} bunkers=${bunk} tees=${tees}`);
