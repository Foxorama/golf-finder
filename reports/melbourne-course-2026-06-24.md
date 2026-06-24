# Melbourne course in app — status (2026-06-24)

Goal: get at least one Melbourne course showing as playable, and a **complete**
demo course (tees / greens / hole features) so it can be shown off without
desktop rework later.

## What shipped (branch `claude/melb-course-osm-data-4na7mg`)

1. **Royal Melbourne Golf Club** — finder entry (most popular Melbourne course).
   Day-list only; no GPS Play geometry (36-hole West+East site, would need the
   multi-course `layouts` treatment — left for later).
2. **Kingston Heath Golf Club** — the **complete GPS Play demo course**:
   - Hole maps with **real OSM geometry**: 19 greens, **155 bunkers** (the famous
     KH bunkering), 14 fairways, 20 tees — 206 features, `play-geom/kingston-heath-golf-club.json`.
   - Rangefinder front/centre/back, play-line-up maps, wind compass, auto shot
     tracking, scorecard with **net + Stableford** (par 72, CR 73.1 / Slope 136),
     stroke index, handicap — all the generic Play machinery, now on KH.
   - Finder entry (`region`/`zone` `melbourne`) so the **⛳ Play** button appears.
3. **Melbourne wiring** so both read as playable from a Melbourne GPS fix:
   `ZONE_COORDS.melbourne` (weather), `REGION_LABELS`, a Melbourne filter option,
   and the out-of-coverage notice now says "SE Queensland and Melbourne".

## How it was built (the environment couldn't reach OSM)

This dev environment's egress policy blocks Overpass and **all** OSM/imagery
hosts, so the geometry can't be fetched locally. Solution: a GitHub Actions
runner has open internet.

- `.github/workflows/play-osm-fetch.yml` + `scripts/play/fetch-osm.mjs` — fetch the
  course's OSM `out geom` from Overpass **in CI** and commit it to the branch.
  (Push the branch `ci/osm-fetch` to trigger it; edit the `env:` block for another
  course. A single-course query dodges the bulk throttling that makes
  `course-maps.yml` flaky on CI IPs.)
- `scripts/play/build-play-course.mjs` → COURSE_PLAY + COURSE_GEOM from the OSM.
- `scripts/play/apply-scorecard.mjs` + `kingston-heath-golf-club.config.json` —
  overlay the published stroke index + CR/Slope (not in OSM) and extend any
  centreline that stops short of its green.
- `scripts/play/bake-play-course.mjs` → inline entry + `play-geom/<slug>.json`.

Verified: `node tests/run.mjs` 14/0, brace balance even, SI a valid 1–18
permutation, par 72, 17/18 holes on their real OSM green, every centreline
tee→line ≤0.1 m and line→green ≤6 m after the hole-16 fix.

## Known gap (the only thing not pixel-perfect)

- **Hole 8's green is not mapped as a polygon in OpenStreetMap** (only a practice
  green spare exists nearby). It uses a **synthetic green** at the centreline end
  — the flag sits at the right spot and distances are approximate (~±11 m
  front/back) rather than from a real green outline. Every other hole is exact.
  - **To finish it later (needs desktop / aerial):** open
    `scripts/play/trace-tool.html`, trace hole 8's green on the Esri aerial, export,
    and re-bake — or just add the green polygon to
    `play-geom/kingston-heath-golf-club.json` and set hole 8's `cen`/`gbb` in the
    COURSE_PLAY entry. Or, easier: fix it in OSM itself and re-run the CI fetch.

## Notes / loose ends

- Par is OSM's **72** (KH's published par). Some third-party cards show par 73 with
  the 1st as a par 5 — that's their error; OSM/championship is par 72, 1st a par 4.
- Both Melbourne courses use `drive:1000` as the non-GPS fallback (honestly "not
  playable" for a SEQ user with no GPS); a real Melbourne GPS fix recomputes it.
- Daylight/weather are live per-GPS (DST-correct for VIC); the month-based
  fallback is SEQ-only and used solely when offline.
- The throwaway CI trigger branch `ci/osm-fetch` couldn't be deleted from here
  (git proxy returned 403) — safe to delete in the GitHub UI; it's inert.

Data © OpenStreetMap contributors (ODbL).
