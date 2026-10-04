// @ts-check
// GENERATED from app-kit/pwa/install.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Installing the app from inside it: an "Install this app" button. On Android, Chrome's own ⋮ menu
 * refuses to install a second app from the same site (it asks whether ANY app from the origin is
 * installed, and all the apps share ravithokala.github.io), while the page's own install prompt
 * asks only whether THIS app's address is taken (Chrome 154, RT's phone, 2026-10-04). So each app
 * offers its own button, through Chrome's `beforeinstallprompt`.
 *
 * Call watchInstall() first thing at start-up: Chrome offers the prompt once, early, and an offer
 * nobody was listening for is lost until the next page load. Screens then read installState(),
 * redraw on onInstallChange(), and call install() from a tap.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 *
 * @typedef {'installed' | 'ready' | 'unavailable'} InstallState
 *   installed: running from the home-screen icon, or installed during this visit
 *   ready: Chrome has offered to install; install() shows its dialog
 *   unavailable: no offer (another browser, iPhone, already installed, or Chrome has not offered yet)
 * @typedef {Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }} InstallOffer
 */

/** @type {InstallOffer | null} */
let offer = null;
let installedNow = false;
let watching = false;
/** @type {Set<() => void>} */
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

/** Whether the app is running from its home-screen icon rather than in a browser tab. */
function runningInstalled() {
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  // iPhone's own flag for a page opened from the home screen.
  return standalone || /** @type {any} */ (navigator).standalone === true;
}

/** Starts listening for Chrome's offer. Safe to call more than once. */
function watchInstall() {
  if (watching) return;
  watching = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's own mini-banner away: the app shows its button where it chooses.
    event.preventDefault();
    offer = /** @type {InstallOffer} */ (event);
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    installedNow = true;
    changed();
  });
}

/** @returns {InstallState} */
function installState() {
  if (installedNow || runningInstalled()) return 'installed';
  return offer ? 'ready' : 'unavailable';
}

/** Called whenever installState() may have changed. @param {() => void} fn */
const onInstallChange = (fn) => { listeners.add(fn); };

/**
 * Shows Chrome's install dialog. Must be called from a tap. Answers what the person chose, or
 * 'unavailable' if there was no offer. An offer can be used once: after 'dismissed', Chrome may
 * offer again later (a new beforeinstallprompt).
 * @returns {Promise<'accepted' | 'dismissed' | 'unavailable'>}
 */
async function install() {
  const current = offer;
  if (!current) return 'unavailable';
  offer = null;
  changed();
  await current.prompt();
  const { outcome } = await current.userChoice;
  return outcome;
}

/** What to say when there is no button. */
function installHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios ? 'On iPhone: open this page in Safari, tap Share, then Add to Home Screen.'
    : 'Open this page in Chrome to install it. If no Install button appears, it is probably installed already: look for its icon.';
}

export { watchInstall, installState, onInstallChange, install, installHint };
