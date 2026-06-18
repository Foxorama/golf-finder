---
name: astral-heroic-card-art
description: The house style for golf-finder's night-sky cards — loot-grade rarity colours plus the two-phase "Star Outline → Astral Heroic" phasing emblem. Use this whenever you add or restyle a night card (constellation, planet, deep-sky object or event) in index.html so every card past and future looks consistent.
---

# Astral Heroic card art

The night list in `index.html` shows one tappable `.acard` per sky object/event.
Each card carries a **loot-grade rarity** (a colour) and a **phasing emblem** that
crossfades forever between a faint **Star Outline** sketch and a glowing **Astral
Heroic** crest. This skill is the single source of truth for that look — follow it
so a card added next year matches the ones added today.

All art is **pure inline SVG** built at runtime. No image assets, no network — it
must render offline (the app is an offline-capable PWA).

## 1. Rarity (the loot scale)

Colours live in `:root` as CSS vars and are mirrored in JS:

| Grade       | Colour       | `--rar-*`          | `RARITY_C`   | Meaning (how special to catch it) |
|-------------|--------------|--------------------|--------------|-----------------------------------|
| `common`    | teal-green   | `--rar-common`     | `#66ccad`    | up most clear nights — Moon, marquee constellations, bright planets |
| `rare`      | blue         | `--rar-rare`       | `#5aa9f0`    | needs dark skies / a season — Magellanic Clouds, clusters, fainter figures |
| `epic`      | violet       | `--rar-epic`       | `#865aed`    | time-limited or showpiece — meteor showers, ISS, big nebulae, conjunctions |
| `legendary` | warm amber   | `--rar-legendary`  | `#ebaf47`    | once-in-a-while — aurora alert, eclipses, great comets |

The four are a **tonal band anchored on the rare blue glow** (`#5aa9f0`): common
is that blue tinted green, epic tinted purple, legendary a softened warm gold
(orange is blue's complement, so it can't be pulled into the band — it's muted to
glow, not shout). Saturations sit below the blue so it stays the anchor and the
band meshes when cards sit side-by-side.

`rarCol(rarity)` → hex. The card's left accent, rarity pill, art aura and the
sky-map marker all read from this one value (`--ac` on the card). **Never hand-pick
a card colour** — pick a rarity and let the colour follow.

## 2. The two phases

Both phases are 64×64 SVG with class `ca-layer` + (`ca-outline` | `ca-heroic`).
**On the list cards only the heroic phase shows — one static "highlighted" graphic
per card** (`.acard-art .ca-outline{display:none}`); the perpetual crossfade is gone.
The Star-Outline ↔ Astral-Heroic *morph* now lives in the **story modal**, where it
plays **once on open** (`@keyframes crestOutline`/`crestHeroic`) and holds on the
heroic frame — "see why it's named that". Reduced-motion users skip the morph and see
the heroic frame.

- **Star Outline (phase A)** — the faint "chart". For a constellation it is the
  figure's *real* projected stars (dots) + lines in dim blue. For everything else
  it is a dotted "outline" ring around a grayscaled glyph (or a dashed disc, +ring
  for Saturn, for planets). This is the literal star-lines / asteroid-outline the
  card "starts" as.
