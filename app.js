// @ts-check

import { CONFIG } from './config.js';
import { init, idToken, isSignedIn, signOut, who } from './auth.js';
import { call } from './api.js';
import { el } from './dom.js';
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

async function showToday() {
  $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    $('main').replaceChildren(await todayView(call));
  } catch (e) {
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function showSignedIn() {
  const me = who();
  $('signin').hidden = true;
  $('account').replaceChildren(
    el('span', { class: 'muted' }, me ? me.name || me.email : ''),
    el('button', { class: 'link', onclick: () => { signOut(); location.reload(); } }, 'Sign out'));
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
