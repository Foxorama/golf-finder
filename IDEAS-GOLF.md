# Golf Finder — Ideas & Backlog · ⛳ Golf (day finder + on-course Play)

> **Living to-do doc.** Maintained by Claude alongside `IDEAS-STARS.md`. Not append-only:
> every pass should rerank, adjust, merge, retire and add. Format + maintenance rules are in
> **"How this doc works"** at the bottom.
>
> **Last reviewed:** 2026-08-06 · **Next ID:** `G-013`

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

### G-002 · Add more Play courses `[golf]` `[data]`
**Status:** open
28 courses now carry Play geometry (`play-geom/*.json`), so this is no longer "St Lucia only" — it's
about **breadth and depth**. Two threads: (a) more SEQ courses via the **`add-play-course` skill**
(hand-trace is the primary path; picking which is a user call — surface a shortlist), and (b) the
courses already in that shipped on partial data and want a second pass (Gailes is one traced hole;
McLeod has routing but no hazards — see G-011). Prefer depth on a course the user actually plays
over another thin course.

### G-011 · McLeod: real scorecard + hand-traced hazards `[golf]` `[data]`
**Status:** open
McLeod shipped from OSM routing only: all 18 real centrelines, tees and pins, par 71 off the published
card — but **no stroke index, no CR/Slope, no bunkers and no water**, and the greens are 26 m ovals at
the mapped pin with ribbon fairways down the centrelines (`src:'OpenStreetMap routing (greens +
fairways approximate)'`). Three upgrades, in value order: (1) enter the club's real card — `si` per hole
plus `cr`/`slope` (the app currently falls back to hole-number SI and neutral 113/CR=par); (2)
hand-trace the greens, bunkers and the water on 3/4/5/8/9 in `trace-tool.html` (the course map shows
plenty of both) and re-bake via `from-traced.mjs`; (3) confirm the four card-placed tees (1, 12, 13, 16)
on-course with **Set tee** — OSM had a different tee mapped on each, and hole 12 has two printed tees
(12W / 12M). The build config (`scripts/play/mcleod-country-golf-club.config.json`) documents every
assumption, so a re-run is cheap.

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
behind a tunable like the wind terms.

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
