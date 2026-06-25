---
name: keep-test-hub-in-sync
description: How to keep the test/demo hub (test.html) current whenever you add or change an app TEST HOOK in index.html — a URL param (?time/?wx/?loader/?loaderhold/?ldhole/?yorb/?playshead/?playstail/?tilt*), a live console helper (setTime/setWx/setTilt/setPlaysLike/toggleCompass), a new ?wx weather condition, or a loader variant / power-up form. Use this whenever a change touches how the app is demoed or driven for testing, so the hub and its sync-guard test stay in step.
---

# Keeping the test hub in sync

`test.html` (repo root, served at `…/golf-finder/test.html`) is the single page that
demos every feature of the app. It is deliberately **thin**: it never re-implements app
logic — it loads the real `index.html` same-origin and drives it through the app's
**public test hooks**. That keeps it honest, but it means the hub can silently rot:
rename a hook in `index.html` and the hub's button just does nothing.

Two things keep it from drifting:

1. **`tests/test-hub.test.mjs`** — a sync-guard run by the normal harness (`node
   tests/run.mjs`) and CI (`.github/workflows/tests.yml`) on every PR. It asserts the
   hub's weather buttons match the app's `setWx` conditions exactly, and that every URL
   hook / console helper / loader form the hub relies on still exists in `index.html`.
   When the app and hub drift, **this fails and names what to fix.**
2. **This skill** — the human/agent process: when you add a hook, add the hub control
   *and* extend the guard, in the same change.

## The hub ↔ app contract

The hub touches the app **only** through these surfaces. Nothing else.

| Surface | In `index.html` | In `test.html` |
|---|---|---|
| Scene time | `?time=HH:MM`, live `setTime()` | time slider + presets, auto-cycle |
| Weather | `?wx=<key>`, live `setWx()` map | `WX` array → weather buttons |
| Loader day/night | `?loader=day\|night` | Day-loader / Night Y'orb / Night UFO |
| Loader hold | `?loaderhold=1` | every loader button (so it stays watchable) |
| Day shot outcome | `?ldhole=hole\|miss`, `window._ldForceHole` | Force-hole-in-one toggle |
| Night variant | `?yorb=ufo\|normal` | Night Y'orb / Night UFO |
| Plays-like wind | `?playshead=`/`?playstail=` | Plays-like (default/strong) |
| Immersive sky | `toggleCompass()` | Immersive sky button |

`buildURL()` in `test.html` composes the URL ones; `liveTime()`/`liveWx()` and the
compass call drive the live ones same-origin.

## When you add or change a test hook — the checklist

Do **all** of these in the one change:

1. **Add the hook to `index.html`** behind a `window._*` escape-hatch where it affects
   *feel*, following the existing patterns (the `?loader`/`?loaderhold`/`?ldhole` early
   inline script near the loader; the `setWx`/`setTilt` console helpers; the `initTilt
   Override` URL parser).
2. **Add a hub control in `test.html`.** Stage it into the `state` object and (if it's a
   URL hook) into `buildURL()`; if it's a *live* helper, call it in the desktop handler and
   after a mobile `launch()`. Mirror the half/wide chip idiom already there. Update the
   group's `<p class="note">`.
3. **Extend `tests/test-hub.test.mjs`** so the new hook is guarded:
   - a new `?wx` condition needs nothing extra (the exact-match weather test covers it —
     it will fail until the hub button exists);
   - a new URL param → add its parse token to the `'app still honours every URL hook'` list
     (and the emitted token to `'hub still sends…'`);
   - a new console helper → add it to `'app still exposes the live console helpers'`;
   - a new loader form class → add it to `'loader power-up forms…'`.
4. **Update the docs:** the `test.html` bullet and the relevant test-hook bullet in
   `CLAUDE.md` (under *Time-travel / test hooks*).
5. **Run `node tests/run.mjs`** — it must be green — then ship (the hub deploys with the
   app from `main`, same Pages site, no separate publish step).

## Gotchas

- The hub drives the app **same-origin** — both are served from the Pages site, so
  `iframe.contentWindow.setTime(...)` works. It will NOT work from `file://` or a
  cross-origin host; always test through the inline static server / the live site.
- The **loader is first-paint only** and picks day/night from the **real device clock**,
  so it can't read `?time=`. That's why loader demos use `?loader=` + `?loaderhold=1`
  (hold it open) rather than the time hooks. Don't "fix" the hub to use `?time=` for the
  loader — it won't show.
- Touches inside the app's `<iframe>` never bubble to the hub, so the mobile swipe-to-close
  gestures must stay attached to hub chrome (the top bar + left-edge strip), never the app.
- The guard test parses `index.html`/`test.html` as **text** (regex), because there's no
  build step and the app can't be imported. If you reshape `setWx`'s `const m={…}` literal
  or rename the hub's `WX` array, update the extractor regexes in the test too.
