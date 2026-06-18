# Golf Finder — working notes for Claude

A single-file PWA: by **day** it shows playable SEQ (South-East Queensland) golf
courses by daylight + weather; by **night** it flips to a star/sky-watching view.
Hosted on GitHub Pages at https://foxorama.github.io/golf-finder/ (deploys from
`main`).

## How to work with me (ground rules)
- **Pressure-test my ideas before building them.** Don't just implement on
  command. If an idea is sound, say so and go. If it isn't, push back: question
  the premise and propose a better solution/alternative, or flat out say
  *"that's not a great idea, Dave."* A cheerful "yep, let's do it" followed by a
  half-working result is the worst outcome — I'd rather get the friction up front.
- **Implement properly or stop.** If you can't do something well, don't ship a
  shaky version of it. Stop, re-check, and either ask for the extra context you
  need or take the time to do it right. Bouncing off the same concept three or
  four times is what frustrates me; a request for clarification or a "this can't
  be done cleanly because X — here's what I'd do instead" is always welcome.
- **Promote durable knowledge out of memory.** Your per-session memory is a private
  scratchpad; `CLAUDE.md`, the `.claude/skills/`, and these notes are the *shared*
  record. Whenever you save a memory that's worth keeping for the project — a
  verification recipe, a hard-won gotcha, an architecture note, a workflow — also
  surface it where the repo can see it (a `CLAUDE.md` section, a skill, or a
  workflow doc), so the knowledge isn't siloed where only you can read it. When you
  write a memory, ask "does this belong in the shared docs too?" and, if so, do both.

## Layout
- **`index.html`** — the whole app (HTML + CSS + JS, ~190 KB). Almost all work
  happens here. There is no build step; the file ships as-is.
- **`sw.js`** — service worker (offline shell + makes it installable).
- **`course-maps.json`** — pre-baked OSM golf-course geometry (CI-generated;
  runtime Overpass fetch is the fallback). `scripts/build-course-maps.mjs` +
  `.github/workflows/course-maps.yml` generate it (manual-dispatch; Overpass
  throttles CI IPs, so it often needs a residential connection — left as-is).
