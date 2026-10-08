// @ts-check
// GENERATED from app-kit/pwa/request.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Sending one request to an app's server (Apps Script): the plain-text POST, how long to wait,
 * and telling "this phone has no connection" from "the server did not answer". What the answer
 * means is the caller's business (api.js: the apps' protocol).
 * Each request that gets no usable answer, or a server error, is noted on the phone (problems.js) for the System
 * check; the phone being offline is not.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 */

import { noteProblem, noteServerFault } from './problems.js';

/**
 * How long the last request took, end to end and (when the server says) on the server.
 * @type {{ total_ms: number, server_ms: number|null, setup_ms: number|null, served: string|null }}
 */
let lastTiming = { total_ms: 0, server_ms: null, setup_ms: null, served: null };

/**
 * The request did not get an answer from the app's server code: no connection, or Google
 * answered with its own error page, or it took too long. `offline` says the phone itself has no
 * connection. Whether trying again is safe is the caller's business: only if the server applies
 * a repeated save once.
 */
class Unreachable extends Error {
  /**
   * @param {string} message @param {boolean} offline
   * @param {'offline'|'timeout'|'busy'|'unexpected'|'http'|'signed_out'} [kind]  what went wrong, for the phone's note of problems
   *   ('signed_out': no request was sent, the phone could not sign in)
   * @param {number|null} [status]  the HTTP status, when the server answered with one
   */
  constructor(message, offline, kind = offline ? 'offline' : 'busy', status = null) {
    super(message);
    this.name = 'Unreachable';
    this.offline = offline;
    this.kind = kind;
    this.status = status;
  }
}

/**
 * One POST; answers the server's JSON. The body is plain text, so the browser sends it without a
 * CORS pre-flight, which Apps Script cannot answer.
 * @param {string} url  the server's address
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs  0 waits however long it takes
 * @returns {Promise<any>}
 */
async function sendRequest(url, body, timeoutMs) {
  const started = performance.now();
  const abort = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => abort.abort(), timeoutMs) : undefined;
  /** @type {Response} */
  let response;
  /** @type {string} */
  let text;
  try {
    response = await fetch(url, {
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
    throw noted(body, abort.signal.aborted ? new Unreachable(`No answer after ${Math.round(timeoutMs / 1000)} seconds: is there a connection?`, false, 'timeout')
      : new Unreachable("Couldn't reach the server (Google may be busy)", false, 'busy'));
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw noted(body, new Unreachable(`The server answered ${response.status}`, false, 'http', response.status));
  /** @type {any} */
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    // Google's own error page instead of the app's answer.
    throw noted(body, new Unreachable('The server sent an unexpected answer (Google may be busy)', false, 'unexpected'));
  }
  noteServerFault(body.action, result);
  const ms = (/** @type {unknown} */ value) => (typeof value === 'number' ? value : null);
  lastTiming = { total_ms: Math.round(performance.now() - started), server_ms: ms(result?.server_ms), setup_ms: ms(result?.setup_ms),
    served: typeof result?.served === 'string' ? result.served : null };
  return result;
}

/**
 * Notes a request that got no usable answer on this phone (problems.js), and hands the error back to throw.
 * @param {Record<string, unknown>} body @param {Unreachable} error
 */
function noted(body, error) {
  if (error.kind !== 'offline') noteProblem(body.action, /** @type {'timeout'|'busy'|'unexpected'|'http'} */ (error.kind), error.status);
  return error;
}

export { sendRequest, Unreachable, lastTiming };
