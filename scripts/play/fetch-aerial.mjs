// Fetch one georeferenced aerial covering a course and write it as a PNG + a world file, so a
// sandbox that can't reach the imagery host can still trace from real imagery (run this on a
// runner, commit the PNG, work on it locally).
//
// Usage: node fetch-aerial.mjs <extent> <out.png> [mPerPx] [source]
//   extent: play-geom/<slug>.json (a built course — extent from its hole centrelines)
//           | an Overpass `out geom` JSON (extent from every element's geometry — this is the
//             path for a course OSM has no holes for, where only the boundary way exists)
//           | "minLat,minLng,maxLat,maxLng" as a literal bbox
//   source: esri (default) | qld     — QLD is the CC-BY state program imagery, usually sharper
//                                      over SEQ; Esri World Imagery is the OSM-tracing-approved
//                                      fallback and is what imagery.mjs already uses.
// Writes <out>.json alongside with the bbox, so pixel <-> lat/lng is a linear map (the export is
// in EPSG:4326, so no projection maths is needed).
import fs from 'node:fs';

const [, , geomPath, outPath, mppArg, srcArg] = process.argv;
if (!geomPath || !outPath) { console.error('usage: node fetch-aerial.mjs <play-geom.json> <out.png> [mPerPx] [esri|qld]'); process.exit(1); }
const mpp = +(mppArg || 0.5), source = (srcArg || 'esri').toLowerCase();

let mnLa = 99, mnLo = 999, mxLa = -99, mxLo = -999, padM = 120;
const see = (la, lo) => { mnLa = Math.min(mnLa, la); mxLa = Math.max(mxLa, la); mnLo = Math.min(mnLo, lo); mxLo = Math.max(mxLo, lo); };
const asBbox = geomPath.match(/^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/);
if (asBbox) {
  see(+asBbox[1], +asBbox[2]); see(+asBbox[3], +asBbox[4]); padM = 0;   // a literal bbox is taken as given
} else {
  const geom = JSON.parse(fs.readFileSync(geomPath, 'utf8'));
  if (geom.lines) {                                   // a built course — extent from the hole lines
    for (const n of Object.keys(geom.lines)) for (const [la, lo] of geom.lines[n]) see(la, lo);
  } else if (Array.isArray(geom.elements)) {          // raw Overpass — extent from every geometry
    for (const e of geom.elements) {
      if (e.geometry) for (const p of e.geometry) see(p.lat, p.lon);
      else if (e.lat != null) see(e.lat, e.lon);
    }
  } else { console.error('extent: expected play-geom {lines}, Overpass {elements}, or a bbox string'); process.exit(1); }
}
if (mnLa > mxLa) { console.error('extent: no coordinates found'); process.exit(1); }
const rad = Math.PI / 180;
const padLa = padM / 110540, padLo = padM / (111320 * Math.cos(((mnLa + mxLa) / 2) * rad));
const bb = { minLat: mnLa - padLa, maxLat: mxLa + padLa, minLng: mnLo - padLo, maxLng: mxLo + padLo };

const latM = (bb.maxLat - bb.minLat) * 110540;
const lngM = (bb.maxLng - bb.minLng) * 111320 * Math.cos(((bb.minLat + bb.maxLat) / 2) * rad);
// Esri's export caps out well below a whole-course tile at 0.5 m/px, so clamp the long edge and
// let the effective resolution fall out of that rather than silently getting a stretched image.
const MAXPX = 4000;
let W = Math.round(lngM / mpp), H = Math.round(latM / mpp);
const sc = Math.min(1, MAXPX / Math.max(W, H));
W = Math.round(W * sc); H = Math.round(H * sc);

const SRC = {
  esri: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export',
  qld:  'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgramImagery/ImageServer/exportImage',
};
const base = SRC[source] || SRC.esri;
const url = `${base}?bbox=${bb.minLng},${bb.minLat},${bb.maxLng},${bb.maxLat}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png24&f=image`;

console.error(`source=${source} size=${W}x${H} (~${(lngM / W).toFixed(2)} m/px) bbox=${JSON.stringify(bb)}`);
const r = await fetch(url, { headers: { 'User-Agent': 'golf-finder-build/1.0' } });
if (!r.ok) { console.error(`imagery fetch failed: HTTP ${r.status}`); console.error(await r.text().catch(() => '')); process.exit(1); }
const buf = Buffer.from(await r.arrayBuffer());
if (buf.length < 5000) { console.error('suspiciously small response — probably an error image'); process.exit(1); }
fs.writeFileSync(outPath, buf);
fs.writeFileSync(outPath.replace(/\.png$/, '') + '.json', JSON.stringify({ bb, W, H, source, mPerPx: lngM / W }));
console.error(`-> ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
