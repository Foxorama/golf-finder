# Open-data Play build pipeline

Builds a course's on-course **Play** data (`COURSE_PLAY` + `COURSE_GEOM`) from **open
data only** — OpenStreetMap where it's complete, plus open-data gap-fillers when it
isn't. This is the productionised version of the **Oxley** pilot (the workflow is the
`add-play-course` skill; the technique notes are in the `play-triangulation-pipeline`
memory). Pure Node, **no npm dependencies** (built-in `fetch` + `zlib`).

## Files
| file | what it does |
|---|---|
| `lib-geo.mjs` | geo helpers — `distM`, `bearing`, `dest`, `pointAlong`, `rdp`, `simp` |
| `lib-png.mjs` | minimal pure-Node PNG decoder (8-bit RGB/RGBA/indexed) via `zlib` |
| `imagery.mjs` | fetch georeferenced **Esri World Imagery** tiles → trace the fairway corridor |
| `gap-fill.mjs` | **the orchestrator** — OSM + config → `<osm>_built.json` (`{play,geom}`) |
| `trace-tool.html` | **click-to-place tracer** for *accurate display* — trace features on the aerial by hand |
| `from-traced.mjs` | merge a hand-traced geometry JSON + a scorecard config → `<traced>_built.json` |
| `<slug>.config.json` | per-course config (the human-resolved bits). `oxley-golf-club.config.json` is the worked example |

## Two paths — pick by how much accuracy you need
- **Auto (`gap-fill.mjs`)** — fast, hands-off, **good for distance (±~15 m)**. But auto-detected
  positions are fuzzy (greens are ovals, fairways follow the grass-corridor, bunkers are best-effort
  sand blobs, tees are config coords), so the *display* drifts — fine for a rough course, not for
  pixel placement.
- **Hand-traced (`trace-tool.html` → `from-traced.mjs`)** — for **accurate display**. Open the tool
  in a browser, pick a hole + a feature and **click it on the georeferenced Esri aerial** (club PDF
  open alongside to identify features). Feature types: **tee marker (White; others derived from the
  card), tee box, green, centreline, fairway, bunker, water, creek, rough, trees, building, bridge,
  out-of-bounds, cart-path, ditch, waste area, native/scrub, 100/150/200 markers, drop zone,
  here-be-dragons (danger zone)** — tee-box/green/fairway/bunker/water/rough/trees/building/bridge/
  waste/native/dragon are polygons; centreline/creek/OB/cart-path/ditch are lines; tee markers +
  distance markers + drop zone are points. The tee BOX is the mowed teeing ground (multiple tee
  markers can sit on it). Adding another type = one `FT` row in the tool + one render case in
  `playHoleSvg`. Pan the map with **right-click drag**; a **right single-click cancels the shape you're
  drawing**. **Draw / Edit / Detect are one mode at a time** (turning on Edit or Detect turns the other
  off; picking a feature returns to Draw). Polygons draw as
  **drag-a-box (Box mode, default)**; toggle to **Outline mode** to click a precise outline (use it
  for greens, where the shape sets front/back distances). **Edit/drag mode** repositions any placed
  point/vertex and pulls polygon edges out. **Auto-build:** with the **green + a tee** placed, a straight
  **centreline** (tee-mid → green) is auto-drawn and the **100/150/200 markers derive along it** at
  arc-distance from the green. The **centreline is the editable primary path**: for a **dogleg**,
  Edit-mode-drag its midpoint to the corner and the markers re-place along the bent line, always on the
  fairway (this is the fix for the par-5-dogleg-cutting-through-the-trees problem — the markers can't be
  the control points, since you need a bend *between* the tee and the 200 marker). Moving a tee/green
  snaps the line's endpoint + re-derives; the markers are non-interactive (steer them via the line).
  Type each tee's card metres into **Tee m** + **place tees** to drop the colours by distance along the line.
  **↳ fairway** generates a tapered ribbon polygon along the centreline (≈34 m, narrower at the ends) you then
  edit — instead of tracing 18 fairways by hand. A **live readout** under the controls shows the centreline's
  metres vs the White card distance (ambers if >8% off). Navigating to a not-yet-traced hole **auto-recentres**
  the map near an adjacent traced green (where the next tee usually is). **🪄 detect (experimental):** with a
  polygon feature selected, click inside a green/bunker/water on the aerial and it **flood-fills the outline by
  colour** (one click vs many). It fetches the Esri tile separately via CORS — if pixel reads are blocked it
  disables itself with a message and the basemap is unaffected; if it works, Edit-mode-drag any edge to fix. A hole with a **here-be-dragons**
  zone renders an olde-map danger warning AND triggers a fire-breathing dragon that flies across the
  map now and then (`window._playDragons=false` disables it; honours `prefers-reduced-motion`). Export the geometry JSON, then
  `node from-traced.mjs <traced.json> <slug>.config.json` merges it with the scorecard
  (par/SI/per-tee distances/CR) → a built course. Real green polygons give true front/centre/back;
  every clicked feature lands exactly where you put it, and the hole map's frame expands to include
  the hole's own edge features (trees/rough/OB) so they're never culled. Procedural flat-shading
  renders each type now; nicer art assets can be layered on later.