- **`star-catalog.json`** / **`star-catalog-deep.json`** — *optional* pre-baked
  star field for night mode, from the public-domain HYG database. One bake run of
  `scripts/build-star-catalog.mjs` (+ `.github/workflows/star-catalog.yml`,
  manual-dispatch; static J2000 data so it's one-time) writes **both**:
  `star-catalog.json` (mag ≤ 6.5 ≈ dark-sky naked eye, the "naked eye" default)
  and the bigger `star-catalog-deep.json` (mag ≤ 7), fetched **only** when the
  viewer cycles the `#sky-mag-btn` to "binoculars", so default users never
  download it. The app works **without** either: index.html
  embeds a seed of the marquee southern figures (`STAR_FIGURES`/`STAR_LOOSE`), and
  constellation **lines are always curated in `STAR_FIGURES`** (never baked), so the
  catalogs only enrich the background field. Every star is positioned at runtime by
  `altAz()` from the viewer's real GPS (region picker can override), so the same
  list is correct for any region/date — `buildStarField()` draws it all onto one
  `#sky-canvas` behind the labelled objects.
- **Night-card system** — the night list (`astroCards`) emits one `.acard` per
  sky object/event through a single `buildCard()` template. Each card has a
  **loot-grade rarity** (common→blue, rare→green, epic→purple, legendary→orange;
  `RARITY_C`/`rarCol`) that colours its accent, the modal crest and the sky-map
  marker, and a **visibility** state (`now`/`soon`/`later`) that drives the default
  **Visible now** filter and the *upcoming* pill (dated events ≤2 weeks out). Every
  card shows a single static **Astral Heroic** SVG graphic (`cardArt`); the
  **Star Outline ↔ Astral Heroic morph loops** (chart→hero→chart, a slow `infinite
  alternate` ping-pong via the `morphChart`/`morphHero` keyframes) the whole time the
  story modal is open. For **constellations** the modal uses a full-width **hero stage**
  (`.sky-hero-stage`) that **layers three things in one 3:2 box** instead of crossfading:
  the illustrated **Flux painting** (`HERO_ART[slug]` → `night-heroes/<slug>.jpg`) is
  demoted to a **dim background AURA** (`.sky-hero-aura`, brightness ~0.7 / opacity ~0.62)
  under a vignette veil, and the **registered star-FIGURE** (`figureSVG(slug,ac)`) sits on
  top. That figure draws the constellation's **full real-star list** as two pixel-aligned
  layers — `.fig-chart` (faint astral chart) crossfading into `.fig-hero` (the same stars
  lit into a glowing rarity figure) — **both from one `projFigure` projection, so the stars
  never move between phases**. That shared, locked skeleton is the whole point: the same
  star-points ride on top of the painting (the "exact match" — see why the Teapot *is* the
  archer). The painting's own painted anatomy only roughly aligns (it's fixed raster — can't
  register pixel-exact), which is why it's the aura and the crisp figure carries the meaning;
  Orion happens to line up beautifully, Sagittarius is looser. If the `<img>` 404s, `.has-hero`
  drops and the figure shows on the dark bg. See `night-heroes/HERO-ART-SPEC.md`. The whole
  visual style — and how to add a new card so it matches — is documented in the
  **`astral-heroic-card-art` skill** (`.claude/skills/`). Keep new figures' star coords
  real (J2000): wrong coords draw the wrong outline. **The astral chart shows the FULL
  figure, not a bright sub-asterism** — e.g. Sagittarius is the whole archer (bow + arrow +
  body + legs), not just the Teapot. Verify every added star's coords against
  `star-catalog-deep.json` (nearest-neighbour ≤0.05° + matching mag) before committing — a
  PowerShell pass over the catalog catches the fainter Bayer stars you'll get wrong from
  memory. Figures that are already their complete standard figure (Crux, Corvus, Triangulum
  Australe, Lyra, the Vela pentagon, Leo, Gemini, Scorpius…) are left unpadded. **Visible now**
  also respects the naked-eye/binoculars depth button — `eye:'binoc'` cards only
  count as visible-now at binocular depth. Tapping the **compass** (🧭) opens an
  immersive full-viewport landscape sky (`enterSkyFullscreen`; best-effort
  Fullscreen API + `screen.orientation.lock('landscape')`, with a CSS `.sky-full`
  overlay that works everywhere else). The compass button is also the **exit** (no
  separate exit button). In that immersive view: depth/filter/weather controls sit in
  a compact **top-right stack** under the compass (centre stays clear); the sky map
  draws a **distinct SVG glyph per category** (`skyMark()` — sparkle star, orb planet,
  spiral galaxy, cloud nebula, ringed globular, dashed open cluster, void dark nebula;
  + a real phase `moonMark()`), still tinted by rarity (`--mk`); and the detail-view
  projection is **conformal** (`skyAltFrac` — equal deg/px both axes, so constellations
  keep their true shape instead of squishing) showing a true-scale altitude band. The
  view aims with the **back camera**, not the phone's top edge: `_camOrientation` builds
  the device-orientation matrix and takes the **−Z (out-the-back) vector** to get BOTH the
  azimuth (`atan2(E,N)`) and altitude (`asin(Up)` = `asin(−cosβ·cosγ)`) it points at — so
  it's correct in landscape (the old top-edge heading read ~90° off there). North ref:
  Android/absolute `alpha` is already true; iOS `alpha` is relative, so it's calibrated
  with `webkitCompassHeading` (offset refreshed only while the phone is level enough,
  `|cosβ|>0.25`, and held as you tilt up). `window._camAz=false` falls back to the old
  top-edge heading. **Tilt-to-pan:** `buildStarField` centres the band on that altitude
  **1:1** (`_skyAltC=clamp(pitch,−span·0.4,90−span·0.35)`) — the floor sits just BELOW the
  horizon so pointing at/just-below it and tilting up responds immediately (a floor of 0,
  or the older `span/2`, left a dead zone there), and only the TOP is clamped so pointing
  near the zenith holds steady instead of lurching; no signal → mid-sky default (alt 48°),
  `window._tiltPan=false` pins it.
  Heading + pitch are smoothed by a **time-based** low-pass (`_easeAngle`,
  tau in seconds, so the feel is rate-independent — the cure for jumpy tilt) with a
  **zenith hold** (heading's pull fades to 0 by ~80° altitude and its slew cap drops
  *quadratically*, so the jittery 70–80° approach can't snap and pointing overhead / a
  fast 360 near the top doesn't spin the view) and a per-second **slew cap** (a momentary
  sensor flip eases instead of snapping); `_maybePaintSky` repaints at ~18fps with a deadband. The
  overview (compass off) keeps the squished 360° strip. Constellation names are pinned **below** each figure (not on the anchor) so
  they don't overlay the lines; `declutterSkyLabels` names **every** up-figure that
  fits (collision-decluttered, reads then writes in separate batches to avoid layout
  thrash) — the live focus band only adds *emphasis* (brighter label + revealed anchor
  star), it no longer gates which names show. The **"Visible now"** lens is in the
  fullscreen filter too (default on = curated viewing altitudes; off shows everything
  just above the horizon). **Perf:** `altAz()` depends only on time+location, so the
  star field / seed lines / figure footprints are projected **once per ~15s** into
  `fieldBase`/`seedBase`/`figMeta` caches and only re-mapped to x/y each repaint — do
  **not** reintroduce per-paint `altAz` over the catalog (that was the pan "chug"). The
  constellation lines are drawn as a soft glow (wide halo + faint thread), not a hard
  line, to blend into the field. Because the band can dip below altitude 0, `paintSky`
  draws a **dotted horizon line** at alt 0 with a **dimmed ground** gradient beneath it
  (no faux stars — there are none below the horizon), and the field/seed culls (`alt<0`)
  keep stars + figure lines above it.
