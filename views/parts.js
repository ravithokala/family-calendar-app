// @ts-check

import { el } from '../dom.js';

/**
 * Pieces shared by the calendar screens. Colours, drawings and labels all come from the server
 * (the printed calendar's theme, ADR-080), so the app and the fridge agree.
 *
 * @typedef {{ event_id: string, title: string, label: string, tone: string, icon: string, event_type: string,
 *   all_day: boolean, start_time: string|null, end_time: string|null,
 *   span: { start_date: string, end_date: string, first: boolean, last: boolean } | null,
 *   participants: string[], related_people: string[], location: string|null, notes: string|null, routine: boolean,
 *   edit: { start_date: string|null, end_date: string|null, calendars: string[], icon: string|null, all_day: boolean|null } | null,
 *   lists?: Array<{ list_id: string, title: string, done: number, total: number }> }} AppItem
 * @typedef {{ event_id: string, title: string, participants: string[], start_time: string|null, end_time: string|null, routine: boolean }} CancelledItem
 * @typedef {{ person: string, period_type: string, kind: 'BREAK' | 'NO_SCHOOL' }} SchoolDay
 * @typedef {{ date: string, weekday: string, items: AppItem[], school: SchoolDay[], cancelled?: CancelledItem[] }} AppDay
 * @typedef {{ reminder_id: string, title: string, owner: string[], window_start: string, window_end: string,
 *   related_people?: string[], notes?: string|null, status?: string }} AppReminder
 * @typedef {{ item_id: string, list_id: string, list_title: string, text: string, owner: string[], due_date: string, notes: string|null }} Todo
 * @typedef {{ from: string, to: string, days: AppDay[], reminders: AppReminder[], pending: number, todos: Todo[] }} DaysData  one filter's days
 * @typedef {{ from: string, to: string, views: Record<string, { days: AppDay[], reminders: AppReminder[], todos?: Todo[] }>, pending: number }} AllDays
 * @typedef {{ background: string, text: string, bar?: string }} Tone
 * @typedef {{ tones: Record<string, Tone>, icons: Record<string, string>, shades: Record<string, string>,
 *   periodLabels: Record<string, string> }} Theme
 */

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A drawn icon, from the printed calendar's line drawings (server data, not user text).
 * @param {Theme} theme
 * @param {string} name
 */
export function icon(theme, name) {
  const paths = theme.icons[name];
  if (!paths) return null;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths;
  return svg;
}

/** @param {Theme} theme @param {string} tone */
export function toneStyle(theme, tone) {
  const t = theme.tones[tone] ?? { background: 'var(--soft)', text: 'var(--text)' };
  return { background: t.background, color: t.text, ...(t.bar ? { borderLeft: `4px solid ${t.bar}` } : {}) };
}

/** @param {AppItem} i */
export function timeText(i) {
  if (i.span && !i.span.first) return 'continues';
  // A routine with no time (e.g. school PE) is simply untimed, not "all day".
  if (!i.start_time) return i.all_day && !i.routine ? 'All day' : '';
  return i.end_time ? `${i.start_time}–${i.end_time}` : i.start_time;
}

/**
 * Background for a day with school breaks: the printed shading (ADR-055, ADR-067).
 * @param {Theme} theme
 * @param {SchoolDay[]} school
 */
export function shade(theme, school) {
  if (school.some((s) => s.kind === 'NO_SCHOOL')) return theme.shades.NO_SCHOOL;
  if (school.some((s) => s.kind === 'BREAK')) return theme.shades.BREAK;
  return '';
}

/**
 * A month cell's school label, as on the printed calendar (PrintModel.schoolNote): "HALF TERM",
 * or "R NO SCHOOL" on the family views when only one child is off. C's and R's views already
 * hold only that child's school days.
 * @param {Theme} theme
 * @param {SchoolDay[]} school
 * @param {boolean} ownChild  the view is one child's
 */
export function schoolLabel(theme, school, ownChild) {
  /** @type {Map<string, string[]>} */
  const byLabel = new Map();
  for (const s of school) {
    const label = s.kind === 'NO_SCHOOL' ? theme.periodLabels.NO_SCHOOL : theme.periodLabels[s.period_type] ?? s.period_type;
    const people = byLabel.get(label) ?? [];
    if (!people.includes(s.person)) people.push(s.person);
    byLabel.set(label, people);
  }
  const children = new Set(school.map((s) => s.person));
  return [...byLabel].map(([label, people]) => (ownChild || people.length >= Math.max(2, children.size) ? label : `${people.join('+')} ${label}`)).join(' · ');
}

/**
 * "HALF TERM (R)"-style notes for a day.
 * @param {Theme} theme
 * @param {SchoolDay[]} school
 */
