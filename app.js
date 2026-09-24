// @ts-check

import { CONFIG } from './config.js';
import { init, session, user, signOutOfGoogle } from './auth.js';
import { call, lastTiming, signOut, sessionKey } from './api.js';
import { el, isoDate } from './dom.js';
import * as cache from './cache.js';
import { todayView } from './views/today.js';

/**
 * The family app (ADR-078). It holds no calendar rules and no family data: everything shown
 * comes from the server after sign-in.
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} message */
function showError(message) {
  $('main').replaceChildren(el('p', { class: 'error' }, message));
}

/** @param {number} at */
const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * Draws the last Today straight away (if it is today's), then refreshes it from the server.
 */
async function showToday() {
  const date = isoDate(new Date());
  const saved = cache.read('today');
  const status = el('p', { class: 'status muted' }, 'Updating…');
  if (saved && saved.data.date === date) $('main').replaceChildren(todayView(saved.data), status);
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading… (the first load of the day can take a few seconds)'));
  try {
    const r = await call('app.today', { date });
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write('today', r.data);
    const server = lastTiming.server_ms === null ? '' : ` · server ${(lastTiming.server_ms / 1000).toFixed(1)} s`;
    $('main').replaceChildren(todayView(r.data),
      el('p', { class: 'status muted' }, `Updated ${clock(Date.now())} · ${(lastTiming.total_ms / 1000).toFixed(1)} s${server}`));
  } catch (e) {
    const message = `Could not refresh: ${e instanceof Error ? e.message : String(e)}`;
    if (saved && saved.data.date === date) status.textContent = `${message}. Showing ${clock(saved.at)}.`;
    else showError(message);
  }
}

function showSignedIn() {
  $('signin').hidden = true;
  $('account').replaceChildren(
    el('span', { class: 'muted' }, user() ?? ''),
    el('button', { class: 'link', onclick: async () => { await signOut(); signOutOfGoogle(); cache.clear(); location.reload(); } }, 'Sign out'));
}

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* works without it */ });
  if (!CONFIG.apiUrl || !CONFIG.clientId) {
    showError('This app is not configured yet (config.js).');
    return;
  }
  // A signed-in phone goes straight to the calendar; Google is only needed to sign in.
  const initialising = init(CONFIG.clientId, $('signin')).catch((e) => {
    if (!session()) showError(e instanceof Error ? e.message : String(e));
  });
  if (session()) {
    showSignedIn();
    await showToday();
    return;
  }
  $('main').replaceChildren(el('p', { class: 'muted' }, 'Sign in with your Google account to see the calendar.'));
  await initialising;
  try {
    await sessionKey();
  } catch (e) {
    showError(`Could not sign in: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  showSignedIn();
  await showToday();
}

start();