- Icons / screenshots / `README.md` / `INSTALL.md` are static assets.

## Change & versioning flow
- `main` is **branch-protected** — never commit to it directly. Each change:
  `git checkout -b <topic>` → edit → commit → push → `gh pr create` →
  `gh pr merge <branch> --merge --delete-branch` → `git checkout main && git pull`.
- The app has **no version number**; git history + merged PRs are the record.
  Commit messages should explain the *why*. End commits with the
  `Co-Authored-By: Claude` trailer.
- **`gh` is not on PATH** in this PowerShell. Call it by full path:
  `& "C:\Program Files\GitHub CLI\gh.exe" pr create …`.
- **Don't pipe the commit message / PR body to `git commit -F -`** — PowerShell
  prepends a UTF-8 BOM that shows up as a stray `﻿` at the start of the subject.
  Write the text to a UTF-8-no-BOM file
  (`[IO.File]::WriteAllText($f,$msg,[Text.UTF8Encoding]::new($false))`) and use
  `git commit -F $f` / `gh pr create --body-file $f`.
- git writes progress to **stderr**, so `git push … 2>&1 | Out-String` surfaces a
  `NativeCommandError` wrapper even on success — read the body, not the wrapper.
- **Service worker / caching is the one real "versioning" gotcha.** `sw.js` is
  **network-first** for the app shell (currently `CACHE = 'golf-finder-v25'`), so
  a fresh deploy lands automatically for online users — you do **not** need to
  bump `CACHE` for ordinary `index.html` edits. Bump `CACHE` only when the
  precache `SHELL` list changes, or to force-evict old caches. (History: it used
  to be cache-first and returning users got stale builds until a manual bump —
  see the `sw-cache-deploy` memory.) A page auto-reloads once when a new SW takes
  control; a user stuck on a pre-network-first SW needs one hard refresh
  (Ctrl+Shift+R) to escape it.

## Editing on Windows / PowerShell (important)
git's autocrlf converts LF→CRLF, which breaks naive multi-line matching. The
reliable pattern for non-trivial edits:
1. Read file as UTF-8, normalise: `$raw = $raw -replace "\`r\`n","\`n"`.
2. Do `.Replace(old,new)` (or the Edit tool on freshly-read text).
3. Write back as **UTF-8 no BOM**: `[System.IO.File]::WriteAllText(path,$raw,
   [System.Text.UTF8Encoding]::new($false))`.
- JS template literals (`${...}`, backticks) inside PowerShell strings must use
  **single-quoted here-strings** `@'...'@` or PowerShell will eat them.
- After a batch, sanity-check brace/paren balance, e.g.
  `awk '{...count {} ()...}' index.html` (a small constant `(` imbalance from a
  regex/string literal in the file is normal — watch for *changes*, not zero).

## Verifying visuals (loader, day/night scenes, weather)
**The repo is `C:\golf-finder`** (lowercase, hyphen) and the preview tool reads
`launch.json` from the repo's **own** `.claude/` —
`C:\golf-finder\.claude\launch.json`. If it's missing, `preview_start` prints the
exact path it expects, so trust that over guessing. (A near-empty `C:\Golf Finder`
— capitalised, with a space — used to sit alongside the repo and wasted endless
time; it has been deleted. If it ever reappears it is *not* the repo, and neither
is a sibling like `C:\Users\…\Downloads\brisbane-golf-finder.html`, an old export.)

