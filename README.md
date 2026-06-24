# golf-finder

Finds available golf courses based on daylight and drive time — a single-file PWA
that by **day** shows playable SEQ golf courses by daylight + weather, and by
**night** flips to a star / sky-watching view.

Live: https://foxorama.github.io/golf-finder/

## License

Copyright (C) 2026 foxorama

This program is free software: you can redistribute it and/or modify it under the
terms of the **GNU Affero General Public License v3.0** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any later
version. See [`LICENSE`](LICENSE) for the full text.

AGPL §13 (network use): if you run a modified version of this app on a server and
let users interact with it over a network, you must offer those users the
corresponding source of your modified version.

> **Note:** the AGPL covers the *code in this repository only*. The bundled data and
> generated imagery below carry their own terms — see Attribution & data.

## Attribution & data

This app bundles and/or fetches the following third-party data, each under its own
licence (independent of the code licence above):

- **Golf-course geometry** (`course-maps.json`, the `play-geom/` course maps, and the
  baked `COURSE_GEOM` data) is derived from **© OpenStreetMap contributors**, licensed
  under the **Open Database License (ODbL)** — https://www.openstreetmap.org/copyright.
  Derived data must keep this attribution and remain ODbL share-alike.
- **Star catalogues** (`star-catalog.json`, `star-catalog-deep.json`, and the embedded
  `STAR_FIGURES` seed) are derived from the **HYG Database** (public domain) —
  https://www.astronexus.com/hyg.
- **Live weather & sky data** are fetched at runtime from
  [Open-Meteo](https://open-meteo.com/), [sunrisesunset.io](https://sunrisesunset.io/),
  and [NOAA SWPC](https://www.swpc.noaa.gov/); their data is used under each provider's
  terms.
- **Night-sky imagery** (`night-heroes/`, `night-photos/`) was generated with
  Black Forest Labs' **FLUX** models and is subject to BFL's output/usage terms, **not**
  the AGPL — check those terms before reusing these images commercially.
