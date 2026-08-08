# Golf Finder — Ideas & Backlog · ⛳ Golf (day finder + on-course Play)

> **Living to-do doc.** Maintained by Claude alongside `IDEAS-STARS.md`. Not append-only:
> every pass should rerank, adjust, merge, retire and add. Format + maintenance rules are in
> **"How this doc works"** at the bottom.
>
> **Last reviewed:** 2026-08-08 · **Next ID:** `G-016`

Legend — tier: `P0` now · `P1` soon · `P2` someday · `P3` parked/needs-decision.
Tags: `[UX]` `[QA]` `[golf]` (the three lenses) · `[needs-phone]` (feel only judgeable on-device) ·
`[data]` (needs new captured/baked data) · `[content]`.

---

## P0 — Now

_(empty — promote from P1 when something becomes the active task.)_

---

## P1 — Soon

### G-001 · On-course feel verification pass for the recent Play GPS/touch work `[QA]` `[UX]` `[needs-phone]`
**Status:** open
PRs #296–#298 shipped auto-score, the persistent scoring console, hole-map pinch-zoom and the
"living" wind compass — all explicitly noted as *feel can only be judged on a real round*. Do a
single on-course pass to confirm: pinch-zoom vs page-scroll on a real touchscreen, the compass
animation reads alive (not busy), auto-advance fires at the right tee distance, and the auto-score
matches reality hole by hole. Each is behind a `window._*` escape-hatch — note any that want
re-tuning rather than disabling. **Add G-010's auto-tee to this pass** (`window._playAutoTee`,
`_playTeeAutoNear`): confirm the tee it captures as you stand on the box is where you actually
teed off, and that the displayed hole length doesn't visibly flicker as you walk up.

### G-014 · On-course verification of the full-screen wind compass `[QA]` `[golf]` `[needs-phone]`
**Status:** open
The 🧭 panel (`openWindCompass`) was built and measured in preview, but its two headline behaviours
are sensor- and place-dependent: (a) the rose spins off `_wcOnOrient`, so held flat it should read
like a real compass — check north is north and that the 0.22 smoothing isn't sluggish or jittery
(`window._windCompassLive=false` disables); (b) the SWIRLING / SHIFTY / STEADY verdict
(`wcSwirl`) is a model call — stand on an exposed tee in a real breeze and see whether the badge
matches what the flag is doing. Also worth sanity-checking that the 25 m / 50 m rungs read plausibly
against a ball flight, and whether `_windFlow` (the particle field) is a help or a distraction in
sunlight. Escape hatches: `_windCompassLive`, `_windFlow`, `_windCool`.

### G-015 · Give the ace tracker a permanent home `[UX]`
**Status:** open
The 🏆 button came off the main header (a hole-in-one is too rare to hold prime real estate) and now
lives in the 📊 Rounds & Stats header plus the Play header. That's *reachable*, not *discoverable* —
if you've never opened stats you won't know aces are tracked. Options: a trophy row inside the stats
dashboard itself (count + last ace, tapping opens the tracker), or fold it into the History tab as a
card. Auto-registration from a scored 1 (`playSyncAce`) already works, so this is purely about where
the shelf lives.

### G-002 · Add more Play courses `[golf]` `[data]`
**Status:** open
28 courses now carry Play geometry (`play-geom/*.json`), so this is no longer "St Lucia only" — it's
about **breadth and depth**. Two threads: (a) more SEQ courses via the **`add-play-course` skill**
(hand-trace is the primary path; picking which is a user call — surface a shortlist), and (b) the
courses already in that shipped on partial data and want a second pass (Gailes is one traced hole;
McLeod has routing but no hazards — see G-011). Prefer depth on a course the user actually plays
over another thin course.

