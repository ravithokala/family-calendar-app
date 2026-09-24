// @ts-check

/**
 * Google sign-in with Google Identity Services (ADR-078). The ID token is kept in localStorage
 * for its one-hour life, so reopening the app does not wait for Google; after that, signing in
 * again is usually silent.
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

const KEY = 'fc.idToken';
/** Refresh a little before Google's one-hour expiry. */
const MARGIN_SECONDS = 120;

/** @type {string|null} */
let token = null;
/** @type {Array<(token: string) => void>} */
let waiting = [];

/** @param {string} jwt */
function expiry(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.exp) || 0;
  } catch (e) {
    return 0;
  }
}

/** @param {string} jwt */
const fresh = (jwt) => expiry(jwt) - MARGIN_SECONDS > Date.now() / 1000;

/** The signed-in account's first name and email, for display only. */
export function who() {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { name: String(p.given_name || p.name || ''), email: String(p.email || '') };
  } catch (e) {
    return null;
  }
}

/** @returns {GoogleIdentity} */
const gis = () => /** @type {any} */ (window).google;

/** @param {string} jwt */
function accept(jwt) {
  token = jwt;
  try { localStorage.setItem(KEY, jwt); } catch (e) { /* storage may be unavailable */ }
  const resolve = waiting;
  waiting = [];
  resolve.forEach((fn) => fn(jwt));
}

/**
 * Sets up Google sign-in and draws its button into `buttonHost`. Resolves once the library is ready.
 * @param {string} clientId
 * @param {HTMLElement} buttonHost
 */
export async function init(clientId, buttonHost) {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && fresh(saved)) token = saved;
  } catch (e) { /* ignore */ }
  for (let i = 0; i < 100 && !gis()?.accounts?.id; i++) await new Promise((r) => setTimeout(r, 100));
  if (!gis()?.accounts?.id) throw new Error('Google sign-in did not load. Check the connection and reload.');
  gis().accounts.id.initialize({
    client_id: clientId,
    callback: (/** @type {CredentialResponse} */ response) => accept(response.credential),
    auto_select: true,
    use_fedcm_for_prompt: true,
    cancel_on_tap_outside: false,
  });
  gis().accounts.id.renderButton(buttonHost, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
}

/**
 * A valid ID token, signing in (silently if possible) when there is none or it is about to expire.
 * @returns {Promise<string>}
 */
export function idToken() {
  if (token && fresh(token)) return Promise.resolve(token);
  token = null;
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (waiting.length === 1) gis().accounts.id.prompt();
  });
}

/** Forgets the token, e.g. after the server refuses it. */
export function forget() {
  token = null;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

export function signOut() {
  forget();
  gis()?.accounts?.id?.disableAutoSelect();
}

export const isSignedIn = () => Boolean(token && fresh(token));
