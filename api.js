// @ts-check
// GENERATED from app-kit/pwa/api.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

import { CONFIG } from './config.js';
import { session, saveSession, forgetSession, googleToken, signInReady } from './auth.js';
import { sendRequest, Unreachable, lastTiming } from './request.js';

/**
 * Talking to the app's server (Apps Script). What differs between apps is in config.js: the
 * address, and which actions only read or are slow by nature (CONFIG.waits); the rest are saves.
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
/**
 * Saving (every action that is neither a read nor slow). A normal save takes 1 to 4 seconds. The
 * first try waits a short time, because just after a connection returns a save often arrives but
 * its answer does not; the one automatic retry then gets the answer. The retry is safe: both
 * carry the same request_id, and the server applies a save once (infra/replays.js).
 */
export const SAVE_WAIT_MS = 12000;
export const SAVE_RETRY_WAIT_MS = 25000;
const SAVE_RETRY_PAUSE_MS = 2000;
/** Actions that take long by nature (making PDFs, reading an upload, restoring a backup): one try. */
export const SLOW_WAIT_MS = 180000;

/**
 * One request to this app's server (request.js does the sending).
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs  0 waits however long it takes
 * @returns {Promise<ApiResponse>}
 */
const post = (body, timeoutMs) => sendRequest(CONFIG.apiUrl, body, timeoutMs);

/** @param {ApiResponse} r */
const reason = (r) => r.errors.map((e) => e.message).join('; ');

/** @type {Array<() => void|Promise<void>>} */
const whenEnded = [];
/**
 * Called when the server says this phone's session has ended (expired, ended from another device
 * with "sign out all devices", or the account no longer allowed), after the key is forgotten and
 * before anything else: the app removes its saved copy of the data, so a phone that is no longer
 * signed in shows nothing. Not called by signing out here, which the app does itself.
 * @param {() => void|Promise<void>} listener
 */
export function onSessionEnded(listener) {
  whenEnded.push(listener);
}

/** The key is of no use any more: it does not stay on this phone, and nor does the saved data. */
async function sessionEnded() {
  forgetSession();
  for (const listener of whenEnded) await listener();
}

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
 * One request with this phone's session. An expired or revoked session is dropped and the
 * request sent once more after signing in again.
 * @param {string} action
 * @param {unknown} payload
 * @param {number} timeoutMs
 * @param {string} [requestId]  for a save: the server applies one id once
 * @returns {Promise<ApiResponse>}
 */
async function once(action, payload, timeoutMs, requestId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = { session: await sessionKey(), action, payload };
    const result = await post(requestId ? { ...body, request_id: requestId } : body, timeoutMs);
    // An account that is no longer allowed: its key is of no use, so it does not stay on this phone.
    if (!result.ok && result.errors[0]?.code === 'FORBIDDEN') await sessionEnded();
    if (result.ok || result.errors[0]?.code !== 'UNAUTHENTICATED') return result;
    await sessionEnded();
    if (attempt === 1) return result;
  }
  throw new Error('unreachable');
}

/**
 * Calls the server. What kind of action it is (config.js, CONFIG.waits) decides how:
 * - a read gives up after 20 seconds: the saved copy is on screen;
 * - a slow action gets one long try;
 * - anything else is a save: an id, a short first try, and one automatic retry with the same id
 *   if no answer came (never when the phone itself has no connection). Whatever happens to the
 *   answers, the server applies it once.
 * @param {string} action
 * @param {unknown} [payload]
 * @param {{ timeoutMs?: number, requestId?: string }} [options]  timeoutMs: one try with this wait,
 *   instead of the above; requestId: the save's id, when the app wants a second tap on the same
 *   form to count as the same save
 * @returns {Promise<ApiResponse>}
 */
export async function call(action, payload = {}, options = {}) {
  if (options.timeoutMs !== undefined) return once(action, payload, options.timeoutMs, options.requestId);
  if (CONFIG.waits.reads.includes(action)) return once(action, payload, READ_WAIT_MS);
  const requestId = options.requestId ?? crypto.randomUUID();
  if (CONFIG.waits.slow.includes(action)) return once(action, payload, SLOW_WAIT_MS, requestId);
  try {
    return await once(action, payload, SAVE_WAIT_MS, requestId);
  } catch (first) {
    if (!(first instanceof Unreachable) || first.offline) throw first;
    await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_PAUSE_MS));
    return once(action, payload, SAVE_RETRY_WAIT_MS, requestId);
  }
}

/**
 * As call(), but always answers: a request that got no answer comes back as a refusal the screen
 * can show like any other, instead of an error to catch. For forms, whose saves could otherwise
 * fail without a word.
 * @param {string} action
 * @param {unknown} [payload]
 * @param {{ timeoutMs?: number, requestId?: string }} [options]
 * @returns {Promise<ApiResponse>}
 */
export async function ask(action, payload = {}, options = {}) {
  try {
    return await call(action, payload, options);
  } catch (e) {
    const offline = e instanceof Unreachable && e.offline;
    // After two tries with no answer a save may still have arrived: say so, rather than "try again".
    const message = offline ? "You're offline: connect, then try again."
      : `${e instanceof Error ? e.message : String(e)}. If this was a change, check whether it was saved before trying again.`;
    return { ok: false, data: null, errors: [{ field: 'request', code: offline ? 'OFFLINE' : 'NO_ANSWER', message }], warnings: [] };
  }
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
