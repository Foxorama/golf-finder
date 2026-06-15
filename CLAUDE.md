# Golf Finder — working notes for Claude

A single-file PWA: by **day** it shows playable SEQ (South-East Queensland) golf
courses by daylight + weather; by **night** it flips to a star/sky-watching view.
Hosted on GitHub Pages at https://foxorama.github.io/golf-finder/ (deploys from
`main`).

## Layout
- **`index.html`** — the whole app (HTML + CSS + JS, ~190 KB). Almost all work
  happens here. There is no build step; the file ships as-is.
- **`sw.js`** — service worker (offline shell + makes it installable).
- **`course-maps.json`** — pre-baked OSM golf-course geometry (CI-generated;
  runtime Overpass fetch is the fallback). `scripts/build-course-maps.mjs` +
  `.github/workflows/course-maps.yml` generate it (manual-dispatch; Overpass
  throttles CI IPs, so it often needs a residential connection — left as-is).
- Icons / screenshots / `README.md` / `INSTALL.md` are static assets.

## Change & versioning flow
- `main` is **branch-protected** — never commit to it directly. Each change:
  `git checkout -b <topic>` → edit → commit → push → `gh pr create` →
  `gh pr merge <branch> --merge --delete-branch` → `git checkout main && git pull`.
- The app has **no version number**; git history + merged PRs are the record.
  Commit messages should explain the *why*. End commits with the
  `Co-Authored-By: Claude` trailer.
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
There's no dev server in the repo. To actually see a change, spin up a throwaway
static server and drive it with the preview tool:
- Write a tiny PowerShell `HttpListener` `serve.ps1` serving the repo dir, and a
  `.claude/launch.json` (note: the preview tool's cwd is `C:\Golf Finder`, a
  *different* folder from the repo `C:/golf-finder` — put `launch.json` under the
  cwd, point `serve.ps1` at the repo). `preview_start` → `preview_eval` to
  inject/measure DOM, `preview_screenshot` to eyeball. **Delete `serve.ps1` and
  the `launch.json` before committing** (they're scratch, not repo files).
- Measuring beats eyeballing for geometry: read computed transforms / element
  rects via `preview_eval` (e.g. confirming the club head meets the ball).

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