### G-013 · Brisbane River: trace the hole maps `[golf]` `[data]`
**Status:** open
The course shipped **scorecard-only** (`noGps`) because none of the three geometry sources works
for it: OSM holds a single partial boundary way and the clubhouse, the QLD state imagery refuses on
the runner so the only aerial is a drought-stressed Esri capture where greens don't separate from
fairway, and the club's course map is a stylised drawing that fits the true clubhouse to ~40 m —
wider than a hole on a compact estate course with parallel corridors. So the numbering can't be
established, and the skill says ship the card rather than guess. **The unblock is a hand-trace in
`scripts/play/trace-tool.html`, which needs a browser** — `scripts/play/brisbane-river-golf-club.config.json`
already carries the full card (par / SI / CR 65.0 / Slope 116 / Black + Red per-hole distances), so
tracing greens + tees + centrelines and running `from-traced.mjs` finishes it. Full write-up:
`reports/brisbane-river-course-maps-2026-08-08.md`.

### G-011 · McLeod: the standard-card Course Rating `[golf]` `[data]`
**Status:** open
Nearly closed. A club card photographed on the course supplied the **stroke index** (all 18, a clean
1-18 permutation) and **Slope 124** off the White tee, both now baked. What's still missing is the
**Course/Scratch Rating for the standard layout**. The card in hand is a Cardiac Challenge 4-Person
Ambrose *event* layout — it plays 1-6, **7A**, 7, 8 | 9-15, **17**, 18 (short 7A in, 16 out) for par
68 over 5068 m, with 7/11/12/14 off temporary short tees — so its **S/R 67.0 rates that layout, not
the par-71 course**; using it would make `cr - par` = -4 and understate every course handicap by
about 3 strokes. Until a standard card appears the app falls back to CR = par, which is neutral and
safe. One number, one line in `COURSE_PLAY`. (Also still worth doing: confirm the four card-placed
tees — 1, 12, 13, 16 — on-course with **Set tee**.)

---

## P2 — Someday

### G-003 · Per-shot distance-to-pin capture → true strokes-gained `[golf]` `[data]`
**Status:** open
#297 shipped "Where your strokes go" as a deliberate *strokes-lost-lite* and called out why full
shot-by-shot strokes-gained isn't possible yet: we don't store each shot's start distance-to-pin.
Capturing that (the rangefinder already knows distance-to-green at each mark) would unlock a real SG
baseline. Scope the data-model change first; it touches the saved-round schema (`legs`/`holeStats`),
so plan a schema bump + migration.

