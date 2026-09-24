// @ts-check

import { el, addDays, weekdayIndex } from '../dom.js';
import { icon, toneStyle, shade } from './parts.js';

/** Items a phone-width day cell has room for before "+N more" (ADR-051). */
const FITS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The month grid: Monday first, days outside the month dimmed, school breaks shaded, each day's
 * most important items as coloured chips, "+N more" when crowded. Tapping a day opens it.
 * @param {import('./parts.js').Theme} theme
 * @param {import('./parts.js').DaysData} data
 * @param {string} monthStart  YYYY-MM-01
 * @param {string} today
 * @param {(date: string) => void} openDay
 */
export function monthView(theme, data, monthStart, today, openDay) {
  const month = monthStart.slice(0, 7);
  const cells = data.days.map((day) => {
    const extra = day.items.length - FITS;
    const shown = extra > 0 ? day.items.slice(0, FITS - 1) : day.items;
    const background = shade(theme, day.school);
    return el('button', {
      class: `cell${day.date.slice(0, 7) === month ? '' : ' outside'}${day.date === today ? ' today' : ''}`,
      style: background ? { background } : {},
      onclick: () => openDay(day.date),
      'aria-label': `${day.date}: ${day.items.length} item${day.items.length === 1 ? '' : 's'}`,
    },
    el('span', { class: 'num' }, String(Number(day.date.slice(8)))),
    shown.map((i) => el('span', { class: 'chip', style: toneStyle(theme, i.tone) }, icon(theme, i.icon), i.title)),
    extra > 0 ? el('span', { class: 'more' }, `+${extra + 1} more`) : '');
  });
  return el('div', { class: 'month' },
    el('div', { class: 'weekdays' }, WEEKDAYS.map((d) => el('span', {}, d))),
    el('div', { class: 'grid' }, cells));
}

/**
 * The dates a month grid covers: from the Monday on or before the 1st to the Sunday on or after
 * the last day (at most six weeks).
 * @param {string} monthStart  YYYY-MM-01
 */
export function monthRange(monthStart) {
  const from = addDays(monthStart, -weekdayIndex(monthStart));
  const next = new Date(`${monthStart}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { from, to: addDays(last, 6 - weekdayIndex(last)) };
}
