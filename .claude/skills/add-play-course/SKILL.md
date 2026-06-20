---
name: add-play-course
description: The end-to-end workflow for adding a new course to the on-course Play feature (GPS rangefinder + hole maps + scorecard + handicap) in index.html — the two baked data structures, how to source them from OpenStreetMap, how to verify, and how to ship. Use this whenever you add another course to COURSE_PLAY so every course is built and checked the same way St Lucia was.
---

# Adding a course to on-course Play

Play (the `⛳ Play · GPS rangefinder & scorecard` button on a course card) is gated
to courses present in **`COURSE_PLAY`**. Adding a course = supplying two baked,
inline data structures in `index.html` and verifying them. Everything else (the
sheet, tabs, rangefinder, wind, My Bag, club tracking, handicap) is generic and
already works for any course in `COURSE_PLAY`.

There is **no build step** — both structures are literal JS objects in `index.html`.
All distances are computed at runtime from the player's GPS vs this baked geometry.

> The course must already exist in the `COURSES` array (the finder list) with a
> matching `name`. The Play button appears automatically when
> `slugify(course.name)` is a key in `COURSE_PLAY` (see the `ccard-play` button).

## The two structures (both keyed by the course **slug**)

`slug = slugify(name)` → lower-case, `&`→`and`, non-alphanumerics→`-`. St Lucia's
is `st-lucia-golf-links`.

### 1. `COURSE_PLAY[slug]` — holes, ratings, stroke index

```js
'st-lucia-golf-links': {
  name:'St Lucia Golf Links', par:69, holesN:18, cr:67.5, slope:114,
  holes:[
    {n:1, par:4, si:12, tee:[lat,lng], cen:[lat,lng], pin:[lat,lng]|null,
     gbb:[minLat,minLng,maxLat,maxLng]},
    … one per hole …
  ],
}
```

| field | meaning | consumed by |
|---|---|---|
| `par`,`holesN` | course par + hole count | totals, scorecard, partial-round logic |
| `cr`,`slope` | **white-tee** Course/Scratch Rating + Slope | `courseHandicap()` → net + Stableford |
| `n`,`par` | hole number + par | everywhere |
| `si` | **stroke index 1–18, each used once** | `strokesForSI()` allocates handicap strokes |
| `tee` | back-tee end of the OSM hole centreline | tee marker, tee-shot Mark, hole length |
| `cen` | OSM green **centroid** (centre of green) | the headline "centre" distance + FRONT/BACK derivation |
| `pin` | a surveyed cup if OSM maps one, else `null` | **kept for reference only — not surfaced** (pins move daily; rangefinder leads with front/centre/back) |
| `gbb` | green bounding box `[minLat,minLng,maxLat,maxLng]` | **fallback** front/back depth when no green polygon matches |

`holeTargets(h)` turns this into front/centre/back + dogleg-aware length: it prefers
the **matched green polygon** from `COURSE_GEOM` (the green whose centroid is within
15 m of `cen`) for the true near/far edges, and only falls back to `gbb`. So `cen`
must be a real green centroid and the geometry must include that green polygon.

### 2. `COURSE_GEOM[slug]` — the drawable hole map

```js
'st-lucia-golf-links':{
  "features":[ {"t":"fairway","pts":[[lat,lng],…]}, {"t":"green",…},
               {"t":"bunker",…}, {"t":"water",…}, {"t":"tee",…} … ],
  "lines":{ "1":[[lat,lng],…tee→green centreline…], "2":[…], … "18":[…] },
  "pins":[ [lat,lng], … ]   // optional; informational
}
```

- `features[].t` ∈ `fairway | green | bunker | water | tee`. Polygons are closed by
  the renderer (`playHoleSvg` adds `Z`).
- `lines[n]` is the **per-hole centreline**, ordered (either way — the renderer
  orients it tee→green). It MUST start within ~0.1 m of the hole's `tee` and end
  within ~5 m of `cen` (used for the play-line-up rotation, dogleg length via
  `_pointAlong`, hazard-on-line tests, and `_featOwner`).
- Keep it small: RDP-simplify polygons to **~1–2.5 m** tolerance (St Lucia is ~28 KB).
  Coords to **6 dp**.

`_featOwner` assigns each feature to its nearest centreline once, so the current
hole renders full-strength and neighbours fade — no per-feature hole tagging needed.

## Step-by-step

### 1. Source geometry from OpenStreetMap
Overpass, the **`is_in` containment** query (never grabs a neighbouring course):
```
[out:json][timeout:40];is_in(LAT,LNG)->.a;area.a["leisure"="golf_course"]->.g;
(way["golf"](area.g);relation["golf"](area.g);node["golf"](area.g);way(pivot.g););out geom;
```
- In the sandbox, **`curl` to Overpass gets 406** — use the **WebFetch tool**, which
  reaches it at full coord precision (see the `overpass-data-via-webfetch` memory). The
  CI prebake (`scripts/build-course-maps.mjs`) and the app's runtime `fetchCourseOSM`
  use the same query.