export function schoolNote(theme, school) {
  const byLabel = new Map();
  for (const s of school) {
    const label = s.kind === 'NO_SCHOOL' ? theme.periodLabels.NO_SCHOOL : theme.periodLabels[s.period_type] ?? s.period_type;
    byLabel.set(label, [...(byLabel.get(label) ?? []), s.person]);
  }
  return [...byLabel].map(([label, people]) => `${label} (${people.join('+')})`).join(' · ');
}

/**
 * One item as a row: time, coloured label with its icon, and details. Tapping it opens it.
 * @param {Theme} theme
 * @param {AppItem} i
 * @param {((item: AppItem) => void)} [onItem]
 */
export function itemRow(theme, i, onItem) {
  const details = [i.location, i.related_people.length ? `about ${i.related_people.join('+')}` : '', i.notes].filter(Boolean).join(' · ');
  return el('li', { class: `item${onItem ? ' tappable' : ''}`, onclick: onItem ? () => onItem(i) : undefined },
    el('span', { class: 'time' }, timeText(i)),
    el('div', { class: 'body' },
      el('span', { class: 'pill', style: toneStyle(theme, i.tone) }, icon(theme, i.icon), i.label),
      details ? el('div', { class: 'details' }, details) : ''));
}

/**
 * A day as a titled list; with onRestore, its cancelled events too.
 * @param {Theme} theme
 * @param {string} title
 * @param {AppDay|undefined} day
 * @param {{ onTitle?: () => void, onItem?: (item: AppItem) => void, onRestore?: (c: CancelledItem, button: HTMLButtonElement) => void }} [options]
 */
export function daySection(theme, title, day, options = {}) {
  const cancelled = options.onRestore && day?.cancelled?.length ? el('div', { class: 'cancelled' },
    el('h3', {}, 'Cancelled'),
    el('ul', { class: 'items' }, (day?.cancelled ?? []).map((c) => el('li', { class: 'item' },
      el('span', { class: 'time' }, c.start_time ?? ''),
      el('div', { class: 'body' }, el('s', {}, `${c.participants.join('+')} - ${c.title}`), ' ',
        el('button', { class: 'link', type: 'button', onclick: (/** @type {Event} */ ev) => options.onRestore?.(c, /** @type {HTMLButtonElement} */ (ev.currentTarget)) }, 'Restore')))))) : '';
  const note = day ? schoolNote(theme, day.school) : '';
  return el('section', { class: 'day-section' },
    el('h2', { class: options.onTitle ? 'link-title' : '', onclick: options.onTitle }, title,
      note ? el('span', { class: 'school-note', style: { background: shade(theme, day?.school ?? []) } }, note) : ''),
    !day || day.items.length === 0
      ? el('p', { class: 'muted empty' }, 'Nothing on.')
      : el('ul', { class: 'items' }, day.items.map((i) => itemRow(theme, i, options.onItem))),
    cancelled);
}

/**
 * Reminders whose window includes a date.
 * @param {AppReminder[]} reminders
 * @param {string} date
 */
export function remindersOn(reminders, date) {
  const due = reminders.filter((r) => r.window_start <= date && r.window_end >= date);
  return due.length === 0 ? '' : el('section', { class: 'reminders' },
    el('h2', {}, 'Reminders'),
    el('ul', { class: 'items' }, due.map((r) => el('li', { class: 'item' },
      el('span', { class: 'time' }, `by ${r.window_end.slice(8)}/${r.window_end.slice(5, 7)}`),
      el('div', { class: 'body' }, `${r.owner.join('+')} - ${r.title}`)))));
}

/**
 * List items due on a day (or overdue), under "To do" (ADR-085): tick one off, or open its list.
 * @param {Todo[]} todos
 * @param {{ open: (listId: string) => void, tick: (todo: Todo, button: HTMLButtonElement) => void }} actions
 * @param {string} [heading]
 */
export function todoSection(todos, actions, heading = 'To do') {
  if (todos.length === 0) return '';
  return el('section', { class: 'todos' },
    el('h2', {}, heading),
    el('ul', { class: 'list-items' }, todos.map((t) => el('li', { class: 'list-item' },
      el('button', { class: 'tick', type: 'button', 'aria-label': 'Tick', onclick: (/** @type {Event} */ ev) => actions.tick(t, /** @type {HTMLButtonElement} */ (ev.currentTarget)) }, ''),
      el('div', { class: 'list-item-body', onclick: () => actions.open(t.list_id) },
        el('div', { class: 'list-item-text' }, t.text),
        el('div', { class: 'details' }, [t.list_title, t.owner.join('+'), heading === 'Overdue' ? `was due ${t.due_date.slice(8)}/${t.due_date.slice(5, 7)}` : '', t.notes ?? ''].filter(Boolean).join(' · ')))))));
}
