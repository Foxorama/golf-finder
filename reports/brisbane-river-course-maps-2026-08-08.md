# Brisbane River Golf Club — what shipped, and why there are no hole maps

**Date:** 2026-08-08 · **Branch:** `claude/brisbane-river-course-maps-j0tux5`

## The ask
Add Brisbane River Golf Club (212 College Rd, Karana Downs — the club formerly known as
Karana Downs) to the app, using two supplied images: the club's BlueGolf scorecard and the
club's own course map.

## What shipped
- **Finder-list entry** in `COURSES` — Karana Downs, `zone:'ipswich'`, 35 min, public, on
  GolfNow. Green fees and a star rating were **deliberately left null**: the public sources
  disagree (AUD 15 on one guide, a $25-implied deal price on another; GolfPass shows both
  5.0/1-review and 2.5/2-reviews). `rating` is already `c.rating ? … : ''` in `ccardHtml`, so a
  null degrades to no star rather than a wrong one.
- **`COURSE_PLAY` entry, `noGps:true`** — the full card: par 66 (out 32 / in 34), all 18 stroke
  indexes, CR 65.0 / Slope 116, and each hole's Black-tee distance. Gives the Card and History
  tabs, net and Stableford scoring, and handicap allocation. No rangefinder, because there is no
  geometry (below).
- **Card distances now render** (`.cc-len`) under each hole number and on OUT/IN/TOT. This is the
  only place they can appear on a scorecard-only course, and `fmtDist` honours the yards/metres
  toggle, so a yards player reads the club's own card straight back.
- **Honest Play CTA** — the day card's button said "GPS rangefinder & scorecard" for every course
  in `COURSE_PLAY`. It now says "scorecard & handicap" when the course (or every layout) is
  `noGps`, matching the existing honest-CTA rule for directory-only tee-time links.

## The scorecard, and the one thing worth double-checking
Transcribed from the supplied BlueGolf card. It is internally coherent, which is the check that
matters: the par row's seven par 3s are exactly the seven shortest holes and the lone par 5 is the
longest, and the stroke indexes are a clean 1–18 permutation on the usual front-evens / back-odds
convention.

**The distances are yards, not metres.** The card doesn't say. The club's published Black rating
of **65.0 for par 66** settles it: that is consistent with ~4,720 m (5,158 yd), whereas a 5,158
*metre* par-66 course would rate around 68. `len` in `COURSE_PLAY` is therefore the card yards
converted to metres (4,718 m total, which round-trips to 5,160 yd against the card's 5,158 — a
two-yard artefact of per-hole rounding).

**Worth a look on the course:** the card gives hole 8 (a 165 m par 3) stroke index **2**, and hole 9
(a 407 m par 4, the longest on the front) stroke index **18**. That is backwards from what the
lengths suggest. It is baked as printed rather than second-guessed, but if the club's own card
disagrees it is a one-line fix.

## Why there are no hole maps
The three sources a Play course is normally built from all came up short, and this was tested
rather than assumed:

1. **OpenStreetMap has nothing.** The `is_in` containment query returns exactly two ways: a
   `leisure=golf_course` boundary still named *"Karana Downs Golf Course"* and tagged
   `note="Partial boundary of golf course. Full boundary is quite complicated to draw, will leave
   it till later."*, plus the clubhouse building. No `golf=hole`, no greens, tees, fairways,
   bunkers or water. This is the skill's fully-absent case.

2. **The open imagery is a dry-season capture.** The QLD state-program imagery — the sharper,
   production-preferred source over SEQ — refused on the runner across repeated attempts, so what
   exists is Esri World Imagery at 0.35 m/px, taken when the course was drought-stressed. The
   fully-absent path depends on greens being the one irrigated thing on the property; here the
   fairways are pale and brown and the putting surfaces do not reliably separate from them. A
   detector calibrated off the image itself (`aerial-greens.mjs`) returned 16 candidates for 18
   greens, several of them house lawns in the surrounding estate.

3. **The club course map is a stylised drawing.** Fitting it to the clubhouse's true OSM position
   lands within about 40 m — good, for an artistic panorama, and consistent with what
   `from-course-map.mjs` already documents. But Karana Downs is a compact course with parallel
   corridors threaded between houses, and 40 m is wider than a hole. It gives the routing; it
   cannot say which corridor is which number to the accuracy needed.

Individually none of these is fatal. Together they mean the hole *numbering* can't be established,
and the skill is explicit about that case: **when a course's numbering can't be trusted, ship it
`noGps` with the card par and don't guess** (the Sanctuary Cove Palms precedent). Guessed geometry
on a rangefinder isn't a rough edge, it's a wrong number over a shot.

One green *was* placed and verified end-to-end as a proof the method works — the hole west of the
clubhouse, green plus greenside bunker, at roughly `-27.54297, 152.82787`, where the independent
detector agreed to within 5 m. The obstacle is breadth and numbering, not the technique.

## What would finish it
In rough order of how well each closes the gap:

1. **Hand-trace it in `scripts/play/trace-tool.html`.** This is the skill's *primary* path for an
   accurate course anyway, and it needs a browser — which this remote environment doesn't have and
   you do. `scripts/play/brisbane-river-golf-club.config.json` is already written with the full
   card (par / SI / CR / Slope / Black + Red per-tee distances), so tracing the greens, tees and
   centrelines and running `from-traced.mjs` against it produces a finished GPS course. The live
   readout will cross-check each centreline against the Black distance as you draw it.
2. **Better imagery.** If the QLD state-program endpoint starts answering, re-run the aerial and
   the automated path becomes viable — greens separate cleanly on a non-drought capture.
3. **A walk with the app.** Even a rough build could be corrected on-course with the Set-tee tool,
   but that's a repair, not a build.

## Pipeline work done along the way
All reusable, all committed:

- `fetch-aerial.mjs` takes its extent from a raw Overpass JSON or a literal bbox, not just a
  `play-geom` file that doesn't exist yet for a course like this — plus retries across both imagery
  hosts, and replays every attempt at the *end* so the reason a source was skipped is readable from
  a CI log's tail instead of buried above a successful fallback.
- `lib-png.mjs` gained an encoder; `crop-aerial.mjs` cuts georeferenced windows (magnified or
  downscaled) out of a committed aerial, with crosshair rings for the registration check.
- `aerial-centroid.mjs` pulls a seeded green/tee onto the real turf by smoothness-weighted
  mean-shift; `aerial-greens.mjs` inventories candidate putting surfaces.
- `gap-fill.mjs` no longer hard-codes `white` as the rated tee — Brisbane River's is Black, and
  with no `white` key the multi-tee block silently produced nothing.
- The workflow no longer re-runs the OSM fetch on an `aerial` run. It did, with no reason to pass
  name/lat/lng, so the *previous* course's OSM overwrote this one's and the first aerial came back
  over McLeod, 9 km away, with every step reporting success.
