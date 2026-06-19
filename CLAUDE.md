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
  never move between phases**. `.fig-hero` is drawn as a **luminous astral *form*** — the
  limbs given volume by a stack of blurred rarity-coloured strokes (outer aura → volume →
  body) under a bright starlight core, with radiant orbs at each star — so the thing sitting
  exactly on the real stars reads as the figure itself, and it (not the painting) carries the
  match. **THE registered-hero pipeline — ALL 18 constellations now use it (`REG_HERO`):** the
  breakthrough is that **Flux *can* pose a painting onto the exact stars if you feed it a
  CREATURE-shaped skeleton, not bare dots.** (Bare dots/lines → it paints a generic, often
  mirrored figure — that earlier failure is real, see PR #138; the fix is a recognizable
  skeleton.) Recipe per figure: (1) render a **creature-skeleton** from its real projected
  stars via GDI+ at **1536×1024, pad 180** — the generalised renderer draws the constellation
  `l` lines as thick glowing limbs + prominent bright stars (enough armature for Flux); a few
  figures (Scorpius) get bespoke appendages (claws/curled tail) for clarity. Pull the projected
  coords straight from `projFigure(f,1536,1024,180)` via `preview_eval` so they match the app
  exactly. (2) `request_upload_url` → PUT (works on `app.bfl.ai`, force TLS1.2 in PS5.1) →
  `generate_image(flux2_max)` with a per-figure prompt naming the creature + *enhance this exact
  skeleton, keep the shape and star positions*. **Batch it:** call `request_upload_url` ×N in
  parallel, one PS PUT loop, then `generate_image` with up to 8 `requests`. (Watch out: some of
  an 8-batch can silently never reach `ready` — re-upload + re-gen those.) (3) `get_history` →
  download `image_url` to `night-heroes/<slug>.jpg`. (4) the slug goes in `REG_HERO`; every
  skeleton uses pad 180 so the single constant **`REG_SKEL_PAD = 35.156`** (= 180 ÷ 5.12) is the
  in-app overlay inset for all of them. `REG_HERO` figures show the Flux creature at **full
  strength** (`.reg` class, `heroAuraFull` blooms to ~0.96, no `HERO_AURA_ADJ`) with `.fig-hero`
  empty (the creature IS the hero); the real stars (white 4-point sparkles) + lines overlay on
  top. Verify registration without a screenshot: GDI+-composite red rings at the
  `projFigure(f,1536,1024,180)` star positions over the downloaded jpg — they must sit on the
  painted stars. **Registration varies:** clean single-body figures (Scorpius, Leo, Orion) hold
  the stars exactly; complex multi-limb ones (Centaurus, Taurus) get compacted by Flux so a few
  extremity stars (horn-tips, hooves) drift off the painted body — the app overlay still draws
  them at their TRUE positions, so re-roll a tighter skeleton if a specific figure bothers you.
  **(Legacy fallback, now unused by any figure)** the dim aura + enriched `.fig-hero` luminous
  form + **`HERO_AURA_ADJ[slug]`** (a per-figure `scaleX(-1)`/`scale`/`translate` to orient the old
  painting roughly behind the figure — Orion & Leo line up well, Sagittarius needed a flip).
  If the `<img>` 404s, `.has-hero` drops and the figure shows on the dark bg.
  **Exceptions (PR after #141): `centaurus`, `sagittarius` and `carina` have NO `HERO_ART`
  entry on purpose** — their star charts were rebuilt to the accurate standard figures
  (Centaurus per the user's Sky&Tel connection spec; Sagittarius the full labelled archer;
  Carina the real Diamond Cross β/θ/υ/ω, not p Car), so the old Flux creatures (which
  illustrated the *wrong* charts) are retired and these three render the **clean static star
  chart** (the `.sky-hero-stage:not(.has-hero) .fig-chart` rule holds the lines instead of
  morphing them away). The astral form for them is being sourced separately — re-add the slug
  to `HERO_ART` to overlay it. Every figure star is nearest-neighbour-checked against
  `star-catalog-deep.json` (≤0.01°). See
  `night-heroes/HERO-ART-SPEC.md`. **Non-constellation cards (deep sky, planets,
  phenomena) get their own Flux imagery via `CARD_PHOTO[slug]` → `night-photos/<slug>.jpg`.**
  **Their "regular" image is now a procedural *locator star-map* of WHERE the object sits**
  (the non-constellation analogue of the constellation chart): `skyLocus(slug)` dispatches a
  category, `_locInner()` composes the SVG, and `locatorHeroicSVG()` (the lit 64-px card
  thumbnail, drawn by `cardArt`) / `locatorStageSVG()` (the 300×200 modal map) wrap it. Each
  map is **unique to its card** — deep-sky maps plot the object's real J2000 coords against the
  embedded `SKY_SEED` field (+ the naked-eye `STAR_CATALOG` when loaded) and auto-draw any seed
  constellation lines that fall in frame, with a per-type highlight (`_locMarker`): galaxy =
  glowing tilted spiral, globular = dense fuzzy ball, open = brighter scattered stars, nebula =
  soft cloud, dark = void; `band`/`clouds` = Milky Way swath / Magellanic blobs; planets + Moon
  = a **Solar-System schematic** (`_locSolar`, six orbits, the body at its real current
  heliocentric angle, Earth+Moon for the Moon); meteors = radiant + diverging streaks, ISS =
  horizon arc, conjunction = pair on the ecliptic, aurora = southern curtains, full/new moon =
  phase disc; **solar flare = Sun with prominence loops (`_locFlare`), opposition =
  Sun–Earth–planet line (`_locOpposition`), supermoon = big disc + dashed average-size ring,
  comet = nucleus + swept tail + drift path (`_locComet`), asteroid = rock + motion trail past
  Earth's limb (`_locAsteroid`), lunar/solar eclipse = `_locEclipse('lunar'|'solar')` (coppery
  shadow on the Moon / corona-ringed black disc), solstice & equinox = `_locSeason` (the Sun's
  daily arc high in the southern summer, low in winter)**. Every highlight carries a dashed
  **reticle** "you-are-here" motif. The maps are
  *looser* than the registered figures (the user signed off on this) — they locate, they don't
  pixel-register. In the **modal** the full-width 3:2 **`.sky-photo-stage`** now layers a
  `.sky-loc` map under the photo and, once the photo loads (`.photo-in`), **cross-fades
  map ↔ photo on one 4.4 s clock** (`morphChart`/`locPhoto`, `infinite alternate`) — the same
  phasing as constellation cards. A card with no `CARD_PHOTO` gets `.loc-only` and just holds the
  map; a card `skyLocus` doesn't recognise falls back to the old emblem
  crest, so nothing regresses. The Flux photos themselves are pure text-to-image (no
  skeleton/registration — a nebula photo just has to look like that nebula), generated
  `flux2_max` 1536×1024 with prompts like
  *"Deep-space astrophotography of <object>: …, no text, no labels, no constellation lines"*; a
  missing/offline image adds `.no-photo` and removes itself, leaving the emblem. Lazy-fetched on
  open and SW-runtime-cached (same as `HERO_ART`; they're **not** in the precache `SHELL`, so no
  `CACHE` bump and default users don't download them). **Foot-gun:** an 8-image `generate_image`
  batch routinely leaves 2–4 stuck `pending` that never reach `ready` — re-submit just those as a
  fresh smaller batch; the originals don't complete. Download with `Invoke-WebRequest` forcing
  TLS1.2 (`app.bfl.ai`). The whole
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
  count as visible-now at binocular depth. **Story modal close model
  (`#sky-modal` / `renderStoryBody`):** the card is a fixed-size frame whose **body
  scrolls internally**, so the close **✕** (a card child, not a body child) stays
  pinned — a full-screen `100dvh` sheet on phones (so every card is the same size),
  a consistent `min(86vh,760px)` centred panel on desktop. It closes **only** via the
  ✕ or a touch gesture: **swipe down** (from the top of the scroll) or **swipe right**
  dismisses / goes back (`_skyTouchInit` — live drag feedback + snap-back below the
  ~90 px `TH`; tune `TH`/the 0.6/0.7 drag multipliers there). There is **no
  tap-outside and no Esc close** (Esc still closes the *play* panel). Swipe sits behind
  the `window._skySwipe` escape-hatch (default on; `=false` disables — a sibling of
  `window._tiltPan`/`window._camAz`), so its *feel* must be tested on a real phone.
  Card lore stays in labelled `rows`; an optional **`fun:`** field on `CONST_INFO`
  (or a `['Fun fact',…]` row on the deep-sky/planet data) adds a fact **only where it
  isn't already covered** by another row. Tapping the **compass** (🧭) opens an
  immersive full-viewport landscape sky (`enterSkyFullscreen`; best-effort
  Fullscreen API + `screen.orientation.lock('landscape')`, with a CSS `.sky-full`
  overlay that works everywhere else). The compass button is also the **exit** (no
  separate exit button). In that immersive view: depth/filter/weather controls sit in
  a compact **top-right stack** under the compass (centre stays clear); the sky map
  draws a **distinct SVG glyph per category** (`skyMark()` — sparkle star, orb planet,
  spiral galaxy, cloud nebula, ringed globular, dashed open cluster, void dark nebula;
  + a real phase `moonMark()`), still tinted by rarity (`--mk`); and the detail-view
  projection is a **dome**: `skyAltFrac` gives equal deg/px vertically (true-scale band) and
  `skyAzX`/`px` scale the azimuth offset by **`cos(alt)`** horizontally. The horizontal scaling
  is essential — a plain cylindrical az→x map stretches high-altitude sky by `1/cos(alt)` (≈5.8×
  at 80°, the "super-squished top" you'll see if you remove it), whereas `cos(alt)` keeps
  constellations their true shape all the way to the zenith (azimuths converge overhead as they
  really do). The horizon (alt 0) is unchanged, so the tuned low/level view is identical;
  `window._skyDome=false` restores the old cylindrical map. The compass strip (`renderCompassStrip`,
  a horizon heading reference) stays cylindrical (calls `skyAzX(az)` with no alt). Both the canvas
  field/lines (`px(az,alt)`) and the DOM markers (`pos`→`skyAzX(az,alt)`) use the same dome scale so
  they stay pixel-aligned. **Only objects whose anchor is inside the frame are drawn** (`inFrame` in
  `buildSkyObjects` — within the FOV horizontally AND the band vertically); without it, off-screen
  figures piled their nudged-in names on the screen edge and figures below the band orphaned their
  labels. The
  view aims with the **back camera**, not the phone's top edge: `_camOrientation` builds
  the device-orientation matrix and takes the **−Z (out-the-back) vector** to get BOTH the
  azimuth (`atan2(E,N)`) and altitude (`asin(Up)` = `asin(−cosβ·cosγ)`) it points at — so
  it's correct in landscape (the old top-edge heading read ~90° off there). North ref:
  Android/absolute `alpha` is already true; iOS `alpha` is relative, so it's calibrated
  with `webkitCompassHeading` (offset refreshed only while the phone is level enough,
  `|cosβ|>0.25`, and held as you tilt up). `window._camAz=false` falls back to the old
  top-edge heading. **Comfort-tilt-to-pan:** `buildStarField` no longer centres the band on
  the pointing altitude 1:1 (that was *realistic but unusable* — to frame high sky you had to
  crane the phone past a viewable angle, and at a natural eye-height hold the camera points
  slightly **below** the horizon, so you got mostly ground). Instead a **smooth saturating curve**
  pans the band, and crucially it saturates the band's **TOP EDGE toward the zenith** (`ceil`≈90°),
  not the centre toward a fixed value: `topAlt = ceil − (ceil−topLevel)·e^(−gain·pitch/(ceil−topLevel))`
  with `topLevel = lift + span/2`, then `centre = topAlt − span/2`
  (`TILT_GAIN`/`TILT_LIFT`/`TILT_CEIL`, defaults `2.3 / 21 / 90`). At level (pitch 0) centre =
  `lift` (sky filling the frame, horizon pushed down near the bottom compass strip — `lift` was
  raised from 12→21 on phone feedback to cut the below-horizon "ground" band by ~⅔); the **initial
  slope of the centre = `gain`** is the *tilt-friendliness* (a relaxed tilt lifts you into real sky
  — raise it to need even less tilt); and as you tilt overhead the **top edge eases up to `ceil`
  (an asymptote, never a hard clamp) and holds at the zenith**. **Two dead-spots were fixed this
  way:** (1) the *original* linear map hit a hard `90−span·0.35` ceiling clamp that froze the band
  over a wide range of high tilts (a "placeholder starfield" near the zenith). (2) Saturating the
  *centre* (toward a fixed 80°) instead pushed the band's top **past 90° into empty "above-the-
  zenith" sky** once you tilted up — the top of the screen went blank and the real high sky bunched
  /"squished" below it (the "map ends ~60°, top squished" report). Anchoring the **top** at the
  zenith removes the empty gap entirely while staying a soft asymptote (no frozen dead-spot): the
  highest sky you can see is the zenith at the top edge, and the view never scrolls past it. (Past
  ~vertical the device's own pitch genuinely tips back down the far side of the arc — inherent to
  the orientation sensor, not a clamp.) The curve is **symmetric about the horizon-hold (pitch 0)**:
  tilt UP and the top edge eases to the zenith; tilt DOWN and the **centre eases gently toward
  `floor` (`TILT_FLOOR`, default 16°, its downward asymptote)** rather than dropping 1:1 — because
  at a natural slightly-forward phone hold the camera sits a few ° *below* the horizon, and the
  amplified `gain` made even −4° drop to mostly blank ground; saturating downward keeps mostly SKY
  in frame (ground caps ~19% at the default). Both branches meet at pitch 0 with the same slope
  `gain` (no kink). No shape distortion (band stays conformal). No signal → mid-sky
  default (alt 48°), `window._tiltPan=false` pins it. **Tunable live on a phone** without a
  desktop console: `?tiltgain=`/`?tiltlift=`/`?tiltceil=`/`?tiltfloor=` URL params (`initTiltOverride`)
  or the `setTilt(gain,lift,ceil,floor)` console helper (`window._tiltGain`/`_tiltLift`/`_tiltCeil`/
  `_tiltFloor`) — so the user can A/B the feel on-device. The astral chart/feel can only be judged on a real phone.
  Heading + pitch are smoothed by a **time-based** low-pass (`_easeAngle`,
  tau in seconds, so the feel is rate-independent — the cure for jumpy tilt) with a
  **zenith hold** (heading's pull fades to 0 by ~80° altitude and its slew cap drops
  *quadratically*, so the jittery 70–80° approach can't snap and pointing overhead / a
  fast 360 near the top doesn't spin the view) and a per-second **slew cap** (a momentary
  sensor flip eases instead of snapping); `_maybePaintSky` repaints at ~18fps with a deadband. The
  overview (compass off) keeps the squished 360° strip. Each constellation name-tag is placed
  under the **horizontal centre of the figure's visible stars** (`figMeta.pts` projected per
  build — not the anchor, which can sit at one end and looked "off to the side"), just **below**
  the figure so it doesn't overlay the lines, but **flipped above** when below would cross the
  horizon line / fall off the bottom — so a name **never sits below the horizon** (was the
  Sagittarius-label-in-the-ground bug). `declutterSkyLabels` then names **every** up-figure that
  fits (collision-decluttered, reads then writes in separate batches to avoid layout
  thrash) — the live focus band only adds *emphasis* (brighter label + revealed anchor
  star), it no longer gates which names show. In dense regions (Crux/Carina/Centaurus) the
  declutter hides the lower-priority overlaps, so the survivors don't collide; if that hides too
  much, the levers are a narrower `_skyFov` (zoom in — but it also re-shapes the tilt/dome band)
  or label stacking, not a bigger canvas (perf isn't the constraint). The **"Visible now"** lens is in the
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
- **Night *events* — how they're picked up + how to add one.** `astroCards(lat,lng)` is the
  single producer of the night list; the **Events** category is everything it pushes with
  `cat:'events'`. Three sources feed it: **(1) live** — aurora (NOAA Kp), **solar flares**
  (NOAA GOES X-ray, `window._xray` via `fetchSpaceWx`; M/X-class only) and ISS; **(2) computed**
  — meteor showers (`SHOWERS`/`showerStatus`), full/new moon, **supermoon** (`moonDist` ≤ ~361 500 km
  at the next full moon), **planetary oppositions** (`planetOppositions` — Earth between Sun and an
  outer planet; ±~3-week window), conjunctions, solstices/equinoxes; **(3) curated dated lists** —
  comet apparitions (`COMETS`/`cometStatus`) and headline one-offs (`SKY_EVENTS`: eclipses + the
  Apophis flyby). Curated entries surface only inside their window (≤14 days out, or `start..end`
  for comets), so they don't clutter off-season. **Everything is real and Australia-visible** — the
  events deliberately use a southern-hemisphere / "from Australia" framing, *not* SEQ-specific. The
  default **Visible now** lens shows only `vis:'now'`, so most dated events sit under `vis:'soon'`
  (upcoming pill) and appear when you toggle the lens off — that behaviour is intentional/correct,
  the fix for "too few events" was **coverage**, not the filter. To **add an event type**: push a
  descriptor in `astroCards` (`{slug,cat:'events',rar,vis,name,icon,glyph,pos,soonTxt?,sortAlt,
  note,eye?}`), register `SKY_LORE[slug]` (blurb + rows) — or let the `SKY_EVENTS`/`COMETS` lore
  loops build it — add a `skyLocus(slug)` branch (+ a `_loc*` renderer) for its locator-map art,
  add the slug to `SKY_RARITY`/the curated arrays so `skyRarity()` resolves it, and optionally a
  `CARD_PHOTO[slug]` Flux photo (shared photos like `eclipse-lunar.jpg` are mapped via each event's
  `photo:` field). **Ordering gotcha:** the `SKY_LORE` builder IIFE reads `COMETS`, so `COMETS`
  **must be declared above that IIFE** (a later `const` trips the temporal-dead-zone and silently
  halts the whole script — symptom: no app globals, loader never hides).
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
- **Auditing star/deep-sky coordinate accuracy.** In `preview_eval` (night mode),
  fetch `star-catalog-deep.json` (15,598 HYG `[ra,dec,mag]` J2000 stars) and
  nearest-neighbour every `STAR_FIGURES` star, `STAR_LOOSE` star and `DEEPSKY`
  object against it (haversine; prefilter `|Δdec|<0.5`); flag distance >0.06° or
  |Δmag|>0.6. A deep-sky object sitting in *empty* sky (no catalog star brighter
  than ~6.5 within 0.6°) is the tell for a wrong position — that's how the Jewel
  Box RA error was caught (PR #154). Beware false flags from real doubles (μ Sco
  is μ¹ vs μ², Sabik is η Oph's two components vs the combined mag). Cards share
  the data (`projFigure`→`STAR_FIGURES`, `skyLocus`→`DEEPSKY_BY_SLUG`), so a bad
  datum is wrong in both — fix it once. For **events**, don't trust the existing
  copy: verify each eclipse's *type* (penumbral vs partial) and **Australian**
  visibility against an authoritative source (timeanddate/Wikipedia) via
  WebSearch — an eclipse with the Moon below the horizon across (eastern)
  Australia is not Australia-visible and should be cut, not just reworded.
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
