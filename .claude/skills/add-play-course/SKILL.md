---
name: add-play-course
description: The end-to-end workflow for adding a new course to the on-course Play feature (GPS rangefinder + hole maps + scorecard + handicap) in index.html — the two baked data structures, how to source them (OpenStreetMap when complete; open-data triangulation when OSM is sparse), how to QA-review every hole, and how to ship. Use this whenever you add another course to COURSE_PLAY so every course is built and checked the same way.
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

### 0. First — is the course in OSM, and does open imagery show it?
Run the containment query (Step 1) **and a wider bbox scan** for
`golf=hole|fairway|green|tee|bunker` around the course. **Newer courses are often thin or
absent in OSM** (e.g. **Minnippi Golf & Range**, Cannon Hill, opened 2023, is **not** in OSM
as a golf course — a bbox scan returns one `golf=cartpath` way + a couple of ponds, and
`is_in` is empty). OSM coverage falls into three cases, and **none of them is a hard STOP any
more** — they just change which path you take:

- **OSM complete** (hole ways + greens + fairways, like St Lucia) → the clean Steps 1→3 below.
- **OSM sparse** (some hole lines, few/no greens, no fairways, like Oxley) → **§0a**, triangulate
  the gaps from open data.
- **OSM absent** (no golf ways at all, like Minnippi) → **§0a too**: build *every* green + tee
  from the open aerial (proven public on Minnippi — greens/tees traced from Esri imagery).

**The one real STOP:** open aerial imagery that **predates the built course** (bare
dirt/paddock where the holes should be) — you can't trace what isn't photographed yet. So
**check the aerial first** (fetch an Esri World Imagery tile of the extent and look). If the
finished course is visible, proceed via §0a; if not, **defer** and record it as "not yet in
open imagery". Never fabricate or eyeball polygons with no imagery to trace.

Don't treat "the course has a scorecard online" as "I can map it" — the scorecard supplies
par/SI/CR/slope (Step 2), **not** geometry. They are independent sources.

### 0a. OSM sparse OR absent → triangulate from open data (the Oxley / Minnippi path)
Whether OSM is **thin** (missing `ref`s, no fairways, a couple of greens — Oxley: refs on 2/17
hole lines, 0 fairways, 2/18 greens) or **entirely absent** (no golf ways at all — Minnippi),
**triangulate from open data**. Proven public on **Oxley (PR #214/#215)** and **Minnippi (PR #220,
fully aerial)**. This is the unified "best source available, per feature" workflow that combines
OSM + non-OSM; full method + tooling in the `play-triangulation-pipeline` memory. **It is
productionised in `scripts/play/`**: `gap-fill.mjs` takes an OSM JSON + a per-course config (the
numbering/scorecard/tee distances you resolve) and emits the built `{play,geom}` with the gap-fills
+ cross-checks below — pure Node, no deps (built-in `fetch`/`zlib`, a vendored PNG decoder). See
`scripts/play/README.md`; `oxley-golf-club.config.json` (sparse) and
`minnippi-golf-and-range.config.json` (absent — every hole placed by hand from the aerial) are the
worked examples.

| feature | primary (best) | open-data gap-fill |
|---|---|---|
| hole numbers | OSM `ref` | official **course map** badges read as *topology* + a tee→green **routing chain** |
| centreline | OSM `golf=hole` | tee→green — **TRIM it if it overshoots the tee** (see QA §3a) |
| green polygon | OSM `golf=green` | **oval** sized to `gbb` / the greenside-bunker footprint, at the real centre |
| green centre + WHICH END is the green | OSM centroid | line-end + **greenside-bunker proximity** (the end with bunkers ≤~20 m is the green) |
| bunkers | OSM | **sand** traced from imagery (`traceBunkers`: compact bright-tan blobs → ellipses, deduped). Best-effort; **grass-faced bunkers don't show** (they read as rough, e.g. Minnippi) |
| water | OSM **hydrology** (`natural=water`/`waterway`/`landuse=reservoir,basin` — expand the OSM query to fetch these) | — NOT imagery (dark tree-shadow is indistinguishable from dark water in RGB) |
| fairway / centreline | OSM `golf=fairway`/`hole` | trace the **grass corridor between tree lines**; placed (no-OSM) holes route the centreline through it with a **straight-line tube prior** (anti-wander) + a `via` waypoint for the odd dogleg the build flags |
| tees (per colour) | OSM `golf=tee` (rare) | **card distance back along the centreline** from the green (open, per-tee, accurate) |
| par / SI / CR / Slope | — | official **scorecard** only — facts, never fabricate; Slope often absent → default 113 |

**Sources:** official scorecard (image → crop+enlarge+vision-read), the club's `Course-map.png`
(numbering — read **qualitatively**; do NOT metric-overlay a stylized illustration, an affine fit
gave 45–106 m residuals), and **Esri World Imagery** export (`…/World_Imagery/MapServer/export?
bbox=&bboxSR=4326&imageSR=4326&size=&format=png&f=image`, georeferenced so pixel↔latlng is linear,
OSM-tracing-approved; production-preferred is QLD CC-BY imagery). **Tooling:** the productionised
pipeline (`scripts/play/`) is **pure Node** — built-in `fetch` + a vendored PNG decoder (`lib-png.mjs`)
+ Node geometry; the old PowerShell-mask step is retired (PS array-of-arrays fights vector math — see
`play-build-pipeline-node`). **Cross-check gates:** traced length vs card
(>15% ⇒ flag), green-end vs bunkers, numbering vs map. A hole with **no OSM line at all** (Oxley hole
7) is the hard case — place it from the course map + routing and **flag it for on-course Set-tee
confirmation**; don't pretend it's surveyed.

