// @ts-check
// GENERATED from app-kit/pwa/api.js. Do not edit here: change it in ../app-kit, then run "npm run sync:kit".

import { CONFIG } from './config.js';
import { session, saveSession, forgetSession, googleToken, signInReady } from './auth.js';

/**
 * Talking to the app's server (Apps Script). What differs between apps is in config.js: the
 * address, and how long each kind of request waits (CONFIG.waits).
 *
 * @typedef {{ field: string, code: string, message: string }} Issue
 * @typedef {{ ok: boolean, data: any, errors: Issue[], warnings: Issue[], server_ms?: number, setup_ms?: number, served?: string }} ApiResponse
 */

/** How long the last call took, end to end and on the server. */
export let lastTiming = { total_ms: 0, server_ms: /** @type {number|null} */ (null), setup_ms: /** @type {number|null} */ (null), served: /** @type {string|null} */ (null) };

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
 * The request did not get an answer from the app's server code: no connection, or Google
 * answered with its own error page, or it took too long. `offline` says the phone itself has no
 * connection. Whether trying again is safe is the caller's business: only if the server applies
 * a repeated save once.
 */
export class Unreachable extends Error {
  /** @param {string} message @param {boolean} offline */
  constructor(message, offline) {
    super(message);
    this.name = 'Unreachable';
    this.offline = offline;
  }
}

/**
 * One POST. The body is plain text, so the browser sends it without a CORS pre-flight,
 * which Apps Script cannot answer.
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs  0 waits however long it takes
 * @returns {Promise<ApiResponse>}
 */
async function post(body, timeoutMs) {
  const started = performance.now();
  const abort = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => abort.abort(), timeoutMs) : undefined;
  /** @type {Response} */
  let response;
  /** @type {string} */
  let text;
  try {
    response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      // Nothing of the browser's goes with it: no cookies, no cached answer, no referrer.
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: abort.signal,
    });
    text = await response.text();
  } catch (e) {
    // A failed fetch looks the same whether the phone is offline or Google sent its own error page
    // (which has no CORS header): only the phone's own online flag tells them apart.
    if (!navigator.onLine) throw new Unreachable("You're offline", true);
    throw new Unreachable(abort.signal.aborted ? `No answer after ${Math.round(timeoutMs / 1000)} seconds: is there a connection?` : "Couldn't reach the server (Google may be busy)", false);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Unreachable(`The server answered ${response.status}`, false);
  /** @type {ApiResponse} */
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    // Google's own error page instead of the app's answer.
    throw new Unreachable('The server sent an unexpected answer (Google may be busy)', false);
  }
  lastTiming = { total_ms: Math.round(performance.now() - started), server_ms: result.server_ms ?? null, setup_ms: result.setup_ms ?? null, served: result.served ?? null };
  return result;
}

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