There's no dev server in the repo, so spin up a throwaway static server and drive
it with the preview tool:
- **Don't ship a `serve.ps1`.** This machine's PowerShell execution policy is
  **Restricted**, so `powershell -File serve.ps1` fails ("running scripts is
  disabled"), and `-ExecutionPolicy Bypass` is rejected by the permission
  classifier. Instead inline the whole `HttpListener` server as one
  `powershell -NoProfile -Command "…"` string in `launch.json`'s `runtimeArgs`
  (`-Command` is *not* subject to the script-file policy). Serve `$root =
  C:\golf-finder` on port 8099, and build the JSON with `ConvertTo-Json` so the
  command string is escaped correctly.
- **Four foot-guns make the inline server die right after `preview_start` reports
  success** (symptom: `preview_eval` then says *"No running servers for this
  workspace"*, and port 8099 isn't listening):
  1. The command must be **one physical line** (statements joined with `;`). A
     multi-line `-Command` argument gets mangled and the process exits before it
     ever listens.
  2. Set `$ctx.Response.ContentLength64 = $bytes.Length` **before** writing the
     body, or the first write throws `ProtocolViolationException`.
  3. `preview_start` health-checks with a **HEAD** request — don't write a body
     for HEAD (`if($ctx.Request.HttpMethod -ne 'HEAD'){ …Write… }`) or it throws.
  4. Wrap each request in `try{…}catch{}` (and `try{$ctx.Response.Close()}catch{}`)
     so a single bad request can't kill the accept loop.
- **The loader auto-hides almost instantly and you can't watch it live.** The
  network is sandboxed in preview, so the month-based SEQ fallback renders on the
  first tick and `tryHideLoader` removes `#loader` before any keep-alive guard can
  win the race. The **service worker can also serve a stale cached `index.html`**
  to the page. So to verify the loader, *don't* fight the hide — rebuild it:
  `fetch('/?_='+Date.now())` the fresh HTML, pull out `.ld-day-scene` /
  `.ld-night-scene` with `DOMParser`, drop the node into a fixed full-screen
  overlay, and drive a copy of the controller from `preview_eval` (you can expose
  hooks like a `window.__forceHole` flag to hit specific states deterministically).
  After editing, reload with a cache-busting query (`?fresh=…`) so the page's
  `<style>` is the version you just wrote, then re-inject.
- `preview_start` → `preview_eval` (inject/measure DOM, `location.href=…?time=&wx=`
  to set scene) → `preview_screenshot` to eyeball.
- **The compass/widgets are tiny.** To inspect detail, temporarily blow one up via
  `preview_eval`: set `el.style.transform='scale(5)'` + `transformOrigin`, then
  screenshot.
- **Don't pause + seek WAAPI animations at all** (not even a couple — the
  `getAnimations()`-wholesale warning is too narrow). Calling `.pause()` then
  setting `.currentTime` on *any* compositor animation to capture a frame **wedges
  the `preview_screenshot` renderer**: every subsequent screenshot times out, and
  in practice `preview_stop`/`preview_start`, a full page reload, and
  `preview_resize` all **failed to recover it** in the same session (the wedge
  lives in the shared browser process). `preview_eval` keeps working, so you don't
  lose measurement — but you lose the ability to show pictures. To freeze a frame,
  set inline `animation:'none'` + `transform`/`opacity` on *just the target
  elements* (this reflects in layout *and* screenshots); never seek the WAAPI clock.
- **`getBoundingClientRect` does NOT reflect a running WAAPI transform** (it reads
  the main-thread base style, e.g. the CSS-default `transform`), so it silently
  mis-measures a compositor-animated element. Measure animated geometry by freezing
  with inline styles (above) and reading the rect, or by `getComputedStyle().transform`
  — not by rect-reading a live animation.
- Measuring beats eyeballing for geometry: read computed transforms / element
  rects via `preview_eval` (e.g. confirming the club head meets the ball).
- **Verifying the immersive night star map** (the conformal tilt-to-pan compass view):
  1. **Resize the viewport to LANDSCAPE first** (e.g. 844×390). A square/portrait
     viewport degenerates the conformal band — `_skyVSpan` clamps to 90 and it fills
     0–90, so tilt / horizon / zenith behaviour won't match a real phone (realistic
     landscape span ≈ 50). This is easy to miss and silently misleads.
  2. **Force the detail view from `preview_eval`:** `if(!_compassOn) toggleCompass();
     buildSkyObjects(window._gpsLat, window._gpsLng);` — `toggleCompass`'s repaint is
     rAF-deferred, so call `buildSkyObjects` directly to read state synchronously
     (page must be in night mode first via `?time=21:00`).
  3. **No real sensors in preview.** Either set `_headingSm`/`_pitchSm` (or
     `skyHeading`/`_skyPitch`) directly then `_maybePaintSky()`, **or** dispatch
     `new DeviceOrientationEvent('deviceorientationabsolute',{alpha,beta,gamma,
     absolute:true})` through the live `_onOrient` to exercise the camera matrix.
     Pose→(α,β,γ): (0,135,0)=camera North +45°, (270,135,0)=East +45°, (0,90,0)=North
     at the horizon. The *feel* (smoothing / zenith hold / overhead flip) can only be
     judged on a real phone — verify the math here, ship behind a `window._*`
     escape-hatch (`window._tiltPan`, `window._camAz`), and have me test on-device.
  4. **The baked catalogs DO load in preview** (`star-catalog*.json` are same-origin
     files the inline server serves), so star density / depth tiers are testable
     locally — the "network is sandboxed" caveat is only about external APIs.
  5. SVG `el.className` is an `SVGAnimatedString` — use `el.getAttribute('class')`
     when checking marker classes in `preview_eval`.
