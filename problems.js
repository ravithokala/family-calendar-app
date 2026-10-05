// @ts-check
// GENERATED from app-kit/pwa/problems.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

import { CONFIG } from './config.js';

/**
 * The last failed requests, kept on this phone so a bad spell can be looked at afterwards in the System check
 * (a "Not updated" morning is gone by the time anyone looks). request.js notes each request that got no usable
 * answer, or a server error; not the phone being offline, and not the app's own refusals (a stale version, a
 * bad field). Each note is the time, the action and the kind of failure, with a status or error code at most:
 * never the server's message, ids or content (the System check's rule). The last 10, for 7 days, in this app's
 * own localStorage key. Never sent anywhere.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 *
 * @typedef {'timeout'|'busy'|'unexpected'|'http'|'server'} ProblemKind
 * @typedef {{ at: number, action: string, kind: ProblemKind, code: string|null }} Problem
 */

const PROBLEMS_KEY = `${/** @type {{ storage: string }} */ (CONFIG).storage}.problems`;
const KEEP = 10;
const KEEP_MS = 7 * 24 * 3600 * 1000;
/** Server answers that mean its code failed, not that it refused the request on purpose. */
const SERVER_FAULTS = ['INTERNAL', 'BAD_REQUEST', 'UNKNOWN_ACTION'];

/** What each kind of failure means, in fixed words. */
const KIND_WORDS = {
  timeout: 'no answer in time',
  busy: "couldn't reach the server (Google busy?)",
  unexpected: "Google's error page instead of an answer",
  http: 'the server answered with an error status',
  server: 'the server hit an error',
};

/** @param {unknown} p @returns {p is Problem} */
const valid = (p) => Boolean(p) && typeof (/** @type {any} */ (p).at) === 'number' && typeof (/** @type {any} */ (p).action) === 'string'
  && Object.prototype.hasOwnProperty.call(KIND_WORDS, /** @type {any} */ (p).kind);

/** @returns {Problem[]} newest first */
function stored() {
  try {
    const all = JSON.parse(localStorage.getItem(PROBLEMS_KEY) ?? '[]');
    return Array.isArray(all) ? all.filter(valid) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Notes a failed request (request.js calls it).
 * @param {unknown} action  the request's action; anything not an action name is noted as 'request'
 * @param {ProblemKind} kind
 * @param {unknown} [code]  an HTTP status or the server's error code; anything else is left out
 * @param {number} [now]
 */
function noteProblem(action, kind, code = null, now = Date.now()) {
  const name = typeof action === 'string' && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(action) && action.length <= 40 ? action : 'request';
  const safe = (typeof code === 'number' && Number.isInteger(code)) || (typeof code === 'string' && /^([A-Z_]{2,30}|\d{3})$/.test(code)) ? String(code) : null;
  try {
    const kept = [{ at: now, action: name, kind, code: safe }, ...stored()].filter((p) => now - p.at < KEEP_MS).slice(0, KEEP);
    localStorage.setItem(PROBLEMS_KEY, JSON.stringify(kept));
  } catch (e) { /* not kept: storage full or blocked */ }
}

/**
 * Notes a server answer that is a fault of its code (an app's own refusals are not problems).
 * @param {unknown} action @param {any} result  the server's answer
 */
function noteServerFault(action, result) {
  const code = result && result.ok === false && Array.isArray(result.errors) ? result.errors[0]?.code : null;
  if (SERVER_FAULTS.includes(code)) noteProblem(action, 'server', code);
}

/** The failures of the last 7 days, newest first. @param {number} [now] @returns {Problem[]} */
const recentProblems = (now = Date.now()) => stored().filter((p) => now - p.at < KEEP_MS && p.at <= now + 60000);

/** One failure in fixed words: "Mon 5 Oct 07:45 · sync.pull: no answer in time". @param {Problem} p */
function problemText(p) {
  const d = new Date(p.at);
  const when = `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return `${when.replace(',', '')} · ${p.action}: ${KIND_WORDS[p.kind]}${p.code ? ` (${p.code})` : ''}`;
}

export { noteProblem, noteServerFault, recentProblems, problemText, SERVER_FAULTS };
