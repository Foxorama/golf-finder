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

### 0b. If the course isn't in OSM but a third-party golf-GPS source has it
A golf-GPS app or site may carry the course's vector geometry (greens, tees). **That data is
proprietary** — not open-licensed like OSM, and the exact coordinates are traceable to the
provider. So, before touching it:

- **Flag the licensing to the user the *moment* such a source is even proposed — before you
  extract anything, not after.** (Hard lesson learned here: data was extracted and shipped to
  the public site before the licensing was raised, then had to be pulled and scrubbed from
  history.) Get explicit sign-off, and treat it as **personal use only**.
- **Never commit or publish third-party geometry.** Integrate it **device-local only**:
  - Write the course's data to a **git-ignored `*.local.json`**:
    `{"play":{"<slug>":{…}},"geom":{"<slug>":{…}}}` (`.gitignore` already covers `*.local.json`).
  - The public `index.html` carries only a small **generic** loader (just after the
    `COURSE_GEOM` definition): it merges `localStorage.gf_play_local` over the baked open-data
    courses, plus `window.gfImportPlay`/`gfClearPlay` and an **`#importplay`** paste screen.
    It holds **no** course data and is not course-specific.
  - The owner imports the `*.local.json` once on their own device via `…/#importplay`, so the
    Play button appears for them and no-one else.
  - Set a per-course **`src:'<source>'`** field so the rangefinder footnote
    (`GPS estimate · ${playS.course.src||'OSM'} green data`) reads truthfully.
- Par/SI/CR/slope are **public scorecard facts** (the club site / golfpass) and are fine to use
  and cross-check; only the **geometry** is the sensitive part.

Detailed derivation notes (parsing a provider's embedded layout, deriving green centres from a
hole corridor, synthesising greens, dogleg-aware centrelines, pulling OSM water) are kept in
private session memory — deliberately **not** in this public repo.

### 0c. Multi-course sites — a club with 2+ courses → `layouts`
A club that runs more than one course (Nudgee, Coolangatta & Tweed Heads, Sanctuary Cove) is ONE
`COURSE_PLAY[slug]` entry carrying **`layouts:[{key,name,par,holesN,holes,noGps?,cr?,slope?}]`**.
`openPlay(name)` then shows a picker; `openPlay(name,key)` plays a layout under its own slug
`<courseSlug>-<key>` (independent geometry/draft/rounds). Each GPS layout's geometry is its own
`play-geom/<courseSlug>-<key>.json`; a `noGps:true` layout needs only `holes:[{n,par}]`. Build each
course exactly like a single course (Steps 1–3), then hand-assemble the one `layouts` entry. OSM
maps the courses one of two ways — check which before splitting:

- **Separate `golf_course` polygons (preferred; Sanctuary Cove).** Each course is its own area, so
  `is_in` at each course's clubhouse — or a bbox over the whole site — already separates them. If one
  course spans two polygons, `way(id:a,b); map_to_area ->.pa; (way["golf"](area.pa);…);`. Watch for a
  **neighbouring club** in the bbox (Links Hope Island abuts Sanctuary Cove — set the bbox edge to
  exclude it). Find a clean **discriminator** to bucket holes whose anchors straddle the boundary: at
  Sanctuary Cove, **Pines holes carry OSM `par` tags and Palms holes carry none**, which split the 36
  cleanly even though two Palms holes leaked into the Pines `is_in`.
- **One polygon, holes share refs 1–18 (Coolangatta & Tweed Heads).** A 36-hole area with two of each
  ref — `build-play-course.mjs`'s longest-per-ref dedup would **mix the two courses**. Use
  **`scripts/split-play-site.mjs <osm.json> <outPrefix>`**: a routing-aware DP that assigns the
  two-per-ref holes to the two real 18s by minimising consecutive green→tee gaps (each real course is a
  tight routing; a mixed split forces long inter-course jumps). It writes `<outPrefix>_A.json` /
  `_B.json` (per-course OSM-geom, features assigned by nearest centreline) → feed each to
  `build-play-course.mjs`. **Confirm the split** by checking each course's straight-line hole lengths
  match its published scorecard hole-for-hole (that also tells you OSM ref = scorecard hole, and which
  half is which named course).

**When a course's OSM hole NUMBERING can't be trusted, ship it `noGps` with card par, don't guess.**
Sanctuary Cove's Palms has full geometry but its OSM refs are neither the playing order nor any
rotation of the card (a min-gap routing reconstruction didn't reproduce the card par pattern), so its
physical-hole↔playing-order mapping is unresolvable remotely → it ships scorecard-only (par 70,
corroborated by the card AND an OSM length-class count) until an authoritative source arrives. A
single unmapped **green** is fine (the synth centreline-end fallback handles it — Pines hole 14); a
scrambled **numbering** is not.

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
  course's real scorecard (golfpass / the club site). Sanity: the 18 SIs
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
