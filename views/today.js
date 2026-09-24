// @ts-check

import { el, niceDate, addDays } from '../dom.js';

/**
 * @typedef {{ event_id: string, title: string, start_date: string, end_date: string|null, start_time: string|null,
 *   end_time: string|null, all_day: boolean, participants: string[], event_type: string, schedule_id: string|null }} EventView
 * @typedef {{ date: string, events: EventView[], pending: number }} TodayData
 */

/** @param {EventView} e */
const time = (e) => (e.start_time ? `${e.start_time}${e.end_time ? `–${e.end_time}` : ''}` : 'All day');

/**
 * @param {string} title
 * @param {EventView[]} events
 */
function day(title, events) {
  return el('section', { class: 'day' },
    el('h2', {}, title),
    events.length === 0
      ? el('p', { class: 'muted' }, 'Nothing on.')
      : el('ul', { class: 'agenda' }, events.map((e) => el('li', {},
        el('span', { class: 'time' }, time(e)),
        el('span', { class: 'what' }, e.title),
        el('span', { class: 'who' }, e.participants.join('+'))))));
}

/**
 * Draws today and tomorrow from the server's answer (app.today).
 * @param {TodayData} data
 * @returns {HTMLElement}
 */
export function todayView(data) {
  const tomorrow = addDays(data.date, 1);
  const on = (/** @type {string} */ date) => data.events.filter((e) => e.start_date <= date && (e.end_date ?? e.start_date) >= date);
  return el('div', {},
    data.pending > 0 ? el('p', { class: 'notice' }, `${data.pending} item${data.pending === 1 ? '' : 's'} waiting for review`) : '',
    day(`Today · ${niceDate(data.date)}`, on(data.date)),
    day(`Tomorrow · ${niceDate(tomorrow)}`, on(tomorrow)));
}
