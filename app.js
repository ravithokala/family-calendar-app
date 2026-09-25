// @ts-check

import { CONFIG } from './config.js';
import { init, session, user, signOutOfGoogle } from './auth.js';
import { call, lastTiming, signOut, sessionKey } from './api.js';
import { el, isoDate, addDays, addMonths, mondayOf, niceDate, longDate, monthTitle } from './dom.js';
import * as cache from './cache.js';
import { daySection, remindersOn, todoSection } from './views/parts.js';
import { monthView, monthRange, fetchRangeFor } from './views/month.js';
import { eventSheet, eventDetails, routineSheet, reminderSheet } from './views/forms.js';
import { moreView } from './views/more.js';
import { reviewView } from './views/review.js';
import { printSheet } from './views/print.js';
import { captureBox } from './views/capture.js';
import { listsOverview, listDetail, isUnsaved } from './views/lists.js';
import { openSheet, toast } from './views/sheet.js';
import { busy } from './views/fields.js';
import { VERSION } from './version.js';

/**
 * The family app (ADR-078, ADR-080). It holds no calendar rules and no family data: everything
 * shown comes from the server after sign-in. Screens: Today, Month (default), Week, Day, each for
 * one filter (Family, C, R, RT, G). The screen lives in the address, so Back works.
 *
 * @typedef {'today' | 'month' | 'week' | 'day' | 'lists' | 'more' | 'review'} Screen
 * @typedef {{ screen: Screen, date: string, view: string, list: string|null }} State
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const SCREENS = /** @type {Screen[]} */ (['today', 'month', 'week', 'day', 'lists', 'more', 'review']);
/**
 * The bottom bar (RT, 2026-09-24: Lists replaces Day). Day is reached by tapping a day in Month or
 * Week; Review from the badge and More.
 */
const TABS = /** @type {Screen[]} */ (['today', 'month', 'week', 'lists', 'more']);
const VIEW_KEY = 'fc.view';
/** @type {import('./views/parts.js').Theme|null} */
let theme = null;
/** @type {string[]} */
let views = ['FAMILY'];
/** @type {any} */
let meta = null;

const today = () => isoDate(new Date());

