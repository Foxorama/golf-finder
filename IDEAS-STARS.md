# Golf Finder — Ideas & Backlog · ✦ Stars (night sky-watching mode)

> **Living to-do doc.** Maintained by Claude alongside `IDEAS-GOLF.md`. Not append-only:
> every pass should rerank, adjust, merge, retire and add. Format + maintenance rules are in
> **"How this doc works"** at the bottom.
>
> **Last reviewed:** 2026-06-23 · **Next ID:** `S-008`

Legend — tier: `P0` now · `P1` soon · `P2` someday · `P3` parked/needs-decision.
Tags: `[UX]` `[QA]` `[sky]` (the three lenses; "pro golfer" → "true to the sky" here) ·
`[needs-phone]` (feel/tilt only judgeable on-device) · `[content]` (Flux art / lore) ·
`[data]` (catalog / coordinates) · `[accuracy]`.

---

## P0 — Now

_(empty — promote from P1 when something becomes the active task.)_

---

## P1 — Soon

### S-001 · Source the astral-form art for the 3 chart-only constellations `[content]` `[sky]`
**Status:** open
`centaurus`, `sagittarius` and `carina` deliberately have **no `HERO_ART`** entry right now — their
star charts were rebuilt to the accurate standard figures, so the old (wrong-chart) Flux creatures were
retired and they render the clean static chart. CLAUDE.md notes "the astral form for them is being
sourced separately — re-add the slug to `HERO_ART` to overlay it." Generate registered creature-skeleton
heroes for these three (the `REG_HERO` recipe / `astral-heroic-card-art` skill) and re-add the slugs.

### S-002 · On-device tilt / feel tuning pass for the immersive sky map `[UX]` `[QA]` `[needs-phone]`
**Status:** open
The conformal tilt-to-pan compass view (dome projection, comfort-tilt curve, heading/pitch smoothing,
zenith hold) is the night mode's signature *feel* and is explicitly "only judgeable on a real phone."
Do a single on-device pass and tune via the live levers (`?tiltgain/lift/ceil/floor`,
`setTilt(...)`, `window._tiltPan`/`_camAz`/`_skyDome`/`_skyFov`) — confirm pointing overhead, a fast
360° near the zenith, and a natural eye-height hold all behave, then bake any better defaults.

---

## P2 — Someday

### S-003 · Event notifications (aurora / ISS / meteor peaks) `[UX]` `[sky]`
**Status:** open
The app is an installable PWA and already computes/fetches live events (aurora Kp, solar flares, ISS,
meteor showers, oppositions, comets). Letting a user opt into a local/push notification — "aurora Kp
spiking tonight", "ISS pass in 10 min", "Geminids peak tonight" — would make the night mode something
you *return* to, not just open. Scope notification permission + a background trigger carefully (PWA
background limits); start with on-open "happening now/tonight" nudges if true background is too costly.

### S-004 · Re-roll tighter skeletons for the drifting multi-limb figures `[content]` `[accuracy]`
**Status:** open
Registration "varies": clean single-body figures (Scorpius, Leo, Orion) hold the real stars exactly,
but complex multi-limb ones (**Centaurus, Taurus**) get compacted by Flux so a few extremity stars
(horn-tips, hooves) drift off the painted body. The app overlay still draws them at true positions, so
it's cosmetic — but re-rolling a tighter creature-skeleton per the `REG_HERO` recipe would close the
gap. Do opportunistically when regenerating art (pairs with S-001).

### S-005 · Expand deep-sky + event coverage `[content]` `[sky]`
**Status:** open
The card system is built to take more: add `DEEPSKY` objects and `SKY_EVENTS`/`COMETS` entries via the
documented "add an event type" / `astral-heroic-card-art` recipes (descriptor + `SKY_LORE` +
`skyLocus` branch + `SKY_RARITY` + optional `CARD_PHOTO`). Keep everything **real and Australia-visible**
and verify coordinates/visibility per the auditing recipe before committing. Any new `DEEPSKY`
object should also get a bespoke `_LOC_DEEP[slug]` thumbnail renderer (see S-008 in Done) so its
card art is unique, not the per-type fallback.

### S-006 · Full coordinate-accuracy audit of all figures + deep-sky `[accuracy]` `[QA]`
**Status:** open
CLAUDE.md documents a `preview_eval` nearest-neighbour audit against `star-catalog-deep.json` (the
method that caught the Jewel Box RA error in #154). Run it across **every** `STAR_FIGURES` /
`STAR_LOOSE` star and `DEEPSKY` object as a periodic regression — flag anything >0.06° or |Δmag|>0.6,
allowing for known real doubles (μ Sco, Sabik). Cheap insurance against a bad datum drawing the wrong
outline.

---

## P3 — Parked / needs decision

### S-007 · Light-pollution / sky-quality by location (Bortle) `[sky]` `[data]`
**Status:** parked
The naked-eye (≤6.5) vs binoculars (≤7) depth toggle is a fixed proxy for sky darkness. A real
Bortle/SQM estimate for the viewer's GPS could set a *truthful* visible-magnitude limit (city vs dark
site). Needs a light-pollution data source and a clear UX; parked until both are settled. Don't fake
it — a wrong limit misleads about what's actually visible (the "true to the sky" lens).

---

## Done ✓

_(none yet — move items here with their shipping PR link, e.g. `S-0xx — done in #123`.)_

---

## Dropped ✗

_(none yet — but note the precedent: the Super-Saiyan "space manta" loader berserker was trialled and
dropped (#295) because a true side→rear morph can't be done cleanly in SVG. Art preserved in
`assets/night-loader-space-manta.html`.)_

---

## How this doc works (maintenance protocol)

This is a **living** backlog, not an append log. When you (Claude) touch it:

1. **Scan** every open item first — don't add a duplicate of something already here.
2. **Rerank**: items live under a priority tier (`P0`→`P3`) and are ordered top-to-bottom by
   priority *within* a tier. Move an item between tiers as reality changes; reorder freely.
3. **Adjust / merge / split**: edit an item's text to match the code as it is *now*; merge two
   that have become the same; split one that's grown into two. Keep each grounded in a real
   file/feature so it's actionable.
4. **Retire**: when an idea ships, move it to **Done ✓** with its PR (`S-00x — done in #NNN`).
   When an idea is rejected, move it to **Dropped ✗** with a one-line reason. Never silently
   delete — the graveyard is useful memory.
5. **Add** new ideas with the **Next ID** shown in the header, then increment it. **IDs are
   stable and never reused**, so an item can be referenced across sessions/PRs even after it
   moves tier or section.
6. **Bump the header**: update *Last reviewed* (today) and *Next ID* every time.

**Item shape:**
```
### S-00N · Short title `[tier]` `[lens/other tags]`
**Status:** open | parked | in-progress | done | dropped
1–4 sentences: the idea + why + where it lives in the code (the grounding).
```
Keep night-sky ideas here; golf ideas go in `IDEAS-GOLF.md` (IDs `G-00N`). If the user asks for a
one-off report (not backlog), that's a committed file under `reports/` per CLAUDE.md — different thing.