- OSM `golf=*` tags map to feature types: `fairway`,`green`,`tee`,`bunker`,
  `water_hazard`/`lateral_water_hazard`→`water`, `hole`→a centreline.

### 2. Derive `COURSE_PLAY`
- `tee` = the back-tee end of each `golf=hole` way; `cen` = centroid of that hole's
  `golf=green` polygon; `gbb` = that green's lat/lng bounding box; `pin` = a
  `golf=pin` node if present (holes that have one), else `null`.
- `si` (stroke index) and `cr`/`slope` are **NOT in OSM** — take them from the
  course's real scorecard (golfpass / 18Birdies / the club site). Sanity: the 18 SIs
  must be a permutation of 1–18; the common convention is front-nine evens /
  back-nine odds (St Lucia) but follow the actual card.
- `lines[n]` = the simplified `golf=hole` centreline, oriented later by the app.

### 3. Verify in preview (do every check)
Spin up the throwaway static server and drive it (full recipe in `CLAUDE.md` →
"Verifying visuals"). Resize to **mobile** first. Then, in `preview_eval` with
`openPlay('<Course Name>')`:

1. **Lengths & par**: `holeTargets(h).len` per hole sums to a believable white-tee
   total; `par`/`holesN`/out+in pars are right. Dogleg holes should read longer than
   straight-line `_distM(tee,cen)`.
2. **Stroke index**: the 18 `si` are 1–18 unique.
3. **Green match**: every hole's `cen` has a `green` polygon centroid within ~2 m
   (so `holeTargets` uses the polygon, not the `gbb` fallback). Front/back depths
   land ~14–30 m.
4. **Centreline endpoints**: `lines[n]` starts ≤0.5 m from `tee`, ends ≤~5 m from
   `cen` (else dogleg length + tee-shot marker fall back / drift).
5. **Tap-to-measure round-trip**: forward-project a known point through
   `window._playMapProj` and invert it — must be ~0 m (CLAUDE.md has the snippet).
6. **Screenshots**: a long hole and a par-3 — the hole fills the adaptive map, the
   compass sits top-right, tee/green/flag/you-dot read correctly.
7. **No console errors** (`preview_console_logs level:error`).

Simulate GPS with `window.__playPos=[lat,lng]` (test hook) + `playLiveUpdate()`.
Disable auto-advance during manual hole-stepping tests: `window._playAutoHole=false`.

### 4. Ship
Branch → edit → commit → `gh pr create` → `gh pr merge --merge --delete-branch`
(`CLAUDE.md` → "Change & versioning flow"). Windows/PowerShell gotchas that bite:
- Write commit/PR text to a **UTF-8-no-BOM** file and use `-F` / `--body-file`
  (piping adds a BOM). `gh` is **not on PATH** — call the full path.
- Normalise CRLF→LF before multi-line `.Replace()` edits; write back UTF-8-no-BOM.
- **No `CACHE` bump needed** — `index.html` and the inline geometry are network-first
  in `sw.js`; only bump `CACHE` if you change the precache `SHELL` list.
- Delete `.claude/launch.json` (+ any `serve.ps1`) when done; stage `index.html`
  explicitly, never `git add .`.

## Not course data — don't bake these
- **My Bag** (`gf_bag`) and **club stats** (`gf_club_stats`) are **per-user** localStorage,
  not per-course. Nothing to add.
- **Multiple tees** (black/blue/red with their own CR/Slope/lengths) need real per-tee
  ratings + coordinates that OSM does **not** provide. We deliberately did **not** build a
  hollow tee picker; instead the **"Set tee" map tool** (`playSetTeeHere`) lets the player
  set this hole's tee from GPS for the round. If you later have a course's real multi-tee
  scorecard, that's the point to design a proper `tees:[…]` structure — until then, one
  `cr`/`slope` (the tee you rate against) per course.

## Quick reference — who reads what
- `COURSE_PLAY` → `openPlay`, `holeTargets`, `playTotals`, `courseHandicap`,
  `strokesForSI`, `playShotLegs`, `teeShotClub`.
- `COURSE_GEOM` → `playHoleSvg` (map), `holeTargets` (green polygon), `_featOwner`,
  `playCarries`-style line tests, `_pointAlong` (centreline).
- Distances: `_distM` (haversine-ish), `_bearingDeg`, `_destPoint`, `_pointAlong`.
- Test hooks: `?time=`, `window.__playPos`, `window._playWindTest`, `window._playAutoHole`,
  `window._playsLike`/`setPlaysLike`.
