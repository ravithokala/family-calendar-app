// @ts-check
// GENERATED from app-kit/pwa/api.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

import { CONFIG } from './config.js';
import { session, saveSession, forgetSession, googleToken, signInReady } from './auth.js';
import { sendRequest, Unreachable, lastTiming } from './request.js';

/**
 * Talking to the app's server (Apps Script). What differs between apps is in config.js: the
 * address, and which actions only read or are slow by nature (CONFIG.waits); the rest are saves.
 * Two more settings there, both optional:
 * - `ownSignIn: true`: the app shows its own sign-in screen. A request made while signed out is
 *   answered as signed out at once (UNAUTHENTICATED), instead of waiting for Google to sign the
 *   phone in; the app signs in with startSession().
 * - `waits.save: { first, retry }`: how long a save's two tries wait, where saves are slower than
 *   the usual 12 and 25 seconds.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 *
 * @typedef {{ field: string, code: string, message: string, reason?: string }} Issue
 *   `reason`: on a sign-in refusal, the short name of the check that failed
 * @typedef {{ ok: boolean, data: any, errors: Issue[], warnings: Issue[], server_ms?: number, setup_ms?: number, served?: string }} ApiResponse
 */

/** The app's settings this file reads. */
const settings = /** @type {{ apiUrl: string, ownSignIn?: boolean, waits: { reads: readonly string[], slow: readonly string[], save?: { first: number, retry: number } } }} */ (CONFIG);

/**
 * How long a request that only reads waits. Connected but with no internet (mobile data used up)
 * a request never fails, it hangs: the saved copy is already on screen, so give up and say so.
 * Well over the slowest normal answer (about 7 s, first open of the day).
 */
const READ_WAIT_MS = 20000;
/** How long signing in and out wait. */
const SIGN_IN_WAIT_MS = 45000;
/**
 * Saving (every action that is neither a read nor slow). A normal save takes 1 to 4 seconds. The
 * first try waits a short time, because just after a connection returns a save often arrives but
 * its answer does not; the one automatic retry then gets the answer. The retry is safe: both
 * carry the same request_id, and the server applies a save once (infra/replays.js).
 */
const SAVE_WAIT_MS = 12000;
const SAVE_RETRY_WAIT_MS = 25000;
const SAVE_RETRY_PAUSE_MS = 2000;
/** Actions that take long by nature (making PDFs, reading an upload, restoring a backup): one try. */
const SLOW_WAIT_MS = 180000;

/**
 * One request to this app's server (request.js does the sending).
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs  0 waits however long it takes
 * @returns {Promise<ApiResponse>}
 */
const post = (body, timeoutMs) => sendRequest(settings.apiUrl, body, timeoutMs);

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
function onSessionEnded(listener) {
  whenEnded.push(listener);
}

/**
 * Whether a refusal ends what this phone may show: the session has ended (UNAUTHENTICATED) or the
 * account is no longer allowed (FORBIDDEN). The rule in every app: only these clear the screen.
 * Any other failed refresh (a busy or faulty server, a refused request, no answer, no connection)
 * leaves the saved copy on screen with a note (freshness.js, refreshFailedText).
 * @param {unknown} code  a refusal's code (errors[0].code)
 * @returns {boolean}
 */
const endsAccess = (code) => code === 'UNAUTHENTICATED' || code === 'FORBIDDEN';

/** The key is of no use any more: it does not stay on this phone, and nor does the saved data. */
async function sessionEnded() {
  forgetSession();
  for (const listener of whenEnded) await listener();
}

/** @param {string} message @returns {ApiResponse} */
const signedOut = (message) => ({ ok: false, data: null, errors: [{ field: 'request', code: 'UNAUTHENTICATED', message }], warnings: [] });

/**
 * Starts this phone's session with a Google ID token (kept in memory only, never stored) and
 * keeps the session key. Answers the server's answer; a refusal stores nothing.
 * @param {string} idToken
 * @returns {Promise<ApiResponse>}
 */
