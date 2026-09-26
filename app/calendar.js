// @ts-check

import { call, lastTiming } from '../api.js';
import * as cache from '../cache.js';
import { el, addDays, addMonths, niceDate, monthTitle } from '../dom.js';
import { printSheet } from '../views/print.js';
import { daySection, remindersOn, todoSection } from '../views/parts.js';
import { monthView, monthRange, fetchRangeFor } from '../views/month.js';
import { eventDetails } from '../views/forms.js';
import { monthReminders } from '../views/reminders.js';
import { toast } from '../views/sheet.js';
import { busy } from '../views/fields.js';
import { formContext } from './context.js';
import { acceptBackgroundLists } from './lists.js';
import { $, app, go, today, FRESH_MS, isCurrent, clock, refreshLink, drawSaved, showError, showPending } from './state.js';

/**
 * The calendar screens: Today, Month (default), Week and Day, each for one filter (ADR-080). The
 * phone's saved copy draws at once and the server's answer replaces it; the months either side,
 * Lists and More then load in the background (ADR-088).
 */

/** The server answered in a newer shape than this copy of the app understands. */
class AppOutOfDate extends Error {}

/**
 * Draws one screen for the chosen filter from the answer holding every filter.
 * @param {import('./state.js').State} s
 * @param {import('../views/parts.js').AllDays} all
 */
function draw(s, all) {
  if (!all.views) throw new AppOutOfDate();
  const chosen = all.views[s.view] ?? all.views.FAMILY;
  /** @type {import('../views/parts.js').DaysData} */
  const data = { from: all.from, to: all.to, days: chosen.days, reminders: chosen.reminders, pending: all.pending, todos: chosen.todos ?? [] };
  const t = /** @type {import('../views/parts.js').Theme} */ (app.theme);
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const openDay = (/** @type {string} */ date) => go({ screen: 'day', date });
  const ctx = formContext();
  /** @param {string} date */
  const onItem = (date) => (/** @type {import('../views/parts.js').AppItem} */ item) => eventDetails(ctx, t, item, date);
  const onRestore = async (/** @type {import('../views/parts.js').CancelledItem} */ c, /** @type {HTMLButtonElement} */ button) => {
    const r = await busy(button, () => call('events.restore', { event_id: c.event_id }));
    if (r.ok) ctx.saved(`Restored "${c.title}".`, r);
    else toast(r.errors.map((e) => e.message).join('; '));
  };
  const todoActions = {
    open: (/** @type {string} */ listId) => go({ screen: 'lists', list: listId }),
    tick: async (/** @type {import('../views/parts.js').Todo} */ todo, /** @type {HTMLButtonElement} */ button) => {
      const r = await busy(button, () => call('listItems.setStatus', { item_id: todo.item_id, status: 'DONE' }));
      if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
      // Only the to-dos changed: keep the saved calendar on screen while it refreshes.
      cache.staleCalendar();
      cache.stale('lists');
      toast(`Ticked "${todo.text}".`);
      app.show(true);
    },
  };
  // From the 25th until printed, a reminder at the top of Month and Today (ADR-093).
  const due = all.print_due && (s.screen === 'month' || s.screen === 'today') ? printReminder(all.print_due.month) : '';
  if (s.screen === 'month') {
    const monthStart = `${s.date.slice(0, 7)}-01`;
    // The month's reminders under the grid, as on the printed page (ADR-089).
    return el('div', {}, due, monthView(t, data, monthStart, today(), openDay, s.view), monthReminders(ctx, data.reminders, monthStart, today()));
  }
  if (s.screen === 'week') {
    return el('div', {}, data.days.map((d) => [el('div', { 'data-date': d.date }, daySection(t, niceDate(d.date), d, { onTitle: () => openDay(d.date), onItem: onItem(d.date) })),
      todoSection(data.todos.filter((x) => x.due_date === d.date), todoActions)]));
  }
  if (s.screen === 'day') {
    return el('div', {},
      daySection(t, 'Events', byDate.get(s.date), { onItem: onItem(s.date), onRestore: s.view === 'FAMILY' ? onRestore : undefined }),
      todoSection(data.todos.filter((x) => x.due_date === s.date), todoActions),
      remindersOn(data.reminders, s.date),
      s.view === 'FAMILY' ? '' : el('p', { class: 'muted small' }, 'Cancelled events can be restored from the Family view.'));
  }
  const tomorrow = addDays(data.from, 1);
  return el('div', {},
    due,
    todoSection(data.todos.filter((x) => x.due_date < data.from), todoActions, 'Overdue'),
    daySection(t, `Today · ${niceDate(data.from)}`, byDate.get(data.from), { onTitle: () => openDay(data.from), onItem: onItem(data.from) }),
    todoSection(data.todos.filter((x) => x.due_date === data.from), todoActions),
    daySection(t, `Tomorrow · ${niceDate(tomorrow)}`, byDate.get(tomorrow), { onTitle: () => openDay(tomorrow), onItem: onItem(tomorrow) }),
    remindersOn(data.reminders, data.from));
}