- **Delete `C:\golf-finder\.claude\launch.json` (and any `serve.ps1`) when done.**
  `preview_start` reuses a stale one, so remove it to keep the next session clean.
  Note `.claude/launch.json` is **not** git-ignored (only `settings.local.json`
  is), so delete it *before* committing and always stage `index.html` explicitly —
  never `git add .`.

## Time-travel / test hooks (already in the app)
- `?time=HH:MM` — override "now" (e.g. `?time=21:00` for night mode).
- `?wx=storm|rain|shower|drizzle|snow|hail|overcast|partly|clear|fog` — force the
  hero scene's weather. Console: `setWx('storm')` does the same with no reload;
  `setWx()` restores live weather.
- Weather/sun data come from open-meteo + sunrisesunset.io with month-based SEQ
  fallbacks (QLD has no DST) when the APIs fail.

## Gotchas learned the hard way
- Condition checks are **case-sensitive**: the label is `'Thunderstorm'`
  (lowercase "storm"), so storm/clear checks use `/storm/i`, `/clear/i`.
- `window._testTime` (set via eval) is **not** the module-local `_testTime`; use
  `?time=` to actually move the clock.
- **Don't sync a compositor animation to a `setTimeout`.** WAAPI transform/opacity
  animations play on the compositor and keep running through main-thread jank; a
  `setTimeout` does **not** — it fires late when the main thread is busy. The day
  loader's golf ball used to launch via `setTimeout(shot, SWING*IMPACT)` while the
  club swung as a WAAPI animation, so during page load (exactly when the loader is
  up and the thread is busy) the timer fired ~400ms late and the ball left the tee
  *after* the club had swept past — a visible whiff, even though the impact-frame
  geometry was perfect. Fix (PR #131): put the ball on the **same WAAPI timeline**
  as the swing (one clock, both composited) — it holds at the tee until the `IMPACT`
  offset, then arcs, so contact is frame-exact under any jank. General rule: if a
  DOM event must land on a specific animation frame, drive it from the animation's
  own clock (shared timeline / `.finished` of a same-duration anim), not wall-clock.
- **A WAAPI keyframe list whose last offset is < 1 reverts to the underlying value.**
  If you want an animation to *hold* its final pose for the rest of a longer timeline,
  you must add an **explicit keyframe at `offset:1`** with that pose. The spec
  synthesizes a final keyframe at offset 1 using the element's underlying value
  (for `transform`, `none`), so the property interpolates *back to base* over the
  tail of the timeline — and `commitStyles()` then bakes the base value, not the
  pose. This caused PR #133: the loader ball arced out, landed at offset ~0.74, then
  rubber-banded straight back to the tee over the remaining timeline. Fix: append
  `{offset:1, transform:'<landing>'}` so it holds. (The old short-duration arc
  didn't hit this because its keyframes already spanned offset 0→1.)
