// @ts-check
// GENERATED from app-kit/pwa/auth.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Sign-in. Google Identity Services is used once per phone: its ID token (kept in memory only)
 * starts an app session on the server, whose key this phone keeps in localStorage. The session
 * lasts 30 days from its last use, so a phone in use stays signed in.
 * The apps share one origin (github.io), so each keeps its keys under its own prefix (CONFIG.storage).
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 */

import { CONFIG } from './config.js';

/**
 * @typedef {{ credential: string }} CredentialResponse
 * @typedef {{ accounts: { id: {
 *   initialize: (options: object) => void,
 *   renderButton: (parent: HTMLElement, options: object) => void,
 *   prompt: () => void,
 *   disableAutoSelect: () => void,
 * } } }} GoogleIdentity
 */

/** Where this phone keeps its session key, and (for apps that name their users) who it is. */
const SESSION_KEY = `${CONFIG.storage}.session`;
const USER_KEY = `${CONFIG.storage}.user`;

/** @type {Array<(token: string) => void>} */
let waiting = [];
/** Google's sign-in has loaded and been set up for this app. */
let ready = false;
/** Google's sign-in did not load (the app was opened with no connection). */
let failed = false;

/** @returns {GoogleIdentity} */
const gis = () => /** @type {any} */ (window).google;

/** @param {string} key */
function get(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

/** The app session key, if this phone is signed in. Anything that is not a key counts as signed out. */
const session = () => {
  const key = get(SESSION_KEY);
  return key !== null && /^[0-9a-f]{64}$/.test(key) ? key : null;
};

/** The application user (e.g. RT), in apps that name their users. */
const user = () => get(USER_KEY);

/** @param {string} key @param {string} [who]  the application user, if the app names its users */
function saveSession(key, who) {
  try {
    localStorage.setItem(SESSION_KEY, key);
    if (who) localStorage.setItem(USER_KEY, who);
  } catch (e) { /* storage unavailable: the phone will just sign in again */ }
}

function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) { /* ignore */ }
}

/**
 * Sets up Google sign-in (once) and draws its button into `buttonHost`. Call it again to draw the
 * button somewhere else, or with other words.
 * @param {string} clientId
 * @param {HTMLElement} buttonHost
 * @param {'signin_with'|'continue_with'} [text]  the button's words: "Sign in with Google", or
 *   "Continue with Google" where the account is being confirmed, not signed in
 */
async function init(clientId, buttonHost, text = 'signin_with') {
  for (let i = 0; i < 100 && !gis()?.accounts?.id; i++) await new Promise((r) => setTimeout(r, 100));
  if (!gis()?.accounts?.id) {
    failed = true;
    throw new Error('Google sign-in did not load. Check the connection and reload.');
  }
  if (!ready) {
    gis().accounts.id.initialize({
      client_id: clientId,
      callback: (/** @type {CredentialResponse} */ response) => {
        const resolve = waiting;
        waiting = [];
        resolve.forEach((fn) => fn(response.credential));
      },
      auto_select: true,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: false,
    });
    ready = true;
  }
  gis().accounts.id.renderButton(buttonHost, { theme: 'outline', size: 'large', text, shape: 'pill' });
}

/**
 * Whether Google's sign-in is ready, so a prompt can appear. Just after the app opens it may still
 * be loading: that is waited for. It never loads if the app was opened with no connection.
 * @param {number} [waitMs]
 * @returns {Promise<boolean>}
 */
async function signInReady(waitMs = 10000) {
  for (let waited = 0; !ready && !failed && waited < waitMs; waited += 100) await new Promise((r) => setTimeout(r, 100));
  return ready;
}

/**
 * The next Google ID token, from the button or Google's prompt; used only to start (or confirm) a
 * session. Google's prompt is shown for the first wait unless told not to: an app that keeps
 * listening after a sign-in (for the button being tapped again) waits without prompting.
 * @param {{ prompt?: boolean }} [options]
 * @returns {Promise<string>}
 */
function googleToken(options = {}) {
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (options.prompt !== false && ready && waiting.length === 1) gis().accounts.id.prompt();
  });
}

/** Shows Google's own prompt again (an app that draws its sign-in screen more than once). */
function showPrompt() {
  if (ready) gis().accounts.id.prompt();
}

function signOutOfGoogle() {
  gis()?.accounts?.id?.disableAutoSelect();
}

export { SESSION_KEY, session, user, saveSession, forgetSession, init, signInReady, googleToken, showPrompt, signOutOfGoogle };
