// @ts-check
// GENERATED from app-kit/pwa/request.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * Sending one request to an app's server (Apps Script), whatever the app's own protocol: the
 * plain-text POST, how long to wait, and telling "this phone has no connection" from "the server
 * did not answer". What the answer means is the caller's business (api.js for the calendar and
 * Household; the Property Portfolio's own api.js).
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 */

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
  /** @param {string} message @param {boolean} offline */
  constructor(message, offline) {
    super(message);
    this.name = 'Unreachable';
    this.offline = offline;
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
    throw new Unreachable(abort.signal.aborted ? `No answer after ${Math.round(timeoutMs / 1000)} seconds: is there a connection?` : "Couldn't reach the server (Google may be busy)", false);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Unreachable(`The server answered ${response.status}`, false);
  /** @type {any} */
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    // Google's own error page instead of the app's answer.
    throw new Unreachable('The server sent an unexpected answer (Google may be busy)', false);
  }
  const ms = (/** @type {unknown} */ value) => (typeof value === 'number' ? value : null);
  lastTiming = { total_ms: Math.round(performance.now() - started), server_ms: ms(result?.server_ms), setup_ms: ms(result?.setup_ms),
    served: typeof result?.served === 'string' ? result.served : null };
  return result;
}

export { sendRequest, Unreachable, lastTiming };
