// @ts-check

/**
 * Sign-in (ADR-078, ADR-079). Google Identity Services is used once per phone: its ID token
 * (kept in memory only) starts an app session on the server, whose key this phone keeps in
 * localStorage. The session lasts 30 days from its last use, so a phone in use stays signed in.
 */

/**
 * @typedef {{ credential: string }} CredentialResponse
 * @typedef {{ accounts: { id: {
 *   initialize: (options: object) => void,
 *   renderButton: (parent: HTMLElement, options: object) => void,
 *   prompt: () => void,
 *   disableAutoSelect: () => void,
 * } } }} GoogleIdentity
 */

const SESSION = 'fc.session';
const USER = 'fc.user';

/** @type {Array<(token: string) => void>} */
let waiting = [];
let ready = false;

/** @returns {GoogleIdentity} */
const gis = () => /** @type {any} */ (window).google;

/** @param {string} key */
function get(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

/** The app session key, if this phone is signed in. */
export const session = () => get(SESSION);

/** The application user (e.g. RT), for display. */
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
  if (!gis()?.accounts?.id) throw new Error('Google sign-in did not load. Check the connection and reload.');
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