### G-004 · Elevation-adjusted plays-like `[golf]`
**Status:** open
`_playsLike` models wind only — "Elevation isn't modelled (St Lucia is flat)". Fine for St Lucia, but
a blocker for any hillier course added under G-002. Pair this with the first non-flat course: add an
uphill/downhill term (source per-hole elevation when tracing) so plays-like stays honest. Keep it
behind a tunable like the wind terms. **Related:** the wind compass already computes an air-density
carry nudge (`wcAirCarryPct`, from temp/pressure/humidity at the player's elevation) — if that reads
true on-course it belongs in `_playsLike` too, so the rangefinder and the compass agree.

### G-016 · Feed the wind compass's ladder into the Play rangefinder `[golf]`
**Status:** open
`_playsLike` uses the 10 m wind only, but a full shot spends most of its flight nearer the 25–50 m
rungs the compass now models (`wcProfile`). If G-014 says the rungs read true on-course, weight the
plays-like calculation toward an apex-height wind (a wedge lives lower than a driver, so club-aware)
instead of surface wind. Keep the conservative coefficients and the escape hatch — this changes a
number a player hits a shot on, so it needs the on-course pass first, not before it.

### G-005 · Real multi-tee data for St Lucia `[golf]` `[data]`
**Status:** open
St Lucia has only one baked tee + the white CR/slope, so the multi-tee machinery (`teeSets`/per-hole
`tees`, the tee picker, #259's tee-aware length + landing marker) runs on a single tee. The on-map
**"Set tee"** tool is the current workaround. If real per-tee coordinates + ratings can be sourced
(member package / scorecard), bake them so the tee picker is live.

### G-006 · Scoring/stat trends over time `[UX]` `[golf]`
**Status:** open
The History dashboard (`statsDashboardHtml`) aggregates per scope, but there's no *trend* — is your
FIR/GIR/putts/scoring improving across rounds? A compact sparkline-per-stat or last-N-rounds trend
view would make the stats engine (`psAggregate`) earn more. Pure/testable if kept inside
`PLAY-STATS-CORE`.

### G-012 · Play-course build stages on CI, for the remote environment `[QA]` `[data]`
**Status:** open
`play-osm-fetch.yml` now does Overpass **and** the imagery gap-fill (`mode=fetch|build|both`), because
the remote/web sandbox can't reach either host. It works, but the runner queue stalled 20+ min twice
while building McLeod, and one dispatched run was cancelled while still queued — which is why the
no-imagery `fairwayRibbonM` fallback exists. Worth hardening: have the build stage retry/report, and
consider committing the built JSON as an artifact the session downloads rather than a force-added
commit it later has to remove.

---

## P3 — Parked / needs decision

### G-007 · Smarter single-hazard carry callout `[golf]` `[UX]`
**Status:** parked
An auto next-hazard "carry" strip was **trialled and removed** — too noisy on a tee with multiple
bunkers/water. A narrower version (call out a carry *only* when exactly one hazard is clearly in the
shot corridor) might survive, but it needs a clear "is this hazard actually in play" rule before it's
worth rebuilding. Tap-to-measure covers the gap today. Don't rebuild the noisy version.

### G-008 · Green slope / putt read `[golf]`
**Status:** parked
Not modelled at all. Genuinely useful but hard to do *truthfully* — slope data for SEQ public greens
isn't readily available, and a made-up read would mislead a player over a putt (violates the
pro-golfer lens). Parked until there's a real data source.

### G-009 · "Best tee time today" nudge on the day finder `[UX]`
**Status:** parked
The day view already ranks courses by daylight + weather; it could go one step further and suggest the
*window* in the day with the best combined light/weather. Needs a design that doesn't clutter the
existing list. Low urgency.

---

## Done ✓

### G-010 · Auto-capture the tee so a drive is one Mark `[golf]` `[UX]` `[needs-phone]`
**Status:** done — this PR (branch `claude/tee-mark-shot-drives-dobpvu`)
The drive was the odd shot out: every other shot's *start* is the previous ball's Mark (one tap),
but the drive's start is the tee, so recording a drive from where you actually stood needed
**Set tee + Mark** — two taps, only for the drive. `_playAutoTee` now captures the tee for you as
you stand on the box (each GPS tick, the fix closest to the course's baked tee within
`_playTeeAutoNear`=18 m, flagged `teeAuto`), so a drive is a single `Mark` like everything else.
Manual `Set tee` still overrides (`teeManual` locks auto out); feel needs an on-course check (rolled
into G-001). `window._playAutoTee=false` disables.

---

## Dropped ✗

_(none yet — move items here with a one-line reason.)_

---

## How this doc works (maintenance protocol)

This is a **living** backlog, not an append log. When you (Claude) touch it:

1. **Scan** every open item first — don't add a duplicate of something already here.
2. **Rerank**: items live under a priority tier (`P0`→`P3`) and are ordered top-to-bottom by
   priority *within* a tier. Move an item between tiers as reality changes; reorder freely.
3. **Adjust / merge / split**: edit an item's text to match the code as it is *now*; merge two
   that have become the same; split one that's grown into two. Keep each grounded in a real
   file/feature so it's actionable.
4. **Retire**: when an idea ships, move it to **Done ✓** with its PR (`G-00x — done in #NNN`).
   When an idea is rejected, move it to **Dropped ✗** with a one-line reason. Never silently
   delete — the graveyard is useful memory.
5. **Add** new ideas with the **Next ID** shown in the header, then increment it. **IDs are
   stable and never reused**, so an item can be referenced across sessions/PRs even after it
   moves tier or section.
6. **Bump the header**: update *Last reviewed* (today) and *Next ID* every time.

**Item shape:**
```
### G-00N · Short title `[tier]` `[lens/other tags]`
**Status:** open | parked | in-progress | done | dropped
1–4 sentences: the idea + why + where it lives in the code (the grounding).
```
Keep golf ideas here; night-sky ideas go in `IDEAS-STARS.md` (IDs `S-00N`). If the user asks for
a one-off report (not backlog), that's a committed file under `reports/` per CLAUDE.md — different
thing.
