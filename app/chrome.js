// @ts-check

import { user, signOutOfGoogle } from '../auth.js';
import { signOut } from '../api.js';
import * as cache from '../cache.js';
import { el, addDays } from '../dom.js';
import { eventSheet, routineSheet, reminderSheet } from '../views/forms.js';
import { captureBox } from '../views/capture.js';
import { openSheet, toast } from '../views/sheet.js';
import { VERSION } from '../version.js';
import { formContext } from './context.js';
import { $, app, TABS, go, readState, frame, today } from './state.js';

/**
 * Everything around the screens: the header (account, filters, review badge, title), the bottom
 * bar, the + menu, swiping, and the one-off "App updated" message.
 */

/** A swipe must travel this far sideways, and mostly sideways, to turn the page. */
const SWIPE_PX = 60;

/**
 * Swipe left or right on Month, Week and Day for the next or previous one, as › and ‹ (ADR-090).
 * On Today (today and tomorrow), a swipe opens the Day after tomorrow, or yesterday.
 * Vertical scrolling is left alone: a swipe must be mostly sideways and quick.
 */
function enableSwipe() {
  /** @type {{ x: number, y: number, at: number } | null} */
  let start = null;
  // The whole screen, not just the content: a quiet Day ends halfway down (RT, 2026-09-25).
  // Not while a sheet (a form, an event's details) is open.
  document.addEventListener('touchstart', (/** @type {TouchEvent} */ e) => {
    start = e.touches.length === 1 && !document.querySelector('dialog[open]')
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', (/** @type {TouchEvent} */ e) => {
    const from = start;
    start = null;
    const s = readState();
    if (!from || !['month', 'week', 'day', 'today'].includes(s.screen)) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - from.x;
    const dy = end.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - from.at > 800) return;
    // Today shows today and tomorrow: swiping carries on through the days on the Day screen (RT, 2026-09-25).
    if (s.screen === 'today') {
      go({ screen: 'day', date: addDays(today(), dx < 0 ? 2 : -1) });
      return;
    }
    const f = frame(s);
    const to = dx < 0 ? f.next : f.prev;
    if (to) go({ date: to });
  }, { passive: true });
}

/** The version this phone last ran, to say once when an update has arrived. */
const SEEN_VERSION_KEY = 'fc.version';

/** Says "App updated to …" the first time a new version runs; a first install says nothing. */
export function announceUpdate() {
  try {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen !== VERSION) localStorage.setItem(SEEN_VERSION_KEY, VERSION);
    if (seen !== null && seen !== VERSION) toast(`App updated to ${VERSION}.`);
  } catch (e) { /* storage unavailable: nothing to compare with */ }
}

/** Sets up the header, bottom bar, + menu and swiping once signed in; screens follow the address. */
export function showSignedIn() {
  $('signin').hidden = true;
  $('chrome').hidden = false;
  $('account').replaceChildren(
    el('span', { class: 'muted' }, user() ?? ''),
    el('button', { class: 'link', onclick: async () => { await signOut(); signOutOfGoogle(); cache.clear(); location.hash = ''; location.reload(); } }, 'Sign out'));
  $('filters').replaceChildren(...app.views.map((v) => el('button', { 'data-view': v, onclick: () => go({ view: v }) }, v === 'FAMILY' ? 'Family' : v)));
  $('pending').onclick = () => go({ screen: 'review' });
  $('tabs').replaceChildren(...TABS.map((screen) => el('button', {
    'data-screen': screen,
    onclick: () => go({ screen, date: screen === 'today' ? today() : readState().date }),
  }, screen[0].toUpperCase() + screen.slice(1))));
  enableSwipe();
  // Tapping the title shows the app's version (RT, 2026-09-25). Guarded: an old page without the
  // title's id must not stop the rest from being set up.
  const title = document.getElementById('app-title');
  if (title) title.onclick = () => toast(`Family Cal · version ${VERSION}`);
  $('add').hidden = false;
  $('add').onclick = () => {
    const ctx = formContext();
    const s = readState();
    const date = s.screen === 'day' ? s.date : today();
    const menu = openSheet('Add', el('div', { class: 'add-menu' },
      captureBox(ctx, () => menu.close(), user()),
      el('div', { class: 'or muted small' }, 'or add by form'),
      el('button', { type: 'button', onclick: () => { menu.close(); eventSheet(ctx, { date }); } }, 'Event'),
      el('button', { type: 'button', onclick: () => { menu.close(); routineSheet(ctx); } }, 'Weekly routine'),
      el('button', { type: 'button', onclick: () => { menu.close(); reminderSheet(ctx); } }, 'Reminder')));
  };
  window.addEventListener('hashchange', () => app.show());
}
