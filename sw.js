// @ts-check

/**
 * Caches the app shell only (ADR-078): no calendar data is ever cached here. Requests to other
 * sites (the API, Google sign-in) are left to the network.
 */
const VERSION = 'shell-v44';
const SHELL = ['./', 'index.html', 'app.js', 'app/state.js', 'app/context.js', 'app/calendar.js', 'app/lists.js', 'app/more.js', 'app/chrome.js', 'api.js', 'auth.js', 'cache.js', 'config.js', 'version.js', 'dom.js', 'views/parts.js', 'views/month.js', 'views/forms.js', 'views/fields.js', 'views/sheet.js', 'views/more.js', 'views/review.js', 'views/sources.js', 'views/print.js', 'views/capture.js', 'views/schools.js', 'views/lists.js', 'views/routines.js', 'views/removed.js', 'views/reminders.js', 'views/search.js', 'styles.css',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

/**
 * The worker's global scope. Typed loosely: the DOM and WebWorker type libraries cannot be combined.
 * @type {any}
 */
const sw = self;

sw.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => sw.clients.claim()));
});

// Network first, so a new version shows straight away; the cache covers going offline.
// 'no-cache' asks GitHub Pages whether each file changed instead of trusting the browser's
// ten-minute copy, so the app never runs old files against a newer server.
sw.addEventListener('fetch', (/** @type {any} */ event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;
  event.respondWith(fetch(event.request, { cache: 'no-cache' })
    .then((response) => {
      const copy = response.clone();
      caches.open(VERSION).then((cache) => cache.put(event.request, copy));
      return response;
    })
    .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())));
});
