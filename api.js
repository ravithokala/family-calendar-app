// @ts-check
// GENERATED from app-kit/pwa/api.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

import { CONFIG } from './config.js';
import { session, saveSession, forgetSession, googleToken, signInReady } from './auth.js';
import { sendRequest, Unreachable, lastTiming } from './request.js';

/**
 * Talking to the app's server (Apps Script). What differs between apps is in config.js: the
 * address, and how long each kind of request waits (CONFIG.waits).
 *
 * @typedef {{ field: string, code: string, message: string }} Issue
 * @typedef {{ ok: boolean, data: any, errors: Issue[], warnings: Issue[], server_ms?: number, setup_ms?: number, served?: string }} ApiResponse
 */

/**
 * How long a request that only reads waits. Connected but with no internet (mobile data used up)
 * a request never fails, it hangs: the saved copy is already on screen, so give up and say so.
 * Well over the slowest normal answer (about 7 s, first open of the day).
 */
export const READ_WAIT_MS = 20000;
/** How long signing in and out wait. */
const SIGN_IN_WAIT_MS = 45000;

/** How long this action waits unless the caller says otherwise; 0 is however long it takes. @param {string} action */
const waitFor = (action) => (CONFIG.waits.reads.includes(action) ? READ_WAIT_MS : CONFIG.waits.other);

/**
 * One request to this app's server (request.js does the sending).
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs  0 waits however long it takes
 * @returns {Promise<ApiResponse>}
 */
const post = (body, timeoutMs) => sendRequest(CONFIG.apiUrl, body, timeoutMs);

/** @param {ApiResponse} r */
const reason = (r) => r.errors.map((e) => e.message).join('; ');

/**
 * This phone's session key, signing in with Google first if there is none.
 * @returns {Promise<string>}
 */
export async function sessionKey() {
  const existing = session();
  if (existing) return existing;
  // Opened offline, Google's sign-in never loaded: waiting for its prompt would never end.
  if (!(await signInReady())) throw new Unreachable('Signed out: close and reopen the app while online to sign in again', false);
  const started = await post({ id_token: await googleToken(), action: 'auth.start' }, SIGN_IN_WAIT_MS);
  if (!started.ok) throw new Error(reason(started));
  saveSession(started.data.session, started.data.user);
  return started.data.session;
}

/**
 * Calls the server. An expired or revoked session is dropped and the call retried once after
 * signing in again.
 * @param {string} action
 * @param {unknown} [payload]
 * @param {{ timeoutMs?: number }} [options]  how long to wait for the answer, instead of CONFIG.waits
 * @returns {Promise<ApiResponse>}
 */
export async function call(action, payload = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? waitFor(action);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await post({ session: await sessionKey(), action, payload }, timeoutMs);
    // An account that is no longer allowed: its key is of no use, so it does not stay on this phone.
    if (!result.ok && result.errors[0]?.code === 'FORBIDDEN') forgetSession();
    if (result.ok || result.errors[0]?.code !== 'UNAUTHENTICATED' || attempt === 1) return result;
    forgetSession();
  }
  throw new Error('unreachable');
}

/** Ends this phone's session on the server (best effort) and forgets it here. */
export async function signOut() {
  const key = session();
  forgetSession();
  if (key) await post({ session: key, action: 'auth.end' }, SIGN_IN_WAIT_MS).catch(() => { /* offline: the key is gone here anyway */ });
}

/**
 * Signs out every device of this account (a lost phone), this one included. Needs a connection:
 * unlike signing out here, it is no use unless the server did it.
 * @returns {Promise<ApiResponse>}
 */
export async function signOutEverywhere() {
  const key = session();
  if (!key) throw new Unreachable('Signed out already', false);
  const result = await post({ session: key, action: 'auth.end_all' }, SIGN_IN_WAIT_MS);
  if (result.ok || result.errors[0]?.code === 'UNAUTHENTICATED') forgetSession();
  return result;
}

// What the apps import from here came to live in request.js.
export { Unreachable, lastTiming };