- **Astral Heroic (phase B)** — the same silhouette *lit up*: a rarity-coloured
  radial **aura**, glowing **sinew** (thick luminous lines), bright white **orbs**
  at the stars, a few rarity **sparks**, and a translucent mythic **emblem** (the
  object's emoji) behind it. For planets it becomes a shaded glowing orb; for deep
  sky / events, a vivid glowing glyph ringed in the rarity colour. It is a stylised
  *crest*, not a literal photo — invent the heroic form, do not trace a reference.

**In the modal the heroic frame depends on the object type:**
- **Constellations** get a prominent full-width **hero stage** (`.sky-hero-stage`, 3:2)
  that **layers** rather than swaps: the **`HERO_ART`** illustration (`night-heroes/<slug>.jpg`)
  is a **dim background aura** (`.sky-hero-aura`) under a vignette, and the registered
  star-figure (`figureSVG(slug,ac)`) sits **on top**. That figure renders the constellation's
  **full real-star list** as two pixel-aligned layers — `.fig-chart` (faint chart) ↔ `.fig-hero`
  (the same stars lit into a glowing rarity figure) — from **one `projFigure` projection, so the
  stars never move between phases**. `.fig-hero` is drawn as a **luminous astral *form*** —
  volumetric glowing limbs (a stack of blurred rarity strokes) + bright starlight core + radiant
  star-orbs — so the figure ON the real stars carries the match. **ALL 18 constellations now use
  the registered-hero pipeline (`REG_HERO`):** a creature-shaped skeleton built from the real
  stars is fed to Flux (which DOES register when given a creature, not bare dots), and the
  resulting spectral painting (a luminous cyan-white creature + Milky-Way/horizon) shows at
  **full strength** (`.reg`, `heroAuraFull`) with `.fig-hero` empty — the real stars (white
  4-point sparkles) overlay on top via the matched **`REG_SKEL_PAD` (35.156)** inset.
  **Exception:** `centaurus`, `sagittarius` and `carina` were later rebuilt to accurate
  standard star charts and have **no `HERO_ART` entry** — they render the clean static chart
  (`.sky-hero-stage.chart-only .fig-chart` holds the lines) while their astral form is
  sourced separately; re-add the slug to `HERO_ART` to overlay art. The dim-aura
  + enriched-`.fig-hero` + **`HERO_AURA_ADJ`** path is the now-unused legacy fallback. Full
  pipeline + verify recipe (incl. the registration-varies caveat) in
  `CLAUDE.md`; missing/404 art drops `.has-hero` and the figure shows on the dark bg.
  **The 10 newer southern/zodiac figures (Musca, Lupus, Ara, Tucana, Phoenix, Puppis, Columba,
  Pegasus, Canis Minor, Capricornus) are NOT in `REG_HERO`/`HERO_ART`** — they render the
  original **chart↔luminous-figure crossfade** (no painting); the `chart-only` class is reserved
  for the retired reg-without-art trio.
  The astral chart must draw the **whole figure, not a bright sub-asterism** (Sagittarius = the full archer,
  not just the Teapot); verify any new star's J2000 coords against `star-catalog-deep.json`. See
  `night-heroes/HERO-ART-SPEC.md` for the figure art spec/prompt.
- **Planets / deep sky / events** use a procedural **locator star-map** as their "regular"
  image (the non-constellation analogue of the constellation chart) — *where the object sits*,
  unique per card. `skyLocus(slug)` picks a category, `_locInner` composes the SVG, and
  `locatorHeroicSVG` (lit 64-px card thumbnail) / `locatorStageSVG` (300×200 modal map) wrap it.
  Deep-sky maps plot the real J2000 coords against the embedded `SKY_SEED` field (+ naked-eye
  `STAR_CATALOG` when loaded), auto-draw any seed constellation lines in frame, and add a
  per-type highlight (`_locMarker`): galaxy = tilted spiral, globular = fuzzy ball, open =
  brighter scattered stars, nebula = soft cloud, dark = void; `band`/`clouds` = Milky-Way swath /
  Magellanic blobs; planets+Moon = a **Solar-System schematic** (`_locSolar` — six orbits, the
  body at its real heliocentric angle); meteors = radiant streaks, ISS = horizon arc, conjunction
  = pair on the ecliptic, aurora = curtains, full/new moon = phase disc. Every highlight wears a
  dashed **reticle** "you-are-here" ring. These maps are deliberately **looser** than the
  registered figures — they locate, not pixel-register. In the modal the full-width 3:2
  **`.sky-photo-stage`** layers the `.sky-loc` map under the Flux photo; once the photo loads
  (`.photo-in`) it **cross-fades map ↔ photo on one 4.4 s clock** (`morphChart`/`locPhoto`,
  `infinite alternate`) — the same phasing as constellation cards. No `CARD_PHOTO` → `.loc-only`,
  the map just holds. A slug `skyLocus` doesn't know falls back to the old emblem crest
  (`.sky-modal-crest`, the 64×64 `cardArt` pair scaled up), so nothing regresses. (The Flux
  photos are pure text-to-image — no skeleton/registration; a nebula photo just has to look like
  that nebula. Pipeline + foot-guns in `CLAUDE.md`.)

## 3. The generators (don't fork them)

In `index.html`, in dependency order:

- `rarCol(r)`, `RARITY_C`, `RARITY_LBL`, `RARITY_RANK` — rarity → colour/label/sort.
- `projFigure(f,W,H,pad)` — project a `STAR_FIGURES` figure into a box.
- `figOutlineSVG` / `figHeroicSVG` — constellation phases.
- `glyphOutlineSVG` / `glyphHeroicSVG` — emoji-glyph phases (deep sky, events, moon).
- `planetOutlineSVG` / `planetHeroicSVG` — disc (+Saturn ring) phases.
- `_heroicSparks(sz,ac,seed)` — the shared rarity sparks.
- `skyLocus(slug)` / `_locInner` / `_locMarker` / `_locSolar` / `locatorOutlineSVG` /
  `locatorHeroicSVG` / `locatorStageSVG` — the locator star-map family (non-constellation
  cards). `_locPatch` projects a sky patch from `SKY_SEED` (+`STAR_CATALOG`); `_locBackdrop`
  lays a faint deep-space starfield behind **every** map (so even sparse/non-patch ones read
  as space). Aurora is drawn as draped rays in **australis** colours (crimson crown → green
  base — what we see from our low southern magnetic latitude), not the green walls of the north.
- **`cardArt(o)`** — the dispatcher. Returns both `<svg>` layers. Picks the figure
  path if `FIG_BY_SLUG[o.fig||o.slug]` exists; else a **locator map** if `skyLocus(o.slug)`
  is non-null (planets, deep sky, most events); else the planet disc / glyph emblem.
- **`buildCard(o)`** — the one card template (art + head + rarity pill + optional
  upcoming pill + note). **Every card goes through this** — never emit `.acard`
  HTML by hand.

## 4. Adding a new card

1. Add its data + lore. Constellation → `STAR_FIGURES` (real J2000 `[name,ra,dec,mag]`
   stars + line index pairs) and a `CONST_INFO` entry with a `rar`. Deep sky → a
   `DEEPSKY` entry (`{slug,n,icon,ra,dec,vis,rar,blurb,rows}`); lore is auto-built.
   Dated event → `SKY_EVENTS` (or a computed helper) with a `rar`.
2. In `astroCards()`, push a descriptor: `{slug,cat,rar,vis,eye?,name,icon|dot,glyph,
   fig?,art?,ring?,pos,note,soonTxt?,sortAlt}`.
   - `cat` ∈ `stars | planets | deep | events` (drives the filter chips).
   - `vis` ∈ `now` (up / happening) | `soon` (a dated event within 14 days) |
     `later` (real but below the horizon now). The default **Visible now** filter
     keeps only `now`; `soon` cards get the upcoming pill via `soonTxt`.
   - `eye` ∈ `naked` (default) | `binoc`. A `binoc` card only counts as Visible
     now when the depth button is set to 🔭 binoculars (`applySkyFilter` gates it
     on `_starMagIdx`), and it shows a 🔭 tag. Use it for telescopic/binocular
     targets (faint galaxies, small clusters) so switching depth "unlocks" them.
3. Give it a rarity from §1 and add the slug to `skyRarity()`'s map if it is not a
   figure / DEEPSKY / SKY_EVENTS entry, so the modal crest is tinted correctly.
4. That's it — `buildCard`/`cardArt` dress it automatically. A new DEEPSKY entry gets a
   locator map for free from its `type` + `ra`/`dec`; a new planet/Moon is already covered.
   A **new *event* kind** with no fixed sky position needs a `skyLocus(slug)` branch returning a
   `kind` plus a small `_loc*` renderer (follow `_locArc`/`_locPair`), or it just falls back to
   the emblem crest. Optionally add a `CARD_PHOTO[slug]` Flux photo so the map cross-fades to it.
   Verify with the preview tool (see CLAUDE.md): the loot colour, the locator map / map↔photo
   phasing, and the right visible-now / upcoming behaviour.

## Checklist

- [ ] Real coordinates for any new figure (wrong coords = wrong outline — the whole
      reason Centaurus was once just two stars).
- [ ] A rarity, never a bespoke hex.
- [ ] Goes through `buildCard` / `cardArt`.
- [ ] `vis` set correctly; `soon` only for genuinely-upcoming dated events (≤14 days).
- [ ] Renders offline (inline SVG only) and survives a reduced-motion preference.
