// @ts-check

import { CONFIG } from './config.js';
import { idToken, forget } from './auth.js';

/**
 * @typedef {{ field: string, code: string, message: string }} Issue
 * @typedef {{ ok: boolean, data: any, errors: Issue[], warnings: Issue[], server_ms?: number }} ApiResponse
 */

/** How long the last call took, end to end and on the server. */
export let lastTiming = { total_ms: 0, server_ms: /** @type {number|null} */ (null) };

/**
 * Calls the server (ADR-078). The body is plain text, so the browser sends it without a CORS
 * pre-flight, which Apps Script cannot answer. A refused sign-in is retried once with a new token.
 * @param {string} action
 * @param {unknown} [payload]
 * @returns {Promise<ApiResponse>}
 */
export async function call(action, payload = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = performance.now();
    const response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ id_token: await idToken(), action, payload }),
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    /** @type {ApiResponse} */
    const result = await response.json();
    lastTiming = { total_ms: Math.round(performance.now() - started), server_ms: result.server_ms ?? null };
    if (result.ok || result.errors[0]?.code !== 'UNAUTHENTICATED' || attempt === 1) return result;
    forget();
  }
  throw new Error('unreachable');
}
