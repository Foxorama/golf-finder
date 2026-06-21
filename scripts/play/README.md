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
| `<slug>.config.json` | per-course config (the human-resolved bits). `oxley-golf-club.config.json` is the worked example |

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
  "options": { "traceFairways": true, "greenOvalM": 26 },
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
others are stepped back along the play line by their card delta).

## What it fills, and the cross-checks
- **greens** — real OSM polygon where present, else a `greenOvalM` (≈26 m) oval at the centre.
- **tees** — per-tee positions from the card distances (`tees:{…}` for the multi-tee selector).
- **fairways** — traced from imagery (tree-bounded grass corridor) when `traceFairways`.
- **dogleg centrelines (placed/no-OSM holes)** — with `traceFairways`, a `green`+`tee` hole also gets its
  real centreline routed through the grass corridor (`traceHoleCorridor`, a centre-biased shortest path),
  overriding the straight tee→green line, so the map shows the dogleg and `holeTargets` length is dogleg-aware.
- **QA report** (stderr): tee→green vs card length (>15% flagged), greens with no greenside
  bunker (possible orientation error), SI 1..N unique, par sum vs config. **Then do the
  visual per-hole QA review** (skill §3a) — exactly one green per hole, fairway tee→green,
  nothing spurious.

OSM-complete courses don't need most of this — `../build-play-course.mjs` (the OSM-only
path) still applies; this pipeline is for filling the gaps when OSM is thin.