/**
 * "October's calendars are ready to print", with a button that opens printing for that month.
 * @param {string} month  YYYY-MM
 */
function printReminder(month) {
  const name = monthTitle(`${month}-01`).split(' ')[0];
  return el('div', { class: 'msg warning print-due' },
    el('span', {}, `🖨 ${name}'s calendars are ready to print.`),
    el('button', { class: 'link', type: 'button', onclick: () => printSheet(formContext(), today(), month) }, `Print ${name}`));
}

/**
 * Reloads once to pick up the new app version; a second mismatch in the same session is shown
 * as an error instead of looping.
 */
function reloadForUpdate() {
  let tried = false;
  try { tried = sessionStorage.getItem('fc.reloaded') === '1'; sessionStorage.setItem('fc.reloaded', '1'); } catch (e) { /* ignore */ }
  if (tried) return false;
  $('main').replaceChildren(el('p', { class: 'muted' }, 'Updating the app…'));
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).finally(() => location.reload());
  return true;
}

/**
 * Days with nothing on yet, for the empty month shown while loading.
 * @param {string} from
 * @param {string} to
 */
function emptyDays(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, items: [], school: [] });
  return days;
}

/** What is being fetched in the background, so each is asked for once at a time. */
const prefetching = new Set();

/**
 * Loads the months either side in the background, one after the other, so ‹ and › draw at once
 * (RT, 2026-09-25). Months this phone already holds are left to refresh when shown.
 * @param {string} date  the screen's date
 */
async function prefetchAround(date) {
  const month = `${date.slice(0, 7)}-01`;
  for (const next of [addMonths(month, 1), addMonths(month, -1)]) {
    const range = monthRange(next);
    const key = `days:${range.from}:${range.to}`;
    if (prefetching.has(key) || cache.covering(range.from, range.to)) continue;
    prefetching.add(key);
    try {
      const r = await call('app.days', range);
      if (r.ok) cache.write(key, r.data);
    } catch (e) {
      // Only a head start: the month loads normally when shown.
    } finally {
      prefetching.delete(key);
    }
  }
}

/** Lists and More are fetched in the background when their copy is older than this. */
const BACKGROUND_MS = 5 * 60 * 1000;

/**
 * After the calendar, loads Lists and More in the background when this phone's copy is missing or
 * more than five minutes old, so switching tabs draws at once (RT, 2026-09-25).
 */