## Run
```
node gap-fill.mjs <osm-geom.json> <slug>.config.json   ->  <osm>_built.json
```
Then bake with `../bake-play-course.mjs <index.html> <slug> <osm>_built.json` — it emits the
full `COURSE_PLAY` entry (incl. `si`, `cr`/`slope`, `tees`, `teeSets`) and writes the geometry
to `play-geom/<slug>.json`. Verify with the `add-play-course` skill §3 + the **§3a per-hole
QA review**.

## The config — where the human-in-the-loop decisions live
OSM, imagery and geometry are automated; the things you **can't** read off a map
reliably go in the config: hole numbering, the scorecard, per-tee distances. For a
sparse-OSM course (Oxley: no `ref`s, no fairways, 2/18 greens) you supply:

```jsonc
{
  "name": "Oxley Golf Club", "slug": "oxley-golf-club",
  "course": { "par": 71, "cr": 70, "slope": 113, "defaultTee": "white",
    "teeSets": [ {"key":"black","name":"Black","cr":72,"slope":113}, … ] },
  "options": { "traceFairways": true, "traceBunkers": true, "greenOvalM": 26 },
  "holes": [
    // a hole mapped to an OSM centreline way:
    { "n":1, "par":4, "si":7, "way": 1050483192, "greenEnd": "b",
      "tees": { "black":350, "blue":347, "white":343 } },     // per-tee CARD distances (m)
    // a hole OSM is missing entirely — place green+tee by hand:
    { "n":7, "par":3, "si":18, "green":[-27.5698,152.9786], "tee":[-27.5708,152.9786],
      "tees": { "black":130, "blue":123, "white":116 } },
    // a hole whose OSM line overshoots the tee (car park etc.) — card-place the white tee:
    { "n":8, "par":4, "si":16, "way":1050483204, "greenEnd":"b", "cardPlaceWhite":true,
      "tees": { "black":291, "blue":284, "white":281 } }
  ]
}
```

Per-hole fields: **`way`** (OSM `golf=hole` way id) or **`green`+`tee`** (coords, for an
OSM-missing hole); **`greenEnd`** `"a"`/`"b"` (which end of the way is the green — defaults
to a greenside-bunker-proximity test); **`cardPlaceWhite`** (place the white tee at its card
distance instead of the OSM tee-end, and trim the centreline tee→green); **`tee`** (explicit
white-tee coord override); **`tees`** (per-tee card distances — white ≈ the rated tee, the
others are stepped back along the play line by their card delta); **`via`** (optional
`[[lat,lng],…]` dogleg waypoints — the corridor is routed through them, for the few holes the
build flags as drifting >30 m off-axis).

## What it fills, and the cross-checks
- **greens** — real OSM polygon where present, else a `greenOvalM` (≈26 m) oval at the centre.
- **tees** — per-tee positions from the card distances (`tees:{…}` for the multi-tee selector).
- **fairways / dogleg centrelines** — traced from imagery (tree-bounded grass corridor) when
  `traceFairways`. For placed (no-OSM) holes `traceHoleCorridor` routes the real centreline through the
  corridor with a **straight-line "tube" prior** so it can't wander off the hole axis into a neighbour
  fairway (the old failure); a quality gate falls back to straight if the trace bloats, and a hole that
  still drifts >30 m is **flagged** to add a `via` waypoint — the only hand-step, for the odd dogleg.
- **bunkers** — real OSM polygons, plus (with `traceBunkers`) **sand** bunkers from imagery: compact
  bright-tan blobs near the corridor, fit to oriented ellipses, deduped against OSM. Best-effort —
  eyeball for false positives, and **grass-faced bunkers won't show** (they read as rough, e.g. Minnippi).
- **water** — from **OSM hydrology** (`natural=water`, `water=*`, `landuse=reservoir/basin`,
  `waterway=riverbank`); the OSM query must fetch those too (below). Water is **not** traced from
  imagery — dark tree shadows are indistinguishable from dark water in RGB.
- **QA report** (stderr): tee→green vs card length (>15% flagged), greens with no greenside bunker,
  corridor drift >30 m, SI 1..N unique, par sum. **Then do the visual per-hole QA review** (skill §3a).

**OSM query:** the skill's `is_in` query fetches `golf=*`; to get water, also fetch hydrology in the
course area — add e.g. `way["natural"="water"](area.g); way["waterway"](area.g);
way["landuse"~"reservoir|basin"](area.g);` to the union.

OSM-complete courses don't need most of this — `../build-play-course.mjs` (the OSM-only
path) still applies; this pipeline is for filling the gaps when OSM is thin.
