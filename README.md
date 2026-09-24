# golf-finder

Finds available golf courses based on daylight and drive time — a single-file PWA
that by **day** shows playable SEQ golf courses by daylight + weather, and by
**night** flips to a star / sky-watching view.

Live: https://foxorama.github.io/golf-finder/ · About: https://vulpecula.games/golf-finder/

## Licence

**© 2026 Vulpecula Games. All rights reserved.** See [`LICENSE`](LICENSE).

The source is public so you can read it, quote it and learn from it, but that isn't
a licence to reuse it. If you want to use something, ask — info@vulpecula.games.
The answer is usually yes.

Versions up to and including commit `db04b17` (2026-08-31) were published under the
GNU AGPL v3; copies of those versions obtained under it keep those terms.

> **Note:** "all rights reserved" covers Vulpecula Games' *own work* — the code, text
> and design. The bundled data, fonts and generated imagery below are not ours and
> carry their own terms.

## Attribution & data

This app bundles and/or fetches the following third-party material, each under its
own licence (independent of the notice above):

- **Golf-course geometry** (`course-maps.json`, the `play-geom/` course maps, and the
  baked `COURSE_GEOM` data) is derived from **© OpenStreetMap contributors**, licensed
  under the **Open Database License (ODbL)** — https://www.openstreetmap.org/copyright.
  Derived data must keep this attribution and remain ODbL share-alike.
- **Star catalogues** (`star-catalog.json`, `star-catalog-deep.json`, and the embedded
  `STAR_FIGURES` seed) are derived from the **HYG Database** (public domain) —
  https://www.astronexus.com/hyg.
- **Fonts** (`fonts/`: DM Mono and Syne) are under the **SIL Open Font License 1.1** —
  notices and licence text in [`fonts/OFL-DMMono.txt`](fonts/OFL-DMMono.txt) and
  [`fonts/OFL-Syne.txt`](fonts/OFL-Syne.txt).
- **World outline** (`world-land.json`, the aurora globe) is derived from
  **Natural Earth** (public domain).
- **Live weather & sky data** are fetched at runtime from
  [Open-Meteo](https://open-meteo.com/), [sunrisesunset.io](https://sunrisesunset.io/),
  [NOAA SWPC](https://www.swpc.noaa.gov/) and [wheretheiss.at](https://wheretheiss.at/);
  their data is used under each provider's terms.
- **Night-sky imagery** (`night-heroes/`, `night-photos/`) was generated with
  Black Forest Labs' **FLUX** models and is subject to BFL's output/usage terms.