async function startSession(idToken) {
  const started = await post({ id_token: idToken, action: 'auth.start' }, SIGN_IN_WAIT_MS);
  if (!started.ok) return started;
  // Only a key counts: anything else would read back as signed out.
  if (!/^[0-9a-f]{64}$/.test(started.data?.session)) return signedOut('The server did not start a session');
  saveSession(started.data.session, started.data.user);
  return started;
}

/**
 * This phone's session key, signing in with Google first if there is none.
 * @returns {Promise<string>}
 */
async function sessionKey() {
  const existing = session();
  if (existing) return existing;
  // Opened offline, Google's sign-in never loaded: waiting for its prompt would never end.
  if (!(await signInReady())) throw new Unreachable('Signed out: close and reopen the app while online to sign in again', false);
  const started = await startSession(await googleToken());
  if (!started.ok) throw new Error(reason(started));
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
    // An app with its own sign-in screen: signed out is an answer, not a wait for Google.
    if (settings.ownSignIn && !session()) return signedOut('Signed out: sign in again');
    const body = { session: await sessionKey(), action, payload };
    const result = await post(requestId ? { ...body, request_id: requestId } : body, timeoutMs);
    // An account that is no longer allowed: its key is of no use, so it does not stay on this phone.
    if (!result.ok && result.errors[0]?.code === 'FORBIDDEN') await sessionEnded();
    if (result.ok || result.errors[0]?.code !== 'UNAUTHENTICATED') return result;
    await sessionEnded();
    if (attempt === 1 || settings.ownSignIn) return result;
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
async function call(action, payload = {}, options = {}) {
  if (options.timeoutMs !== undefined) return once(action, payload, options.timeoutMs, options.requestId);
  if (settings.waits.reads.includes(action)) return once(action, payload, READ_WAIT_MS);
  const requestId = options.requestId ?? crypto.randomUUID();
  if (settings.waits.slow.includes(action)) return once(action, payload, SLOW_WAIT_MS, requestId);
  const waits = settings.waits.save ?? { first: SAVE_WAIT_MS, retry: SAVE_RETRY_WAIT_MS };
  try {
    return await once(action, payload, waits.first, requestId);
  } catch (first) {
    if (!(first instanceof Unreachable) || first.offline) throw first;
    await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_PAUSE_MS));
    return once(action, payload, waits.retry, requestId);
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
async function ask(action, payload = {}, options = {}) {
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

/**
 * An app's own "confirm it's you", before something sensitive: a fresh Google ID token for the
 * signed-in account goes to the server, which remembers when (web.js, 'auth.confirm').
 * @param {string} idToken
 * @returns {Promise<ApiResponse>}
 */
async function confirmAccount(idToken) {
  const key = session();
  if (!key) return signedOut('Signed out: sign in again');
  return post({ session: key, id_token: idToken, action: 'auth.confirm' }, SIGN_IN_WAIT_MS);
}

/** Ends this phone's session on the server (best effort) and forgets it here. */
async function signOut() {
  const key = session();
  forgetSession();
  if (key) await post({ session: key, action: 'auth.end' }, SIGN_IN_WAIT_MS).catch(() => { /* offline: the key is gone here anyway */ });
}

/**
 * Signs out every device of this account (a lost phone), this one included. Needs a connection:
 * unlike signing out here, it is no use unless the server did it.
 * @returns {Promise<ApiResponse>}
 */
async function signOutEverywhere() {
  const key = session();
  if (!key) throw new Unreachable('Signed out already', false);
  const result = await post({ session: key, action: 'auth.end_all' }, SIGN_IN_WAIT_MS);
  if (result.ok || result.errors[0]?.code === 'UNAUTHENTICATED') forgetSession();
  return result;
}

// Unreachable and lastTiming came to live in request.js; the apps import them from here.
export { READ_WAIT_MS, SAVE_WAIT_MS, SAVE_RETRY_WAIT_MS, SLOW_WAIT_MS, onSessionEnded, endsAccess, startSession, sessionKey, call, ask, confirmAccount, signOut, signOutEverywhere, Unreachable, lastTiming };
