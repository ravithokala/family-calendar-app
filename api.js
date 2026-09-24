// @ts-check

import { CONFIG } from './config.js';
import { session, saveSession, forgetSession, googleToken } from './auth.js';

/**
 * @typedef {{ field: string, code: string, message: string }} Issue
 * @typedef {{ ok: boolean, data: any, errors: Issue[], warnings: Issue[], server_ms?: number }} ApiResponse
 */

/** How long the last call took, end to end and on the server. */
export let lastTiming = { total_ms: 0, server_ms: /** @type {number|null} */ (null) };

/**
 * One POST. The body is plain text, so the browser sends it without a CORS pre-flight,
 * which Apps Script cannot answer.
 * @param {Record<string, unknown>} body
 * @returns {Promise<ApiResponse>}
 */
async function post(body) {
  const started = performance.now();
  const response = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`The server answered ${response.status}`);
  /** @type {ApiResponse} */
  const result = await response.json();
  lastTiming = { total_ms: Math.round(performance.now() - started), server_ms: result.server_ms ?? null };
  return result;
}

/** @param {ApiResponse} r */
const reason = (r) => r.errors.map((e) => e.message).join('; ');

/**
 * This phone's session key, signing in with Google first if there is none (ADR-079).
 * @returns {Promise<string>}
 */
export async function sessionKey() {
  const existing = session();
  if (existing) return existing;
  const started = await post({ id_token: await googleToken(), action: 'auth.start' });
  if (!started.ok) throw new Error(reason(started));
  saveSession(started.data.session, started.data.user);
  return started.data.session;
}

/**
 * Calls the server (ADR-078). An expired or revoked session is dropped and the call retried
 * once after signing in again.
 * @param {string} action
 * @param {unknown} [payload]
 * @returns {Promise<ApiResponse>}
 */
export async function call(action, payload = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await post({ session: await sessionKey(), action, payload });
    if (result.ok || result.errors[0]?.code !== 'UNAUTHENTICATED' || attempt === 1) return result;
    forgetSession();
  }
  throw new Error('unreachable');
}

/** Ends this phone's session on the server (best effort) and forgets it here. */
export async function signOut() {
  const key = session();
  forgetSession();
  if (key) await post({ session: key, action: 'auth.end' }).catch(() => { /* offline: the key is gone here anyway */ });
}
