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
| `common`    | blue         | `--rar-common`     | `#5aa9f0`    | up most clear nights — Moon, marquee constellations, bright planets |
| `rare`      | green        | `--rar-rare`       | `#3fd07f`    | needs dark skies / a season — Magellanic Clouds, clusters, fainter figures |
| `epic`      | purple       | `--rar-epic`       | `#b07cff`    | time-limited or showpiece — meteor showers, ISS, big nebulae, conjunctions |
| `legendary` | orange       | `--rar-legendary`  | `#f5a623`    | once-in-a-while — aurora alert, eclipses, great comets |

`rarCol(rarity)` → hex. The card's left accent, rarity pill, art aura and the
sky-map marker all read from this one value (`--ac` on the card). **Never hand-pick
a card colour** — pick a rarity and let the colour follow.

## 2. The two phases

Both phases are 64×64 SVG with class `ca-layer` + (`ca-outline` | `ca-heroic`).
CSS (`@keyframes caOutline` / `caHeroic`) crossfades them on an 11s loop; each card
gets a staggered negative `--phase` delay so the list shimmers unevenly. Reduced-
motion users see the heroic phase, frozen.

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

Same crest is reused, scaled up, at the top of the story modal (`.sky-modal-crest`).

## 3. The generators (don't fork them)

In `index.html`, in dependency order:

- `rarCol(r)`, `RARITY_C`, `RARITY_LBL`, `RARITY_RANK` — rarity → colour/label/sort.
- `projFigure(f,W,H,pad)` — project a `STAR_FIGURES` figure into a box.
- `figOutlineSVG` / `figHeroicSVG` — constellation phases.
- `glyphOutlineSVG` / `glyphHeroicSVG` — emoji-glyph phases (deep sky, events, moon).
- `planetOutlineSVG` / `planetHeroicSVG` — disc (+Saturn ring) phases.
- `_heroicSparks(sz,ac,seed)` — the shared rarity sparks.
- **`cardArt(o)`** — the dispatcher. Returns both `<svg>` layers. Picks the figure
  path if `FIG_BY_SLUG[o.fig||o.slug]` exists, else the planet path if `o.art==='planet'`,
  else the glyph path.
- **`buildCard(o)`** — the one card template (art + head + rarity pill + optional
  upcoming pill + note). **Every card goes through this** — never emit `.acard`
  HTML by hand.

## 4. Adding a new card

1. Add its data + lore. Constellation → `STAR_FIGURES` (real J2000 `[name,ra,dec,mag]`
   stars + line index pairs) and a `CONST_INFO` entry with a `rar`. Deep sky → a
   `DEEPSKY` entry (`{slug,n,icon,ra,dec,vis,rar,blurb,rows}`); lore is auto-built.
   Dated event → `SKY_EVENTS` (or a computed helper) with a `rar`.
2. In `astroCards()`, push a descriptor: `{slug,cat,rar,vis,name,icon|dot,glyph,
   fig?,art?,ring?,pos,note,soonTxt?,sortAlt}`.
   - `cat` ∈ `stars | planets | deep | events` (drives the filter chips).
   - `vis` ∈ `now` (up / happening) | `soon` (a dated event within 14 days) |
     `later` (real but below the horizon now). The default **Visible now** filter
     keeps only `now`; `soon` cards get the upcoming pill via `soonTxt`.
3. Give it a rarity from §1 and add the slug to `skyRarity()`'s map if it is not a
   figure / DEEPSKY / SKY_EVENTS entry, so the modal crest is tinted correctly.
4. That's it — `buildCard`/`cardArt` dress it automatically. Verify with the preview
   tool (see CLAUDE.md): the loot colour, the phasing crest, and the right
   visible-now / upcoming behaviour.

## Checklist

- [ ] Real coordinates for any new figure (wrong coords = wrong outline — the whole
      reason Centaurus was once just two stars).
- [ ] A rarity, never a bespoke hex.
- [ ] Goes through `buildCard` / `cardArt`.
- [ ] `vis` set correctly; `soon` only for genuinely-upcoming dated events (≤14 days).
- [ ] Renders offline (inline SVG only) and survives a reduced-motion preference.
