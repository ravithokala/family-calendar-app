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
 *   edit: { start_date: string|null, end_date: string|null, calendars: string[], icon: string|null, all_day: boolean|null } | null }} AppItem
 * @typedef {{ event_id: string, title: string, participants: string[], start_time: string|null, end_time: string|null, routine: boolean }} CancelledItem
 * @typedef {{ person: string, period_type: string, kind: 'BREAK' | 'NO_SCHOOL' }} SchoolDay
 * @typedef {{ date: string, weekday: string, items: AppItem[], school: SchoolDay[], cancelled?: CancelledItem[] }} AppDay
 * @typedef {{ reminder_id: string, title: string, owner: string[], window_start: string, window_end: string }} AppReminder
 * @typedef {{ from: string, to: string, days: AppDay[], reminders: AppReminder[], pending: number }} DaysData  one filter's days
 * @typedef {{ from: string, to: string, views: Record<string, { days: AppDay[], reminders: AppReminder[] }>, pending: number }} AllDays
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
 * @param {{ onTitle?: () => void, onItem?: (item: AppItem) => void, onRestore?: (c: CancelledItem) => void }} [options]
 */
export function daySection(theme, title, day, options = {}) {
  const cancelled = options.onRestore && day?.cancelled?.length ? el('div', { class: 'cancelled' },
    el('h3', {}, 'Cancelled'),
    el('ul', { class: 'items' }, (day?.cancelled ?? []).map((c) => el('li', { class: 'item' },
      el('span', { class: 'time' }, c.start_time ?? ''),
      el('div', { class: 'body' }, el('s', {}, `${c.participants.join('+')} - ${c.title}`), ' ',
        el('button', { class: 'link', type: 'button', onclick: () => options.onRestore?.(c) }, 'Restore')))))) : '';
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
