# Night-card hero art — generation spec

These are the **illustrated "astral heroic" figures** that a constellation's star
chart morphs into when you open its card in night mode (e.g. the Centaurus chart →
the centaur Chiron). They are AI-generated, then dropped into this folder.

> **Status:** all 18 constellation heroes now exist (`<slug>.jpg`, 1536×1024),
> generated with the **Flux MCP** (`flux2_max`) from the template below and wired into
> `HERO_ART` in `index.html`. To re-roll one, regenerate with its prompt and overwrite
> the file. The prompts used live in the Flux generation history.

The art is *inspired by* a luminous-centaur reference but is **our own house style** —
do not trace or copy any existing image. Web sources are for **confirming the right
figure, pose and stars** for a constellation only, never for lifting artwork.

> Where it shows: the modal's full-width **hero stage** (`.sky-hero-stage`,
> 3:2 landscape). The illustration is **not** the focal layer any more — it blooms in as a
> **dim background aura** (`.sky-hero-aura`, brightness ~0.7 / opacity ~0.62) behind the
> app-drawn **registered star-figure**, which rides on top with the constellation's real
> star-points locked in place. So the art's job is mood/flesh behind the figure; the crisp
> star skeleton carries the "these stars *are* the figure" read. The closer your figure's
> own anatomy + painted stars sit to where the real stars actually project (centred, similar
> scale/orientation), the better it registers — Orion lines up almost perfectly. The list
> cards stay pure SVG — these images are **only** fetched when a card is opened (lazy +
> service-worker cached), so default users never download them.

---

## 1. Technical spec (every image)

| Field | Value |
|-------|-------|
| Aspect | **3:2 landscape** (matches the stage; anything else gets cropped by `object-fit:cover`) |
| Resolution | 1536 × 1024 px |
| Format | **JPG** (Flux MCP outputs JPG; saved as `night-heroes/<slug>.jpg`). PNG/WebP also fine |
| Target size | ~0.5–0.7 MB from Flux is acceptable (fetched on tap, never precached); convert to WebP if you want them leaner |
| Background | **Full-bleed scene** (deep night sky + faint horizon), not transparent — no compositing needed |
| Text | Avoid baked-in labels/watermarks (the app draws its own star labels). A faint star name is tolerable; never a logo, signature or caption block |

`<slug>` is the constellation's key in `FIG_BY_SLUG` (e.g. `centaurus`, `crux`,
`scorpius`, `orion`, `sagittarius`). After adding the file, add the slug to the
**`HERO_ART`** map in `index.html` — that's the only code change per figure.

## 2. House style (the look)

- A **luminous, semi-transparent celestial figure** — the mythological form drawn as
  glowing astral light, as if the constellation itself stood up. Think translucent
  cyan-white "ghost of light", body suggested by soft volumetric glow + clean
  contour lines, *not* an opaque painted creature or a photoreal human/animal.
- The constellation's **real bright stars sit on the figure's body** as crisp white
  star-points with soft halos, so the chart you just saw maps onto the figure.
- **Unified palette across all 18 figures** for a cohesive set: deep navy→indigo sky,
  cyan/aqua/white figure, subtle Milky-Way dust. Loot **rarity colour stays in the
  card UI** (accent bar, pill, sky marker) — do **not** recolour the figure per
  rarity; at most a *faint* secondary aura. Consistency across the set matters more.
- Mood: mythic, premium, serene observatory-poster — not cartoonish, not grimdark,
  no harsh neon. Soft glow, gentle vignette, a few delicate sparkles.
- Composition: figure roughly centred / filling the frame with breathing room;
  low dark horizon silhouette at the very bottom edge is welcome (grounds it).

## 3. Reusable prompt template

Fill the `{braces}` per constellation (see §4), then generate:

```
A luminous astral-heroic illustration of {FIGURE_NAME}, the figure of the {CONSTELLATION} constellation,
rendered as a semi-transparent celestial being made of glowing cyan-white starlight — translucent body
suggested by soft volumetric light and clean contour lines, NOT an opaque solid creature.
{POSE_AND_ACTION}. The constellation's real bright stars — {KEY_STARS} — shine as crisp white
star-points with soft halos positioned along the figure's body{DSO_NOTE}. Set against a deep
navy-to-indigo night sky with faint Milky-Way dust and a low dark horizon silhouette at the bottom edge.
Mythic, premium, serene; soft glow, gentle vignette, delicate sparkles. Cohesive observatory-poster style.
3:2 landscape composition, figure centred with breathing room.
```

**Negative / avoid:** `text, captions, watermark, signature, logo, frame, border,
UI, modern objects, photoreal human skin, opaque flat cartoon, harsh neon, cluttered,
busy background, multiple figures, off-centre crop`.

### Per-constellation checklist
- [ ] `{FIGURE_NAME}` + `{POSE_AND_ACTION}` confirmed against a reputable source
      (e.g. Ian Ridpath's *Star Tales*) — the **right** myth/pose, drawn fresh.
- [ ] `{KEY_STARS}` are the constellation's genuinely brightest/named stars.
- [ ] `{DSO_NOTE}` mentions a famous deep-sky object only if there's a striking one.
- [ ] Orientation roughly matches how the figure sits among its stars (don't mirror it
      backwards relative to the chart).

## 4. Centaurus — the first proof (filled in)

Centaurus = **Chiron**, the wise centaur who tutored Heracles, Jason and Achilles —
shown striding with a long **spear** (in myth he holds Lupus the Wolf toward the Altar
Ara). Front legs anchored by the **Pointers**, Alpha & Beta Centauri. Hosts **Omega
Centauri (NGC 5139)**, the sky's brightest globular cluster.

```
A luminous astral-heroic illustration of Chiron the wise centaur, the figure of the Centaurus constellation,
rendered as a semi-transparent celestial being made of glowing cyan-white starlight — translucent horse-and-man
body suggested by soft volumetric light and clean contour lines, NOT an opaque solid creature. A noble centaur
striding forward, holding a long spear levelled ahead, calm and dignified rather than aggressive. The constellation's
real bright stars — Alpha Centauri (Rigil Kentaurus) and Beta Centauri (Hadar) at the front hooves, plus the stars
of the body and raised arm — shine as crisp white star-points with soft halos positioned along the figure, with the
bright globular cluster Omega Centauri glowing as a small dense knot of light near the flank. Set against a deep
navy-to-indigo night sky with faint Milky-Way dust and a low dark horizon silhouette at the bottom edge. Mythic,
premium, serene; soft glow, gentle vignette, delicate sparkles. Cohesive observatory-poster style. 3:2 landscape
composition, figure centred with breathing room.
```

Saved as **`night-heroes/centaurus.jpg`** and wired into `HERO_ART`.

## 5. Adding / re-rolling a figure (recap)
1. Fill the template (§3) for the constellation; generate via Flux MCP (`flux2_max`, 1536×1024).
2. Save as `night-heroes/<slug>.jpg`.
3. Add `'<slug>':'night-heroes/<slug>.jpg'` to `HERO_ART` in `index.html` (already done for all 18).
4. Open that card in night mode — chart morphs into the figure. Done.
