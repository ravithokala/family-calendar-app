// @ts-check
// GENERATED from app-kit/pwa/auth.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Sign-in. Google Identity Services is used once per phone: its ID token (kept in memory only)
 * starts an app session on the server, whose key this phone keeps in localStorage. The session
 * lasts 30 days from its last use, so a phone in use stays signed in.
 * The apps share one origin (github.io), so each keeps its keys under its own prefix (CONFIG.storage).
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

const SESSION = `${CONFIG.storage}.session`;
const USER = `${CONFIG.storage}.user`;

/** @type {Array<(token: string) => void>} */
let waiting = [];
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
export const session = () => {
  const key = get(SESSION);
  return key !== null && /^[0-9a-f]{64}$/.test(key) ? key : null;
};

/** The application user (e.g. RT). */
export const user = () => get(USER);

/** @param {string} key @param {string} who */
export function saveSession(key, who) {
  try {
    localStorage.setItem(SESSION, key);
    localStorage.setItem(USER, who);
  } catch (e) { /* storage unavailable: the phone will just sign in again */ }
}

export function forgetSession() {
  try {
    localStorage.removeItem(SESSION);
    localStorage.removeItem(USER);
  } catch (e) { /* ignore */ }
}

/**
 * Sets up Google sign-in and draws its button into `buttonHost`.
 * @param {string} clientId
 * @param {HTMLElement} buttonHost
 */
export async function init(clientId, buttonHost) {
  for (let i = 0; i < 100 && !gis()?.accounts?.id; i++) await new Promise((r) => setTimeout(r, 100));
  if (!gis()?.accounts?.id) {
    failed = true;
    throw new Error('Google sign-in did not load. Check the connection and reload.');
  }
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
  gis().accounts.id.renderButton(buttonHost, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
  ready = true;
}

/**
 * Whether Google's sign-in is ready, so a prompt can appear. Just after the app opens it may still
 * be loading: that is waited for. It never loads if the app was opened with no connection.
 * @param {number} [waitMs]
 * @returns {Promise<boolean>}
 */
export async function signInReady(waitMs = 10000) {
  for (let waited = 0; !ready && !failed && waited < waitMs; waited += 100) await new Promise((r) => setTimeout(r, 100));
  return ready;
}

/**
 * A fresh Google ID token, from the button or Google's prompt; used only to start a session.
 * @returns {Promise<string>}
 */
export function googleToken() {
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (ready && waiting.length === 1) gis().accounts.id.prompt();
  });
}

export function signOutOfGoogle() {
  gis()?.accounts?.id?.disableAutoSelect();
}
