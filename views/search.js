// @ts-check

import { el, niceDate } from '../dom.js';
import { openSheet } from './sheet.js';
import { routineDetail, scheduleText } from './routines.js';
import { reminderActions } from './reminders.js';

/**
 * Search (ADR-094): from today on, for the whole family whatever filter is chosen. The phone holds
 * one small list (upcoming one-off events, running routines, active reminders) and filters it as
 * you type, so results are instant.
 *
 * @typedef {{ event_id: string, title: string, start_date: string, end_date: string|null, start_time: string|null, end_time: string|null,
 *   all_day: boolean, participants: string[], location: string|null, notes: string|null }} SearchEvent
 * @typedef {{ events: SearchEvent[], activities: import('./routines.js').Activity[], schedules: import('./routines.js').Schedule[],
 *   undoable?: Record<string, string>, reminders: import('./parts.js').AppReminder[] }} SearchIndex
 */

/** At most this many events are listed. */
const MAX_EVENTS = 50;

/**
 * Whether every word of the query is in the text, ignoring capitals: short words (up to two
 * letters, e.g. "c", "rt") must be whole words, so "swim c" finds C's swimming, not every "c".
 * @param {string} query
 * @param {Array<string|null|undefined>} fields
 */
export function matches(query, fields) {
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => (w.length <= 2 ? words.has(w) : text.includes(w)));
}

/**
 * The matching events, routines and reminders.
 * @param {SearchIndex} index
 * @param {string} query
 */
export function search(index, query) {
  if (!query.trim()) return { events: [], activities: [], reminders: [] };
  return {
    events: index.events.filter((e) => matches(query, [e.title, e.location, e.notes, ...e.participants])).slice(0, MAX_EVENTS),
    activities: index.activities.filter((a) => matches(query, [a.name, a.location, a.person])),
    reminders: index.reminders.filter((r) => matches(query, [r.title, r.notes, ...r.owner, ...(r.related_people ?? [])])),
  };
}

/** @param {SearchEvent} e */
const whenText = (e) => `${niceDate(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ` – ${niceDate(e.end_date)}` : ''}${e.start_time ? ` ${e.start_time}` : ''}`;

/**
 * The search sheet. Returns update(), to show a newer list when it arrives.
 * @param {import('./forms.js').FormContext} ctx
 * @param {SearchIndex|null} index  the saved list, if any
 * @param {{ today: string, openDay: (date: string) => void }} nav
 */
export function searchSheet(ctx, index, nav) {
  let current = index;
  const box = /** @type {HTMLInputElement} */ (el('input', { type: 'search', class: 'search-input', placeholder: 'A word, a place or a person, e.g. swim c', enterkeyhint: 'search', autocomplete: 'off' }));
  const results = el('div', { class: 'search-results' });
  const open = (/** @type {() => void} */ next) => () => { sheet.close(); next(); };
  const draw = () => {
    const query = box.value;
    if (!current) { results.replaceChildren(el('p', { class: 'muted' }, 'Loading…')); return; }
    if (!query.trim()) { results.replaceChildren(el('p', { class: 'muted small' }, 'Upcoming events, routines and reminders, for the whole family.')); return; }
    const found = search(current, query);
    const idx = /** @type {SearchIndex} */ (current);
    /** @param {string} title @param {Node[]} rows */
    const group = (title, rows) => (rows.length ? [el('h3', { class: 'muted small' }, title), el('ul', { class: 'items' }, rows)] : []);
    const none = found.events.length + found.activities.length + found.reminders.length === 0;
    results.replaceChildren(...(none ? [el('p', { class: 'muted' }, 'Nothing found from today on.')] : [
      ...group('Events', found.events.map((e) => el('li', { class: 'item tappable', onclick: open(() => nav.openDay(e.start_date)) },
        el('span', { class: 'time' }, whenText(e)),
        el('div', { class: 'body' }, el('div', {}, `${e.participants.join('+')} - ${e.title}`), e.location ? el('div', { class: 'details' }, e.location) : '')))),
      ...group('Routines', found.activities.map((a) => el('li', { class: 'item plain tappable', onclick: open(() => routineDetail(ctx, a, idx.schedules, nav.today, idx.undoable?.[a.activity_id])) },
        el('div', { class: 'body' }, el('div', {}, `${a.person} - ${a.name}`),
          el('div', { class: 'details' }, idx.schedules.filter((x) => x.activity_id === a.activity_id).map((x) => scheduleText(a, x, nav.today)).join(' · ')))))),
      ...group('Reminders', found.reminders.map((r) => el('li', { class: 'item tappable', onclick: open(() => reminderActions(ctx, r, nav.today)) },
        el('span', { class: 'time' }, `by ${niceDate(r.window_end)}`),
        el('div', { class: `body${r.window_end < nav.today ? ' overdue-text' : ''}` }, `${r.owner.join('+')} - ${r.title}`)))),
    ]));
  };
  box.addEventListener('input', draw);
  const sheet = openSheet('Search', el('div', { class: 'form' }, box, results));
  draw();
  setTimeout(() => box.focus(), 50);
  return {
    /** @param {SearchIndex} next */
    update(next) { current = next; draw(); },
  };
}

/**
 * The items of the lists matching the query (ADR-094): of one list, or of every active list.
 * Removed items are not in the data; done ones are included.
 * @param {import('./lists.js').ListsData} data
 * @param {string} query
 * @param {string|null} listId  one list, or null for all
 */
export function searchItems(data, query, listId) {
  if (!query.trim()) return [];
  const lists = new Map(data.lists.filter((l) => l.status === 'ACTIVE' || l.list_id === listId).map((l) => [l.list_id, l]));
  return data.items
    .filter((i) => (listId ? i.list_id === listId : lists.has(i.list_id)) && matches(query, [i.text, i.notes, ...i.owner]))
    // Open ones first.
    .sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'))
    .map((i) => ({ item: i, list: lists.get(i.list_id) }));
}

/**
 * Search on the Lists tab: the items of every list, or inside a list only its own (RT, 2026-09-25).
 * @param {import('./lists.js').ListsData} data
 * @param {string|null} listId
 * @param {(listId: string) => void} openList
 */
export function listSearchSheet(data, listId, openList) {
  const list = listId ? data.lists.find((l) => l.list_id === listId) : undefined;
  const box = /** @type {HTMLInputElement} */ (el('input', { type: 'search', class: 'search-input', placeholder: list ? `Search ${list.title}` : 'Search the items in every list', enterkeyhint: 'search', autocomplete: 'off' }));
  const results = el('div', { class: 'search-results' });
  const draw = () => {
    if (!box.value.trim()) { results.replaceChildren(el('p', { class: 'muted small' }, list ? `Items on ${list.title}.` : 'Items on all your lists.')); return; }
    const found = searchItems(data, box.value, listId);
    results.replaceChildren(found.length === 0 ? el('p', { class: 'muted' }, 'No items found.')
      : el('ul', { class: 'items' }, found.map(({ item, list: l }) => el('li', { class: 'item plain tappable', onclick: () => { sheet.close(); openList(item.list_id); } },
        el('div', { class: `body${item.status === 'DONE' ? ' muted' : ''}` },
          el('div', {}, item.text),
          el('div', { class: 'details' }, [listId ? '' : l?.title ?? '', item.status === 'DONE' ? 'done' : '', item.owner.join('+'), item.notes ?? ''].filter(Boolean).join(' · ')))))));
  };
  box.addEventListener('input', draw);
  const sheet = openSheet(list ? `Search ${list.title}` : 'Search lists', el('div', { class: 'form' }, box, results));
  draw();
  setTimeout(() => box.focus(), 50);
}
