// @ts-check

import { CONFIG } from './config.js';
import { init, session } from './auth.js';
import { call, sessionKey } from './api.js';
import { el } from './dom.js';
import * as cache from './cache.js';
import { printSheet } from './views/print.js';
import { formContext } from './app/context.js';
import { showCalendar } from './app/calendar.js';
import { showLists } from './app/lists.js';
import { showMore, showReview } from './app/more.js';
import { showSignedIn, announceUpdate } from './app/chrome.js';
import { $, app, go, readState, frame, today, nextTurn, showError } from './app/state.js';

/**
 * The family app (ADR-078, ADR-080). It holds no calendar rules and no family data: everything
 * shown comes from the server after sign-in. This file starts the app and sends each address to
 * its screen: app/calendar.js (Today, Month, Week, Day), app/lists.js, app/more.js (More, Review);
 * app/chrome.js sets up the header and bottom bar, app/state.js holds what they share.
 */

/**
 * Draws the screen the address names: the header for it, then the screen itself.
 * @param {boolean} [force]  ask the server even if the saved screen is fresh
 * @param {boolean} [fresh]  and have the server rebuild its answer (ADR-088)
 */
async function show(force = false, fresh = false) {
  const s = readState();
  const f = frame(s);
  const mine = nextTurn();
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.getAttribute('data-screen') === s.screen)));
  document.querySelectorAll('#filters button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === s.view)));
  $('title').textContent = f.title;
  $('print-button').hidden = s.screen !== 'month';
  $('print-button').onclick = () => printSheet(formContext(), today(), s.date.slice(0, 7));
  $('prev').hidden = f.prev === null;
  $('next').hidden = f.next === null;
  $('prev').onclick = () => f.prev && go({ date: f.prev });
  $('next').onclick = () => f.next && go({ date: f.next });
  $('filters').hidden = s.screen === 'more' || s.screen === 'review' || s.screen === 'lists';
  if (s.screen === 'more') return showMore(mine, force, fresh);
  if (s.screen === 'lists') return showLists(mine, force, fresh);
  if (s.screen === 'review') return showReview(mine);
  return showCalendar(mine, s, f, force, fresh);
}
app.show = show;

/** The theme and filters, cached so the calendar can draw before the server answers. */
async function loadMeta() {
  const saved = cache.read('meta');
  const apply = (/** @type {any} */ m) => { app.theme = m.theme; app.views = m.views; app.meta = m; };
  if (saved) {
    apply(saved.data);
    call('meta.get').then((r) => { if (r.ok) cache.write('meta', r.data); }).catch(() => { /* next time */ });
    return;
  }
  const r = await call('meta.get');
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  cache.write('meta', r.data);
  apply(r.data);
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
  if (!session()) {
    $('main').replaceChildren(el('p', { class: 'muted' }, 'Sign in with your Google account to see the calendar.'));
    await initialising;
    try {
      await sessionKey();
    } catch (e) {
      showError(`Could not sign in: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }
  try {
    await loadMeta();
  } catch (e) {
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  showSignedIn();
  announceUpdate();
  await show();
}

start();
