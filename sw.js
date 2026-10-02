// @ts-check

/**
 * Caches the app shell only (ADR-078): no calendar data is ever cached here. Requests to other
 * sites (the API, Google sign-in) are left to the network.
 * Only VERSION and SHELL are this app's own: the logic below the marker line comes from app-kit (ADR-100).
 */
const VERSION = 'shell-v63';
const SHELL = ['./', 'index.html', 'app.js', 'app/state.js', 'app/context.js', 'app/calendar.js', 'app/lists.js', 'app/more.js', 'app/chrome.js', 'api.js', 'auth.js', 'cache.js', 'config.js', 'version.js', 'dom.js', 'views/parts.js', 'views/month.js', 'views/forms.js', 'views/fields.js', 'views/sheet.js', 'views/more.js', 'views/review.js', 'views/sources.js', 'views/print.js', 'views/capture.js', 'views/schools.js', 'views/lists.js', 'views/routines.js', 'views/removed.js', 'views/reminders.js', 'views/search.js', 'views/system.js', 'views/household.js', 'views/account.js', 'styles.css',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

// ---- Below this line: app-kit/pwa/sw-core.js. GENERATED: change it in ../app-kit, then run "npm run sync:kit". ----

// The service worker's logic, the same in every app. Each app's pwa/sw.js starts with its own
// VERSION and SHELL (the files to save), then this, below the marker line.

/**
 * The worker's global scope. Typed loosely: the DOM and WebWorker type libraries cannot be combined.
 * @type {any}
 */
const sw = self;

/**
 * This app's saved copy. The apps share one origin (github.io), and so one cache storage: each
 * app's caches are named by its own path ("/household-admin-app/shell-v16"), and an app only ever
 * deletes its own. Until 2026-10-02 every app's worker deleted every cache but its own current
 * one, so updating one app removed the other apps' saved copies (they then could not open with no
 * connection until next opened online).
 */
const APP = new URL('./', sw.location.href).pathname;
const CACHE = `${APP}${VERSION}`;
/** Caches from before they were named by app ("shell-v15"): removed once. Never another app's current one. */
const UNNAMED = /^shell-v\d+$/;

sw.addEventListener('install', (/** @type {any} */ event) => {
  // 'reload' fetches each file from the site itself, not the browser's ten-minute copy.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith(APP) || UNNAMED.test(k))).map((k) => caches.delete(k))))
    .then(() => sw.clients.claim()));
});

// Network first, so a new version shows straight away; the saved copy covers having no connection.
// 'no-cache' asks GitHub Pages whether each file changed instead of trusting the browser's
// ten-minute copy, so the app never runs old files against a newer server.
// Only a whole, good answer (200) replaces the saved copy, never an empty or error one (a "304 Not
// Modified" re-check, a brief 404 or 503 from the site): in the Family Calendar such an answer
// replaced the good copy and the app opened unstyled and stuck on "Loading…" with no connection
// (RT's Android phone, 2026-10-02).

/**
 * How long the network gets before the saved copy is used. Connected but with no internet (mobile
 * data used up), a request does not fail: it hangs, and the app stayed on its opening screen
 * (RT, 2026-10-02, first in the Family Calendar).
 */
const PAGE_WAIT_MS = 3000;
const FILE_WAIT_MS = 5000;
/**
 * Pages opened from the saved copy, and when: for the next minute their files come from the saved
 * copy too, at once, so one page never mixes saved and newer files. After that the page is back to
 * network first, so it still notices a new version.
 * @type {Map<string, number>}
 */
const openedFromSaved = new Map();
const SAVED_MODE_MS = 60 * 1000;

sw.addEventListener('fetch', (/** @type {any} */ event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkOrSaved(event, PAGE_WAIT_MS, () => { if (event.resultingClientId) openedFromSaved.set(event.resultingClientId, Date.now()); }));
    return;
  }
  const since = openedFromSaved.get(event.clientId);
  if (since !== undefined && Date.now() - since < SAVED_MODE_MS) {
    event.respondWith(offlineCopy(event.request).then((saved) => (saved.type === 'error' ? fromNetwork(event.request) : saved)));
    return;
  }
  openedFromSaved.delete(event.clientId);
  event.respondWith(networkOrSaved(event, FILE_WAIT_MS));
});

/**
 * The file from the site, saving a good answer for later.
 * @param {any} request
 */
function fromNetwork(request) {
  return fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.status === 200 && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

/**
 * The network's answer if it comes in time; otherwise the saved copy, while the network carries on
 * in the background (a good answer is still saved for next time). With nothing saved, the network
 * is waited for however long it takes.
 * @param {any} event
 * @param {number} waitMs
 * @param {() => void} [usedSaved]
 */
async function networkOrSaved(event, waitMs, usedSaved) {
  const network = fromNetwork(event.request);
  const quiet = network.catch(() => null);
  const first = await Promise.race([quiet, new Promise((resolve) => { setTimeout(() => resolve(null), waitMs); })]);
  if (first) return first;
  const saved = await offlineCopy(event.request);
  if (saved.type === 'error') return network.catch(() => saved);
  if (usedSaved) usedSaved();
  event.waitUntil(quiet);
  return saved;
}

/**
 * The saved copy of a file, for when the network is unavailable. The site's "Vary" header is
 * ignored: the files are the same for everyone. Opening the app at any address gets the page.
 * @param {any} request
 */
async function offlineCopy(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
  if (hit && hit.status === 200) return hit;
  if (request.mode === 'navigate') {
    const page = await cache.match('./', { ignoreVary: true, ignoreSearch: true });
    if (page && page.status === 200) return page;
  }
  return Response.error();
}