/** @returns {State} */
function readState() {
  const [screen, date, view, list] = location.hash.replace(/^#\/?/, '').split('/');
  let saved = 'FAMILY';
  try { saved = localStorage.getItem(VIEW_KEY) ?? 'FAMILY'; } catch (e) { /* ignore */ }
  return {
    screen: SCREENS.includes(/** @type {Screen} */ (screen)) ? /** @type {Screen} */ (screen) : 'month',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : today(),
    view: views.includes(view) ? view : views.includes(saved) ? saved : 'FAMILY',
    list: /^[\w-]+$/.test(list ?? '') ? list : null,
  };
}

/** @param {Partial<State>} change */
function go(change) {
  const next = { ...readState(), ...change };
  try { localStorage.setItem(VIEW_KEY, next.view); } catch (e) { /* ignore */ }
  location.hash = `#/${next.screen}/${next.date}/${next.view}${next.screen === 'lists' && next.list ? `/${next.list}` : ''}`;
}

 /**
 * What the forms need: the vocabularies, the API, and what to do after a save: mark saved
 * screens out of date, redraw from the server, and say what happened.
 * @returns {import('./views/forms.js').FormContext}
 */
const formContext = () => ({
  meta,
  call,
  openList: (/** @type {string} */ listId) => go({ screen: 'lists', list: listId }),
  saved: (message, r, undo) => {
    // Saved months stay on screen while they refresh, instead of a first-time "Loading…" (RT, 2026-09-25).
    cache.staleCalendar();
    ['more', 'review', 'lists'].forEach(cache.forget);
    listsData = null;
    toast(message, r.warnings, undo && (() => undoSaved(undo)));
    show(true);
  },
});

/**
 * Runs an Undo from the message, then refreshes like any save (ADR-087).
 * @param {() => Promise<import('./api.js').ApiResponse>} undo
 */
async function undoSaved(undo) {
  toast('Undoing…');
  try {
    const r = await undo();
    if (!r.ok) { toast(`Could not undo: ${r.errors.map((e) => e.message).join('; ')}`); return; }
    formContext().saved('Undone.', r);
  } catch (e) {
    toast(`Could not undo: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** @param {number} at */
const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * The "Updated …" line; tapping it refreshes now.
 * @param {string} text
 */
// Tapping asks the server to rebuild too, not to use its saved answer (ADR-088).
const refreshLink = (text) => el('p', { class: 'status muted', onclick: () => show(true, true) }, `${text} · tap to refresh`);

/** The version this phone last ran, to say once when an update has arrived. */
const SEEN_VERSION_KEY = 'fc.version';

/** Says "App updated to …" the first time a new version runs; a first install says nothing. */
function announceUpdate() {
  try {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen !== VERSION) localStorage.setItem(SEEN_VERSION_KEY, VERSION);
    if (seen !== null && seen !== VERSION) toast(`App updated to ${VERSION}.`);
  } catch (e) { /* storage unavailable: nothing to compare with */ }
}

/** @param {string} message */
function showError(message) {
  $('main').replaceChildren(el('p', { class: 'error' }, message));
}

/** @param {number} count */
function showPending(count) {
  $('pending').hidden = count === 0;
  $('pending').dataset.count = String(count);
  $('pending').textContent = count === 0 ? '' : `${count} to review`;
}

/**
 * The range a screen needs, its title, and how to step back and forward.
 * @param {State} s
 */
function frame(s) {
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

/**
 * Draws one screen for the chosen filter from the answer holding every filter.
 * @param {State} s
 * @param {import('./views/parts.js').AllDays} all
 */
function draw(s, all) {
  if (!all.views) throw new AppOutOfDate();
  const chosen = all.views[s.view] ?? all.views.FAMILY;
  /** @type {import('./views/parts.js').DaysData} */
  const data = { from: all.from, to: all.to, days: chosen.days, reminders: chosen.reminders, pending: all.pending, todos: chosen.todos ?? [] };
  const t = /** @type {import('./views/parts.js').Theme} */ (theme);
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const openDay = (/** @type {string} */ date) => go({ screen: 'day', date });
  const ctx = formContext();
  /** @param {string} date */
  const onItem = (date) => (/** @type {import('./views/parts.js').AppItem} */ item) => eventDetails(ctx, t, item, date);
  const onRestore = async (/** @type {import('./views/parts.js').CancelledItem} */ c, /** @type {HTMLButtonElement} */ button) => {
    const r = await busy(button, () => call('events.restore', { event_id: c.event_id }));
    if (r.ok) ctx.saved(`Restored "${c.title}".`, r);
    else toast(r.errors.map((e) => e.message).join('; '));
  };
  const todoActions = {
    open: (/** @type {string} */ listId) => go({ screen: 'lists', list: listId }),
    tick: async (/** @type {import('./views/parts.js').Todo} */ todo, /** @type {HTMLButtonElement} */ button) => {
      const r = await busy(button, () => call('listItems.setStatus', { item_id: todo.item_id, status: 'DONE' }));
      if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
      // Only the to-dos changed: keep the saved calendar on screen while it refreshes.
      cache.staleCalendar();
      cache.forget('lists');
      listsData = null;
      toast(`Ticked "${todo.text}".`);
      show(true);
    },
  };
  if (s.screen === 'month') return monthView(t, data, `${s.date.slice(0, 7)}-01`, today(), openDay, s.view);
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
    todoSection(data.todos.filter((x) => x.due_date < data.from), todoActions, 'Overdue'),
    daySection(t, `Today · ${niceDate(data.from)}`, byDate.get(data.from), { onTitle: () => openDay(data.from), onItem: onItem(data.from) }),
    todoSection(data.todos.filter((x) => x.due_date === data.from), todoActions),
    daySection(t, `Tomorrow · ${niceDate(tomorrow)}`, byDate.get(tomorrow), { onTitle: () => openDay(tomorrow), onItem: onItem(tomorrow) }),
    remindersOn(data.reminders, data.from));
}

/** The server answered in a newer shape than this copy of the app understands. */
class AppOutOfDate extends Error {}

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
 * Draws a saved copy, or returns null if it cannot be drawn (e.g. saved by an older version), so
 * the screen loads fresh instead of breaking.
 * @param {() => HTMLElement} drawIt
 * @returns {HTMLElement|null}
 */
function drawSaved(drawIt) {
  try {
    return drawIt();
  } catch (e) {
    return null;
  }
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

/** Months being fetched in the background, so each is asked for once at a time. */
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

/** Guards against an older request finishing after a newer one. */
let showing = 0;
/** A saved screen younger than this is shown without asking the server again. */
const FRESH_MS = 60 * 1000;

/**
 * @param {boolean} [force]  ask the server even if the saved screen is fresh
 * @param {boolean} [fresh]  and have the server rebuild its answer (ADR-088)
 */
async function show(force = false, fresh = false) {
  const s = readState();
  const f = frame(s);
  const mine = ++showing;
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
  if (s.screen === 'more' || s.screen === 'review' || s.screen === 'lists') {
    $('print-button').hidden = true;
    await (s.screen === 'more' ? showMore(mine) : s.screen === 'lists' ? showLists(mine, s) : showReview(mine));
    return;
  }

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
      return;
    }
    $('main').replaceChildren(savedView, status);
  } else {
    // An empty month while it loads, rather than a blank page (RT, 2026-09-25).
    const skeleton = s.screen === 'month' ? drawSaved(() => monthView(/** @type {any} */ (theme), /** @type {any} */ ({ days: emptyDays(f.from, f.to) }), `${s.date.slice(0, 7)}-01`, today(), () => {}, s.view)) : null;
    if (skeleton) skeleton.classList.add('loading');
    $('main').replaceChildren(...(skeleton ? [skeleton, el('p', { class: 'status muted' }, 'Loading…')] : [el('p', { class: 'muted' }, 'Loading…')]));
  }
  try {
    const r = await call('app.days', fresh ? { ...fetchRange, fresh: true } : fetchRange);
    if (mine !== showing) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write(key, r.data);
    showPending(r.data.pending);
    try { sessionStorage.removeItem('fc.reloaded'); } catch (e) { /* ignore */ }
    const shown = cache.covering(f.from, f.to);
    const server = lastTiming.server_ms === null ? '' : ` · server ${(lastTiming.server_ms / 1000).toFixed(1)} s`;
    $('main').replaceChildren(draw(s, shown ? shown.data : r.data),
      refreshLink(`Updated ${clock(Date.now())} · ${(lastTiming.total_ms / 1000).toFixed(1)} s${server}`));
    prefetchAround(s.date);
  } catch (e) {
    if (mine !== showing) return;
    if (e instanceof AppOutOfDate && reloadForUpdate()) return;
    const message = `Could not refresh: ${e instanceof Error ? e.message : String(e)}`;
    if (saved) status.textContent = `${message}. Showing ${clock(saved.at)}.`;
    else showError(message);
  }
}

/**
 * The More screen, from its own two lists (saved copy first, as with the calendar).
 * @param {number} mine
 */
async function showMore(mine) {
  const saved = cache.read('more');
  const draw = (/** @type {any} */ data) => moreView(formContext(), data, { openReview: () => go({ screen: 'review' }), today: today() });
  const savedView = saved ? drawSaved(() => draw(saved.data)) : null;
  if (savedView) $('main').replaceChildren(savedView, el('p', { class: 'status muted' }, 'Updating…'));
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    const [reminders, routines, sources, count, schools, removed] = await Promise.all([
      call('reminders.list'), call('routines.list'), call('sources.list'), call('review.count'), call('schools.list'), call('app.removed')]);
    if (mine !== showing) return;
    if (!reminders.ok || !routines.ok || !sources.ok || !schools.ok || !removed.ok) {
      throw new Error([...reminders.errors, ...routines.errors, ...sources.errors, ...schools.errors, ...removed.errors].map((e) => e.message).join('; '));
    }
    const pending = count.ok ? count.data.count : Number($('pending').dataset.count ?? 0);
    showPending(pending);
    const data = { reminders: reminders.data.reminders, activities: routines.data.activities, schedules: routines.data.schedules,
      undoable: routines.data.undoable, sources: sources.data.sources, pending, periods: schools.data.periods, removed: removed.data };
    cache.write('more', data);
    $('main').replaceChildren(draw(data), refreshLink(`Updated ${clock(Date.now())}`));
  } catch (e) {
    if (mine !== showing) return;
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** @type {import('./views/lists.js').ListsData | null} */
let listsData = null;

/**
 * Lists: the overview, or one list (saved copy first). Ticks and new items update the saved copy
 * directly, so the screen stays instant; everything else reloads from the server.
 * @param {number} mine
 * @param {State} s
 */
async function showLists(mine, s) {
  const saved = listsData ? { at: Date.now(), data: listsData } : cache.read('lists');
  listsData = saved?.data ?? { lists: [], items: [], events: [] };
  /** @type {import('./views/lists.js').ListsScreen} */
  const screen = {
    ctx: formContext(),
    // One copy shared by every visit to Lists, so saves still running from an earlier visit (a new
    // list, new items) land in what is on screen now.
    get data() { return /** @type {import('./views/lists.js').ListsData} */ (listsData); },
    set data(v) { listsData = v; },
    open: (listId) => go({ screen: 'lists', list: listId }),
    redraw: () => { if (readState().screen === 'lists') $('main').replaceChildren(drawIt()); },
    // A list change can change what the calendar shows under "To do": saved months stay, but refresh.
    persist: () => { cache.write('lists', screen.data); cache.staleCalendar(); },
    reload: () => { if (mine === showing) show(true); },
    // A new list got its real id: point the address at it without drawing again.
    renamed: (from, to) => { if (location.hash.endsWith(`/${from}`)) history.replaceState(null, '', location.hash.replace(`/${from}`, `/${to}`)); },
  };
  // The address, not `s`: a new list's id changes once it is saved.
  const drawIt = () => { const list = readState().list; return list ? listDetail(screen, list, today()) : listsOverview(screen); };
  const savedView = saved ? drawSaved(drawIt) : null;
  if (savedView) $('main').replaceChildren(savedView);
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    const r = await call('lists.all');
    if (mine !== showing) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    // Lists and items still being saved are kept: the server does not know them yet.
    screen.data = { ...r.data,
      lists: [...r.data.lists, ...screen.data.lists.filter((l) => isUnsaved(l.list_id))],
      items: [...r.data.items, ...screen.data.items.filter((i) => isUnsaved(i.item_id))] };
    cache.write('lists', r.data);
    // Keep what is being typed: only redraw if the quick-add box is empty.
    const typing = /** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.value;
    if (!typing) $('main').replaceChildren(drawIt());
  } catch (e) {
    if (mine !== showing) return;
    if (!savedView) showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    else toast(`Could not refresh: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The review inbox (saved copy first).
 * @param {number} mine
 */
async function showReview(mine) {
  const saved = cache.read('review');
  const draw = (/** @type {any} */ inbox) => reviewView(formContext(), inbox);
  const savedView = saved ? drawSaved(() => draw(saved.data)) : null;
  if (savedView) $('main').replaceChildren(savedView, el('p', { class: 'status muted' }, 'Updating…'));
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    const r = await call('review.inbox');
    if (mine !== showing) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write('review', r.data);
    showPending(r.data.count);
    $('main').replaceChildren(draw(r.data), refreshLink(`Updated ${clock(Date.now())}`));
  } catch (e) {
    if (mine !== showing) return;
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The theme and filters, cached so the calendar can draw before the server answers. */
async function loadMeta() {
  const saved = cache.read('meta');
  const apply = (/** @type {any} */ m) => { theme = m.theme; views = m.views; meta = m; };
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
  $('pending').onclick = () => go({ screen: 'review' });
  $('tabs').replaceChildren(...TABS.map((screen) => el('button', {
    'data-screen': screen,
    onclick: () => go({ screen, date: screen === 'today' ? today() : readState().date }),
  }, screen[0].toUpperCase() + screen.slice(1))));
  // Tapping the title shows the app's version (RT, 2026-09-25). Last, and guarded: an old page
  // without the title's id must not stop the buttons above from working.
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
  announceUpdate();
  await show();
}

start();
