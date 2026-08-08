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
  indexes, ACR 65.0 / Slope 116, and each hole's Blue (M) distance in metres. Gives the Card and
  History tabs, net and Stableford scoring, and handicap allocation. No rangefinder, because there
  is no geometry (below).
- **Card distances now render** (`.cc-len`) under each hole number and on OUT/IN/TOT. This is the
  only place they can appear on a scorecard-only course, and `fmtDist` honours the yards/metres
  toggle, so a yards player reads the club's own card straight back.
- **Honest Play CTA** — the day card's button said "GPS rangefinder & scorecard" for every course
  in `COURSE_PLAY`. It now says "scorecard & handicap" when the course (or every layout) is
  `noGps`, matching the existing honest-CTA rule for directory-only tee-time links.

## The scorecard — and why the first one was wrong
**Update, same day:** the club's own **miclub/GolfLink card**, photographed on the course, replaced
an earlier transcription of the club's BlueGolf listing. Everything below is the real card, and every
figure reconciles against its printed OUT / IN / TOTAL:

| tee | length | par | ACR | Slope |
|---|---|---|---|---|
| Blue (M) | 4,776 m (out 2,449 / in 2,327) | 66 (32 / 34) | 65.0 | 116 |
| Red (F) | 4,222 m (out 2,173 / in 2,049) | 67 (33 / 34) | 67.0 | 118 |

Hole 18's Blue distance (346 m) is **derived** — In 2,327 minus the other eight — because
bleed-through from the reverse of the card obscures that one cell. Total 4,776 = 2,449 + 2,327
corroborates it.

**BlueGolf was not a reliable source here, and that generalises.** Its par matched the real card
hole for hole, but **14 of its 18 stroke indexes were wrong**, and it had the 7th 40 m long. The tell
in hindsight: BlueGolf's indexes formed a suspiciously tidy front-evens / back-odds split and handed
the **longest hole on the course's front nine (the 9th, 417 m) stroke index 18** — the easiest. The
real card is a properly mixed allocation and puts the 9th at index **2**. That anomaly was flagged in
the first pass as "worth a look on the course"; it was simply bad data.

The earlier "the card is in yards" deduction was directionally right — BlueGolf's figures were
yards, and 5,158 yd (4,718 m) is close to the true 4,776 m — but it was reasoning off numbers that
were themselves inaccurate. The real card is printed in metres and needs no conversion.

**Red is carried in `course._ladies`, not offered as a playable tee.** It has its own par (67 — the
9th is a par 5 off Red) and its own stroke index, and the app scores every tee off the men's par/SI
until per-tee par/SI lands. Offering Red today would compute a wrong Stableford, so it is stashed in
the shape Gailes already uses, and backlogged as **G-017**.

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
- `gap-fill.mjs` no longer hard-codes `white` as the rated tee — Brisbane River's is Blue, and
  with no `white` key the multi-tee block silently produced nothing.
- The workflow no longer re-runs the OSM fetch on an `aerial` run. It did, with no reason to pass
  name/lat/lng, so the *previous* course's OSM overwrote this one's and the first aerial came back
  over McLeod, 9 km away, with every step reporting success.
