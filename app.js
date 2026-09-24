// @ts-check

import { CONFIG } from './config.js';
import { init, session, user, signOutOfGoogle } from './auth.js';
import { call, lastTiming, signOut, sessionKey } from './api.js';
import { el, isoDate, addDays, addMonths, mondayOf, niceDate, longDate, monthTitle } from './dom.js';
import * as cache from './cache.js';
import { daySection, remindersOn } from './views/parts.js';
import { monthView, monthRange } from './views/month.js';

/**
 * The family app (ADR-078, ADR-080). It holds no calendar rules and no family data: everything
 * shown comes from the server after sign-in. Screens: Today, Month (default), Week, Day, each for
 * one filter (Family, C, R, RT, G). The screen lives in the address, so Back works.
 *
 * @typedef {'today' | 'month' | 'week' | 'day'} Screen
 * @typedef {{ screen: Screen, date: string, view: string }} State
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const SCREENS = /** @type {Screen[]} */ (['today', 'month', 'week', 'day']);
const VIEW_KEY = 'fc.view';
/** @type {import('./views/parts.js').Theme|null} */
let theme = null;
/** @type {string[]} */
let views = ['FAMILY'];

const today = () => isoDate(new Date());

/** @returns {State} */
function readState() {
  const [screen, date, view] = location.hash.replace(/^#\/?/, '').split('/');
  let saved = 'FAMILY';
  try { saved = localStorage.getItem(VIEW_KEY) ?? 'FAMILY'; } catch (e) { /* ignore */ }
  return {
    screen: SCREENS.includes(/** @type {Screen} */ (screen)) ? /** @type {Screen} */ (screen) : 'month',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : today(),
    view: views.includes(view) ? view : views.includes(saved) ? saved : 'FAMILY',
  };
}

/** @param {Partial<State>} change */
function go(change) {
  const next = { ...readState(), ...change };
  try { localStorage.setItem(VIEW_KEY, next.view); } catch (e) { /* ignore */ }
  location.hash = `#/${next.screen}/${next.date}/${next.view}`;
}

/** @param {number} at */
const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * The "Updated …" line; tapping it refreshes now.
 * @param {string} text
 */
const refreshLink = (text) => el('p', { class: 'status muted', onclick: () => show(true) }, `${text} · tap to refresh`);

/** @param {string} message */
function showError(message) {
  $('main').replaceChildren(el('p', { class: 'error' }, message));
}

/** @param {number} count */
function showPending(count) {
  $('pending').hidden = count === 0;
  $('pending').textContent = count === 0 ? '' : `${count} to review`;
}

/**
 * The range a screen needs, its title, and how to step back and forward.
 * @param {State} s
 */
function frame(s) {
  if (s.screen === 'month') {
    const start = `${s.date.slice(0, 7)}-01`;
    return { ...monthRange(start), title: monthTitle(start), prev: addMonths(start, -1), next: addMonths(start, 1) };
  }
  if (s.screen === 'week') {
    const from = mondayOf(s.date);
    return { from, to: addDays(from, 6), title: `Week of ${niceDate(from)}`, prev: addDays(from, -7), next: addDays(from, 7) };
  }
  if (s.screen === 'day') return { from: s.date, to: s.date, title: longDate(s.date), prev: addDays(s.date, -1), next: addDays(s.date, 1) };
  const t = today();
  return { from: t, to: addDays(t, 1), title: 'Today', prev: null, next: null };
}

/**
 * Draws one screen from its data.
 * @param {State} s
 * @param {import('./views/parts.js').DaysData} data
 */
function draw(s, data) {
  const t = /** @type {import('./views/parts.js').Theme} */ (theme);
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const openDay = (/** @type {string} */ date) => go({ screen: 'day', date });
  if (s.screen === 'month') return monthView(t, data, `${s.date.slice(0, 7)}-01`, today(), openDay);
  if (s.screen === 'week') {
    return el('div', {}, data.days.map((d) => daySection(t, niceDate(d.date), d, { onTitle: () => openDay(d.date) })));
  }
  if (s.screen === 'day') return el('div', {}, daySection(t, 'Events', byDate.get(s.date)), remindersOn(data.reminders, s.date));
  const tomorrow = addDays(data.from, 1);
  return el('div', {},
    daySection(t, `Today · ${niceDate(data.from)}`, byDate.get(data.from), { onTitle: () => openDay(data.from) }),
    daySection(t, `Tomorrow · ${niceDate(tomorrow)}`, byDate.get(tomorrow), { onTitle: () => openDay(tomorrow) }),
    remindersOn(data.reminders, data.from));
}

/** Guards against an older request finishing after a newer one. */
let showing = 0;
/** A saved screen younger than this is shown without asking the server again. */
const FRESH_MS = 60 * 1000;

/** @param {boolean} [force]  ask the server even if the saved screen is fresh */
async function show(force = false) {
  const s = readState();
  const f = frame(s);
  const mine = ++showing;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', String(b.getAttribute('data-screen') === s.screen)));
  document.querySelectorAll('#filters button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === s.view)));
  $('title').textContent = f.title;
  $('today-button').hidden = s.screen === 'today';
  $('prev').hidden = f.prev === null;
  $('next').hidden = f.next === null;
  $('prev').onclick = () => f.prev && go({ date: f.prev });
  $('next').onclick = () => f.next && go({ date: f.next });

  const key = `days:${s.view}:${f.from}:${f.to}`;
  const saved = cache.covering(s.view, f.from, f.to);
  const status = el('p', { class: 'status muted' }, 'Updating…');
  if (saved) {
    showPending(saved.data.pending);
    if (!force && Date.now() - saved.at < FRESH_MS) {
      $('main').replaceChildren(draw(s, saved.data), refreshLink(`Updated ${clock(saved.at)}`));
      return;
    }
    $('main').replaceChildren(draw(s, saved.data), status);
  } else {
    $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading… (the first load of the day can take a few seconds)'));
  }
  try {
    const r = await call('app.days', { from: f.from, to: f.to, view: s.view });
    if (mine !== showing) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write(key, r.data);
    showPending(r.data.pending);
    const server = lastTiming.server_ms === null ? '' : ` · server ${(lastTiming.server_ms / 1000).toFixed(1)} s`;
    $('main').replaceChildren(draw(s, r.data),
      refreshLink(`Updated ${clock(Date.now())} · ${(lastTiming.total_ms / 1000).toFixed(1)} s${server}`));
  } catch (e) {
    if (mine !== showing) return;
    const message = `Could not refresh: ${e instanceof Error ? e.message : String(e)}`;
    if (saved) status.textContent = `${message}. Showing ${clock(saved.at)}.`;
    else showError(message);
  }
}

/** The theme and filters, cached so the calendar can draw before the server answers. */
async function loadMeta() {
  const saved = cache.read('meta');
  const apply = (/** @type {any} */ m) => { theme = m.theme; views = m.views; };
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

function showSignedIn() {
  $('signin').hidden = true;
  $('chrome').hidden = false;
  $('account').replaceChildren(
    el('span', { class: 'muted' }, user() ?? ''),
    el('button', { class: 'link', onclick: async () => { await signOut(); signOutOfGoogle(); cache.clear(); location.hash = ''; location.reload(); } }, 'Sign out'));
  $('filters').replaceChildren(...views.map((v) => el('button', { 'data-view': v, onclick: () => go({ view: v }) }, v === 'FAMILY' ? 'Family' : v)));
  $('tabs').replaceChildren(...SCREENS.map((screen) => el('button', {
    'data-screen': screen,
    onclick: () => go({ screen, date: screen === 'today' ? today() : readState().date }),
  }, screen[0].toUpperCase() + screen.slice(1))));
  $('today-button').onclick = () => go({ date: today() });
  window.addEventListener('hashchange', () => show());
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
  await show();
}

start();
