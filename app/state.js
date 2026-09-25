// @ts-check

import { el, isoDate, addDays, addMonths, mondayOf, niceDate, longDate, monthTitle } from '../dom.js';
import { monthRange } from '../views/month.js';

/**
 * What every part of the app shares: the settings loaded from the server, where the app is (the
 * address, so Back works), the header's small helpers, and the guard against an older request
 * finishing after a newer one.
 *
 * @typedef {'today' | 'month' | 'week' | 'day' | 'lists' | 'more' | 'review'} Screen
 * @typedef {{ screen: Screen, date: string, view: string, list: string|null }} State
 */

export const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

export const SCREENS = /** @type {Screen[]} */ (['today', 'month', 'week', 'day', 'lists', 'more', 'review']);
/**
 * The bottom bar (RT, 2026-09-24: Lists replaces Day). Day is reached by tapping a day in Month or
 * Week; Review from the badge and More.
 */
export const TABS = /** @type {Screen[]} */ (['today', 'month', 'week', 'lists', 'more']);
const VIEW_KEY = 'fc.view';

/**
 * The theme, filters and vocabularies from the server (ADR-080), and the router, which app.js
 * fills in: screens redraw through it without importing it.
 * @type {{ theme: import('../views/parts.js').Theme|null, views: string[], meta: any,
 *   show: (force?: boolean, fresh?: boolean) => Promise<void> }}
 */
export const app = { theme: null, views: ['FAMILY'], meta: null, show: async () => {} };

export const today = () => isoDate(new Date());

/** @returns {State} */
export function readState() {
  const [screen, date, view, list] = location.hash.replace(/^#\/?/, '').split('/');
  let saved = 'FAMILY';
  try { saved = localStorage.getItem(VIEW_KEY) ?? 'FAMILY'; } catch (e) { /* ignore */ }
  return {
    screen: SCREENS.includes(/** @type {Screen} */ (screen)) ? /** @type {Screen} */ (screen) : 'month',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : today(),
    view: app.views.includes(view) ? view : app.views.includes(saved) ? saved : 'FAMILY',
    list: /^[\w-]+$/.test(list ?? '') ? list : null,
  };
}

/** @param {Partial<State>} change */
export function go(change) {
  const next = { ...readState(), ...change };
  try { localStorage.setItem(VIEW_KEY, next.view); } catch (e) { /* ignore */ }
  location.hash = `#/${next.screen}/${next.date}/${next.view}${next.screen === 'lists' && next.list ? `/${next.list}` : ''}`;
}

/**
 * The range a screen needs, its title, and how to step back and forward.
 * @param {State} s
 */
export function frame(s) {
  if (s.screen === 'more') return { from: '', to: '', title: 'More', prev: null, next: null };
  if (s.screen === 'review') return { from: '', to: '', title: 'Review', prev: null, next: null };
  if (s.screen === 'lists') return { from: '', to: '', title: 'Lists', prev: null, next: null };
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

/** A saved screen younger than this is shown without asking the server again. */
export const FRESH_MS = 60 * 1000;

/** Guards against an older request finishing after a newer one. */
let showing = 0;
/** When the current screen was last drawn, to refresh it when the app comes back (RT, 2026-09-25). */
let shownAt = Date.now();
/** Starts drawing a screen; returns its turn. */
export const nextTurn = () => { shownAt = Date.now(); return ++showing; };
/** How long ago the current screen was drawn. */
export const shownAgo = () => Date.now() - shownAt;
/** @param {number} mine */
export const isCurrent = (mine) => mine === showing;

/** @param {number} at */
export const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * The "Updated …" line; tapping it refreshes now, and asks the server to rebuild too rather than
 * use its saved answer (ADR-088).
 * @param {string} text
 */
export const refreshLink = (text) => el('p', { class: 'status muted', onclick: () => app.show(true, true) }, `${text} · tap to refresh`);

/** @param {string} message */
export function showError(message) {
  $('main').replaceChildren(el('p', { class: 'error' }, message));
}

/** @param {number} count */
export function showPending(count) {
  $('pending').hidden = count === 0;
  $('pending').dataset.count = String(count);
  $('pending').textContent = count === 0 ? '' : `${count} to review`;
}

/**
 * Draws a saved copy, or returns null if it cannot be drawn (e.g. saved by an older version), so
 * the screen loads fresh instead of breaking.
 * @param {() => HTMLElement} drawIt
 * @returns {HTMLElement|null}
 */
export function drawSaved(drawIt) {
  try {
    return drawIt();
  } catch (e) {
    return null;
  }
}
