// @ts-check
// GENERATED from app-kit/pwa/update.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Noticing a newer release. The app opens from its saved copy (sw.js), and a home-screen app is
 * resumed, not reloaded, so it could keep showing an old version for ever. When the app opens,
 * comes back into view, or the user asks, the published version.js is compared with the running
 * one; if it is newer, the new release's service worker is installed and the page reloads into it.
 * The address then names the version being loaded (no device storage), so a stale copy can never
 * reload in a loop. The saved copy is never deleted from here.
 * The design is the Property Portfolio's.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 */

/** At most one check a minute, unless asked. */
const EVERY_MS = 60000;
/** With no internet behind the connection the request would hang. */
const CHECK_WAIT_MS = 10000;
/** How long a new release's worker gets to install and take over. */
const INSTALL_WAIT_MS = 30000;

/**
 * Asks a service worker which release it serves (null if it does not answer within 2 seconds).
 * @param {ServiceWorker} worker
 * @returns {Promise<string|null>}
 */
function workerVersion(worker) {
  return new Promise((resolve) => {
    try {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 2000);
      channel.port1.onmessage = (event) => { clearTimeout(timer); resolve(event.data && typeof event.data.version === 'string' ? event.data.version : null); };
      worker.postMessage({ type: 'version' }, [channel.port2]);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Starts watching for newer releases, and checks once now.
 * @param {{ running: string, busy?: () => boolean }} app  running: this copy's version (version.js);
 *   busy: whether something half-done is on screen (an open form) that a reload would throw away
 * @returns {(force?: boolean) => Promise<boolean>}  check now; answers whether the page is reloading
 */
function watchForUpdates(app) {
  let checkedAt = 0;

  /** @param {boolean} [force] */
  async function check(force = false) {
    const running = app.running;
    // An unpublished copy ('local') has nothing to compare with.
    if (!/ · [0-9a-f]{7,40}$/.test(running)) return false;
    if (!force && Date.now() - checkedAt < EVERY_MS) return false;
    checkedAt = Date.now();
    if (app.busy && app.busy()) return false;
    /** @type {string|null} */
    let latest = null;
    // A unique query so neither the browser nor the site's cache (up to 10 minutes) answers with an old copy.
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), CHECK_WAIT_MS);
    try {
      const response = await fetch(`version.js?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit', signal: stop.signal });
      const match = /'([^'\n]{1,80} · [0-9a-f]{7,40})'/.exec(await response.text());
      latest = match && match[1];
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
    if (!latest || latest === running) return false;
    const marker = `?v=${encodeURIComponent(latest)}`;
    // Reloaded for this release already: never loop.
    if (window.location.search === marker) return false;
    // With a service worker, reload only once the new release's worker is in charge: a reload
    // answered by the old worker would only show the old copy again.
    /** @type {ServiceWorkerRegistration|undefined} */
    let registration;
    try { registration = await navigator.serviceWorker.getRegistration(); } catch (e) { /* no worker: plain reload */ }
    if (registration) {
      try { await registration.update(); } catch (e) { return false; }
      const next = registration.installing || registration.waiting;
      if (next) {
        const ready = next.state === 'activated' || await new Promise((resolve) => {
          const giveUp = setTimeout(() => resolve(false), INSTALL_WAIT_MS);
          next.addEventListener('statechange', () => {
            if (next.state === 'activated' || next.state === 'redundant') { clearTimeout(giveUp); resolve(next.state === 'activated'); }
          });
        });
        if (!ready) return false;
      } else {
        // No new worker in sight: reload only if the worker already in charge is the new release.
        const commit = (/ · ([0-9a-f]{7,40})$/.exec(latest) || [])[1];
        const version = registration.active ? await workerVersion(registration.active) : null;
        if (!commit || !version || !version.includes(`-${commit}-`)) return false;
      }
    }
    // Something may have been opened while the new release installed.
    if (app.busy && app.busy()) return false;
    window.location.replace(window.location.pathname + marker + window.location.hash);
    return true;
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
  check(false);
  return check;
}

export { watchForUpdates };
