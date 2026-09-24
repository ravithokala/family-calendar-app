// @ts-check

import { el, niceDate, isoDate, addDays } from '../dom.js';

/**
 * @typedef {{ event_id: string, title: string, start_date: string, end_date: string|null, start_time: string|null,
 *   end_time: string|null, all_day: boolean, participants: string[], event_type: string, schedule_id: string|null }} EventView
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
 * Today and tomorrow, from the server's calendar query (Master: everything).
 * @param {(action: string, payload?: unknown) => Promise<any>} call
 * @returns {Promise<HTMLElement>}
 */
export async function todayView(call) {
  const today = isoDate(new Date());
  const tomorrow = addDays(today, 1);
  const [events, inbox] = await Promise.all([
    call('calendar.getEvents', { from: today, to: tomorrow, calendar: 'MASTER' }),
    call('review.inbox'),
  ]);
  if (!events.ok) throw new Error(events.errors.map((/** @type {{ message: string }} */ e) => e.message).join('; '));
  /** @type {EventView[]} */
  const all = events.data.events;
  const on = (/** @type {string} */ date) => all.filter((e) => e.start_date <= date && (e.end_date ?? e.start_date) >= date);
  const pending = inbox.ok ? inbox.data.count : 0;
  return el('div', {},
    pending > 0 ? el('p', { class: 'notice' }, `${pending} item${pending === 1 ? '' : 's'} waiting for review`) : '',
    day(`Today · ${niceDate(today)}`, on(today)),
    day(`Tomorrow · ${niceDate(tomorrow)}`, on(tomorrow)));
}
