/* Golf Finder SEQ — service worker.
 *
 * Two jobs:
 *  1. Existence of a fetch handler is what makes Android build a real
 *     standalone WebAPK from "Add to Home screen" (instead of a Chrome
 *     bookmark shortcut). This is the whole reason this file exists.
 *  2. Cache the app shell so it opens offline. Live data (weather, sunset,
 *     space-weather, fonts) is always network-first and simply unavailable
 *     offline — the shell still loads and shows its last state.
 *
 * Bump CACHE when index.html changes so clients pick up the new version.
 */
const CACHE = 'golf-finder-v19';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App shell / same-origin: cache-first, fall back to network, then to the
  // cached index for navigations (so a deep refresh offline still works).
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
    );
    return;
  }

  // Live data APIs (weather, sunset, space-weather): always go to the network,
  // never cache. Caching a forecast — or worse, a 429 error — would serve
  // stale/broken data later. A failed live call just means that datum is
  // unavailable; the app already handles ok:false gracefully.
  const LIVE_HOSTS = ['api.open-meteo.com', 'api.sunrisesunset.io', 'services.swpc.noaa.gov', 'api.wheretheiss.at'];
  if (LIVE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(fetch(req));
    return;
  }

  // Cross-origin static assets (fonts): network-first, cache only real successes
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
