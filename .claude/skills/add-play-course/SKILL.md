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

### 0. Prerequisite — confirm the course is actually mapped in OSM (do this FIRST)
Before anything else, run the containment query (Step 1) **and a wider bbox scan** for
`golf=hole|fairway|green|tee|bunker` around the course. **Newer courses are often not
mapped.** If the queries come back with **no `golf=hole`/`green`/`fairway` ways** (only a
stray cart path or a couple of ponds — as with **Minnippi Golf & Range**, Cannon Hill,
opened 2023, which is **not** in OSM as a golf course as of 2026-06: a bbox scan returns one
`golf=cartpath` way + two unrelated ponds, and the `is_in` containment query is empty), then
**STOP — you cannot source accurate geometry from OSM.** Do **not** fabricate or eyeball
polygons: the entire point of this workflow (and the Step-3 verification) is that the
geometry is real surveyed OSM data whose green polygons can be checked against `cen`. A
hand-invented map can't be verified and will mislead a player on-course — it violates the
project's "implement properly or stop, ensure accuracy" rule.

When the course isn't in OSM, there are three honest options — **surface them to the user
and let them choose; don't silently pick one:**
1. **Contribute the geometry first (accurate path — recommended).** Map the course in
   OpenStreetMap (or obtain an authoritative coordinate source: a GPX walk of the holes,
   council/club GIS, a published GeoJSON), then re-run this workflow unchanged. This is the
   only route that yields a *fully accurate, verifiable* map, and it benefits everyone.
2. **Best-effort traced approximation (accuracy caveat).** Reconstruct routing/greens from
   the course flyover + current aerial imagery and ship a **clearly-labelled approximate**
   map. It cannot pass Step 3's green-polygon check and may be wrong on-course — only do
   this if the user explicitly accepts the caveat.
3. **Defer the course.** Record it as "not yet in OSM" and add an already-mapped course
   instead.

Don't treat "the course exists and has a scorecard online" as "I can map it" — the
scorecard supplies par/SI/CR/slope (Step 2), **not** geometry. They are independent sources.

### 0b. When the course isn't in OSM: extract it from 18Birdies (the proven fallback)
**This is how Minnippi was mapped** (PR adding `minnippi-golf-and-range`) after OSM and Brisbane
City Council GIS both came up empty. The 18Birdies course page is **server-rendered with the
full vector layout inline** — real GPS tee/green geometry, the same data their on-course app uses.

1. **Find the course** on 18birdies.com (`/golf-courses/club/<uuid>/<slug>`). Download the raw HTML
   with PowerShell (`Invoke-WebRequest`, force TLS1.2, a real `User-Agent`; the WebFetch *tool*
   strips the data, so save the HTML and parse it yourself). golfify/mScorecard 403 bots — 18Birdies
   doesn't.
2. **The geometry is in a `props="…"` attribute**, HTML-entity-encoded (`&quot;`→`"`). Decode it,
   then `ConvertFrom-Json`. It's a **wrapped-JSON** format where *every* value is `[tag,payload]`
   (`tag 0`=scalar/object, `tag 1`=array). Unwrap recursively: tag 1 → map over the array; tag 0 →
   if the payload is a `PSCustomObject` unwrap each property, else it's the leaf scalar/null. There
   are ~9 `props` blobs — pick the one containing `holeSets`.
3. **What you get** (`profile.club`): `holeSets` (A=front 9, B=back 9), and `holes[18]`, each with:
   `teeGeoPoints` (6 = Blue/White/Orange × male/female, **duplicated in pairs** → 3 distinct tees,
   index 0=Blue back, 2=White, 4=Orange), `greens[].geoPoints`, `menPar`, `menHandicap` (= the
   **stroke index**, cross-check it against the scorecard — they matched exactly for Minnippi),
   and `teeYardages` (per-tee, **in yards**).
4. **`greens[].geoPoints` is the hole *corridor* outline, not the putting surface** — it spans the
   whole hole (its max-pairwise span ≈ the Blue yardage). It's null-separated into two edges
   (tee→green, then green→tee). Derive:
   - **tee** = `teeGeoPoints[0]` (Blue). Bake Blue: it's geometrically consistent on every hole
     (straight-line tee→green ÷ yardage ≈ 0.91–1.04, doglegs <1). White markers were noisy on a
     couple of Minnippi holes (ratio >1.10, i.e. *longer* than the playing yardage — impossible) so
     **don't bake White**. Set `cr`/`slope` to the **Blue** rating (18Birdies' web scorecard gives
     it; Minnippi Blue = 71.3/130). Forward-tee players use the Set-tee-from-GPS tool.
   - **green centre (`cen`)** = the far end of edge1 (the tee→green edge), pulled ~9 m back toward
     the previous point (the corridor tip ≈ green-back; ~9 m back ≈ centre). Verify: straight-line
     `tee→cen` ÷ `teeYardages[0]·0.9144` should sit ≈ 0.9–1.05 per hole, and the summed centreline
     length should match the official total (Minnippi: 6557 vs 6561 yd).
   - **`gbb`** + a small **synthetic green** polygon (octagon, r ≈ 11 m) centred on `cen`, so
     `holeTargets` matches a green polygon (centroid 0 m from `cen`) instead of falling back to gbb.
   - **centreline** = resample edge1 and the reversed edge2 to N points each, average pairwise;
     force the ends to the tee and `cen`. This follows doglegs (so `holeTargets.len` is dogleg-aware).
   - **fairway** feature = the corridor outline (drop nulls, original order).
5. **18Birdies has no bunkers/water.** Pull real **water hazards from OSM** (a plain bbox query for
   `natural=water` near the course — Minnippi got two ponds + Bulimba Creek) and add them as `water`
   features so the map isn't bare.
6. **Generate the structures with a script, not by hand** — emit the `COURSE_PLAY` holes object and
   the `COURSE_GEOM` JSON. Coords: play (`tee`/`cen`/`gbb`) 7 dp, geometry polygons 6 dp.
7. **DO NOT commit or publish 18Birdies geometry — it is proprietary (not open-licensed like OSM),
   and the exact coordinates are recognisable/traceable to them.** This was the hard lesson on
   Minnippi: it was extracted *and shipped to the public site* before the licensing was raised, then
   had to be pulled. The correct integration is **device-local only**:
   - Write the course's data to a **git-ignored `*.local.json`** of the form
     `{"play":{"<slug>":{…}},"geom":{"<slug>":{…}}}` (add `*.local.json` to `.gitignore`).
   - The public `index.html` keeps a small generic loader (just after the `COURSE_GEOM` definition)
     that merges `localStorage.gf_play_local` over the baked open-data courses, plus
     `window.gfImportPlay`/`gfClearPlay` and an **`#importplay`** paste screen. It contains **no**
     course data and is **not** course-specific.
   - The owner imports the `*.local.json` once on their own device via `…/#importplay`. The public
     app has **no** entry for the course, so the Play button only appears for the owner — genuine
     personal use.
   - Set a per-course **`src:'18Birdies'`** field so the rangefinder footnote
     (`GPS estimate · ${playS.course.src||'OSM'} green data`) reads truthfully.
   - **Flag the licensing the moment 18Birdies is even proposed as a source — *before* extracting,
     not after.** (Par/SI/CR/slope are public scorecard facts and are fine to use, e.g. for
     cross-checking; only the geometry is the sensitive part.)

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
