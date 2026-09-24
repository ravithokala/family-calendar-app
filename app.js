// @ts-check

import { CONFIG } from './config.js';
import { init, idToken, isSignedIn, signOut, who } from './auth.js';
import { call, lastTiming } from './api.js';
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
  const me = who();
  $('signin').hidden = true;
  $('account').replaceChildren(
    el('span', { class: 'muted' }, me ? me.name || me.email : ''),
    el('button', { class: 'link', onclick: () => { signOut(); cache.clear(); location.reload(); } }, 'Sign out'));
  showToday();
}

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* works without it */ });
  if (!CONFIG.apiUrl || !CONFIG.clientId) {
    showError('This app is not configured yet (config.js).');
    return;
  }
  try {
    await init(CONFIG.clientId, $('signin'));
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return;
  }
  if (isSignedIn()) {
    showSignedIn();
    return;
  }
  $('main').replaceChildren(el('p', { class: 'muted' }, 'Sign in with your Google account to see the calendar.'));
  await idToken();
  showSignedIn();
}

start();