**Fully-absent courses (no OSM holes at all) — place every green + tee from the aerial.** There are
no hole lines to anchor to, so trace each green + back-tee directly from open imagery (Minnippi, PR
#220): fetch a tight Esri crop aimed at each feature, then take the **green-turf centroid** by a
**smoothness-weighted mean-shift** — green = bright lush turf (`G≥R+2 && G>B+~22 && bri 95..205`),
weighted `exp(-d²/2σ²)·1/(1+(localStd/7)²)` so the smooth putting surface wins over the abutting
fairway apron (σ≈9 m, radius ≈22 m; tees σ≈7 m / R≈16 m, seeded at the tee box). **Verify every
green by re-cropping centred on the computed centroid — it must sit dead-centre**; tree-framed
greens drift and become flagged estimates (Minnippi h8). Sanity-gate each straight tee→green length
against par (par-3 ~100–190, par-4 ~260–410, par-5 ~430–540 m). Feed the 18 `{n,par,si,green,tee}`
**placed** holes to `gap-fill.mjs` (`green`+`tee` per hole) with **`options.traceFairways:true`**, so each
placed hole ALSO gets its **dogleg centreline + fairway** traced from the aerial (`traceHoleCorridor` —
a centre-biased shortest path through the grass corridor, then a ribbon), not just a straight tee→green
line; this also makes `holeTargets` lengths **dogleg-aware** (Minnippi PR #223 added this — without it the
maps had no fairways and missed every dogleg/turn). Water = OSM ponds **plus any creek/river/basin**,
re-tagged `golf=lateral_water_hazard` (note: the play map only draws water on a hole whose corridor is
near it — a distant boundary creek won't show on far holes, and the doglegs help by bringing corridors
closer to in-play hazards). Greens are aerial estimates (~±5 m) so set `course.src:'aerial imagery'`
(honest footnote) — slightly-less-accurate is fine here; the visible green marker + the Set-tee tool
correct them on-course.

### 0b. Don't use proprietary golf-GPS data — build from the aerial instead
A golf-GPS app or site may carry a course's vector geometry (greens, tees). **Don't use it.** It's
**proprietary** (not open-licensed like OSM; the coordinates are traceable to the provider), and you
**no longer need it** — §0a builds even a fully-OSM-absent course from open Esri imagery. (Minnippi
was an earlier proprietary import that was pulled and **rebuilt from the aerial in PR #220**; the
old device-local `#importplay` mechanism has been removed.) So: **never extract, commit, or publish
third-party golf-GPS geometry.** Par/SI/CR/slope are public scorecard facts (club site / golfpass)
and remain fine to use and cross-check — only the geometry was ever the sensitive part.

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

### 3a. Per-hole QA review — every hole shows EXACTLY its own features
**Mandatory for triangulated/synthetic geometry** (it has failure modes OSM-clean courses don't;
the user asked for this gate after the first Oxley build shipped with visible defects). Step
through every hole (`openPlay` → next) and confirm it shows *only* what belongs to it — nothing
missing, nothing spurious: ✓ **one** green, sitting on the green; ✓ tee marker at the start with
the play-line tee→green up the screen; ✓ fairway spanning tee→green with **no overshoot at either
end**; ✓ bunkers/water only where they belong; ✓ nothing from a *neighbouring* hole drawn bright (a
**dimmed** neighbour at the frame edge is normal context, not a bug); ✓ tee-shot club marker (if
shown) lands on the fairway; ✓ length ≈ card. Two real Oxley bugs this caught:
- **Two green circles on a hole (or zero).** A synthetic green placed too near a neighbour's makes
  `_featOwner` (nearest-centreline) assign both to one hole and none to the other (Oxley hole 7's
  estimate sat ~17 m from hole 9's green). **Programmatic check:** `_featOwner(geom)` then count
  green features per `_own` — **each hole must own exactly 1**, none missing.
- **Fairway / play-line / length starting BEHIND the tee.** An OSM centreline overshooting the tee
  (Oxley hole 8 ran 176 m past it to a car park → 449 m vs the real 273 m). **Fix:** trim `lines[n]`
  to tee→green and rebuild that hole's fairway from the trimmed line.

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
- **Multiple tees** (black/blue/white/red) ARE supported (PR #217 build + #218 refinements). Data:
  per-hole `tees:{black:[lat,lng],…}` + course `teeSets:[{key,name,cr,slope}]` + `defaultTee` (one
  `tee` + `cr`/`slope` stays the white/rated default for backward-compat). The **selector sits in the
  map-tools row**; the choice is **per-hole with carry-forward** — picking a tee applies from that
  hole onward and never rewrites earlier/played holes (`teeSelByHole`; a closed tee box on one hole
  is a one-hole switch). `_effTee` / `holeTargets` (length) / `courseHandicap` all honour it
  (handicap off the round's **primary** = hole-1 tee); the map tee marker is coloured to the tee.
  **To populate a course**, put each tee's **card distance** in the build config (`tees:{black:343,…}`)
  — the pipeline places them (white = the rated tee, others stepped back along the play line by the
  card delta). Courses with no `teeSets` keep one tee + the **"Set tee" GPS tool**, unchanged.

## Quick reference — who reads what
- `COURSE_PLAY` → `openPlay`, `holeTargets`, `playTotals`, `courseHandicap`,
  `strokesForSI`, `playShotLegs`, `teeShotClub`.
- `COURSE_GEOM` → `playHoleSvg` (map), `holeTargets` (green polygon), `_featOwner`,
  `playCarries`-style line tests, `_pointAlong` (centreline).
- Distances: `_distM` (haversine-ish), `_bearingDeg`, `_destPoint`, `_pointAlong`.
- Test hooks: `?time=`, `window.__playPos`, `window._playWindTest`, `window._playAutoHole`,
  `window._playsLike`/`setPlaysLike`.