async function prefetchScreens() {
  const old = (/** @type {string} */ key) => { const c = cache.read(key); return !c || Date.now() - c.at > BACKGROUND_MS; };
  try {
    if (old('lists') && !prefetching.has('lists')) {
      prefetching.add('lists');
      const r = await call('lists.all');
      if (r.ok) acceptBackgroundLists(r.data);
    }
    if (old('more') && !prefetching.has('more')) {
      prefetching.add('more');
      const r = await call('app.more', {});
      if (r.ok) cache.write('more', r.data);
    }
  } catch (e) {
    // Only a head start: each screen loads normally when opened.
  } finally {
    prefetching.delete('lists');
    prefetching.delete('more');
  }
}

/**
 * Draws a calendar screen: the saved copy first, then the server's answer.
 * @param {number} mine
 * @param {import('./state.js').State} s
 * @param {{ from: string, to: string }} f  the screen's own dates
 * @param {boolean} force  ask the server even if the saved copy is fresh
 * @param {boolean} fresh  and have the server rebuild its answer (ADR-088)
 */
export async function showCalendar(mine, s, f, force, fresh) {
  // Every screen fetches the whole month grid around it, so Day, Week, Today and Month share one
  // answer and switching between them never waits (RT, 2026-09-24).
  const fetchRange = fetchRangeFor(s.screen, s.date, f.from);
  const key = `days:${fetchRange.from}:${fetchRange.to}`;
  const covering = cache.covering(f.from, f.to);
  const status = el('p', { class: 'status muted' }, 'Updating…');
  const savedView = covering ? drawSaved(() => draw(s, covering.data)) : null;
  const saved = savedView ? covering : null;
  if (saved && savedView) {
    showPending(saved.data.pending);
    if (!force && Date.now() - saved.at < FRESH_MS) {
      $('main').replaceChildren(savedView, refreshLink(`Updated ${clock(saved.at)}`));
      // Still check the neighbours and the other tabs: anything already held is skipped.
      prefetchAround(s.date).then(prefetchScreens);
      return;
    }
    $('main').replaceChildren(savedView, status);
  } else {
    // An empty month while it loads, rather than a blank page (RT, 2026-09-25).
    const skeleton = s.screen === 'month' ? drawSaved(() => monthView(/** @type {any} */ (app.theme), /** @type {any} */ ({ days: emptyDays(f.from, f.to) }), `${s.date.slice(0, 7)}-01`, today(), () => {}, s.view)) : null;
    if (skeleton) skeleton.classList.add('loading');
    $('main').replaceChildren(...(skeleton ? [skeleton, el('p', { class: 'status muted' }, 'Loading…')] : [el('p', { class: 'muted' }, 'Loading…')]));
  }
  try {
    const r = await call('app.days', fresh ? { ...fetchRange, fresh: true } : fetchRange);
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write(key, r.data);
    showPending(r.data.pending);
    try { sessionStorage.removeItem('fc.reloaded'); } catch (e) { /* ignore */ }
    const shown = cache.covering(f.from, f.to);
    // Where the server's time went (RT, 2026-09-26: a slow first open): set-up (session, workbook),
    // and whether the answer came from its memory or was rebuilt.
    const parts = [lastTiming.setup_ms === null ? '' : `set-up ${(lastTiming.setup_ms / 1000).toFixed(1)} s`, lastTiming.served ?? ''].filter(Boolean).join(', ');
    const server = lastTiming.server_ms === null ? '' : ` · server ${(lastTiming.server_ms / 1000).toFixed(1)} s${parts ? ` (${parts})` : ''}`;
    $('main').replaceChildren(draw(s, shown ? shown.data : r.data),
      refreshLink(`Updated ${clock(Date.now())} · ${(lastTiming.total_ms / 1000).toFixed(1)} s${server}`));
    prefetchAround(s.date).then(prefetchScreens);
  } catch (e) {
    if (!isCurrent(mine)) return;
    if (e instanceof AppOutOfDate && reloadForUpdate()) return;
    const message = `Could not refresh: ${e instanceof Error ? e.message : String(e)}`;
    if (saved) status.textContent = `${message}. Showing ${clock(saved.at)}.`;
    else showError(message);
  }
}
