# Golf Finder SEQ — install / deploy notes

## ⚠️ This is now TWO files — upload both, side by side

    your-host/
      index.html   ← the app
      sw.js        ← service worker (REQUIRED for the standalone install to work)

`sw.js` must sit in the **same folder** as `index.html` and be served from the
**same https origin**. If `index.html` lives at
`https://example.com/golf/index.html`, then `sw.js` must be reachable at
`https://example.com/golf/sw.js`.

Both must be served over **https** (or `localhost` for testing). Service
workers do not run over `file://` or plain `http://`.

## Why the previous "Add to Home screen" only made a Chrome shortcut

Android only builds a real standalone app (a "WebAPK") when **all** of these are
true:

1. A web app manifest with an absolute `start_url`, `scope` and `id`  ✅ (done earlier)
2. Maskable + any-purpose icons of the right sizes                     ✅ (done earlier)
3. A **registered service worker with a fetch handler**               ✅ (this is the new `sw.js`)

Without #3, Chrome falls back to a plain bookmark shortcut that is "owned" by
Chrome — which is why clearing its data or uninstalling it acted on Chrome
itself. Adding `sw.js` supplies the missing piece.

## Installing on your phone (do this in order)

1. Upload **both** files to the host (replacing the old `index.html`).
2. On the phone: **remove the old home-screen shortcut.**
3. Open the page fresh in Chrome and let it fully load once (the service worker
   registers on load; Chrome caches installability per page, so this first
   clean load matters).
4. Chrome menu (⋮) → it should now read **"Install app"** (not "Add to Home
   screen"). Tap it.
5. The installed app should now appear in the app drawer as its own icon, open
   in standalone (no browser chrome), and uninstall independently of Chrome.

If the menu still says "Add to Home screen", open
`chrome://` DevTools remotely or check that `sw.js` returns **200** at the
expected URL — a 404 on `sw.js` is the most common cause.

## Updating later

When you change `index.html`, bump the `CACHE` constant at the top of `sw.js`
(e.g. `golf-finder-v18`). That tells installed devices to drop the old cached
shell and fetch the new one on next launch.
