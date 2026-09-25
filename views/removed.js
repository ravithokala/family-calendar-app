// @ts-check

import { el, niceDate } from '../dom.js';
import { busy } from './fields.js';
import { toast } from './sheet.js';

/**
 * "Recently removed" in More (ADR-087): one place to look when something has gone, each with a
 * way back. Ended routines are under Routines, with "Start again" and "Undo".
 *
 * @typedef {{ events: Array<{ event_id: string, title: string, start_date: string, start_time: string|null, participants: string[], routine: boolean }>,
 *   items: Array<{ item_id: string, text: string, list_id: string, list_title: string }>,
 *   reminders: Array<{ reminder_id: string, title: string, owner: string[], window_start: string }> }} Removed
 */

/**
 * @param {import('./forms.js').FormContext} ctx
 * @param {Removed} removed
 */
export function removedSection(ctx, removed) {
  const total = removed.events.length + removed.items.length + removed.reminders.length;
  /**
   * @param {string} label
   * @param {string} detail
   * @param {() => Promise<import('../api.js').ApiResponse>} restore
   * @param {string} done
   */
  const row = (label, detail, restore, done) => el('li', { class: 'item with-action' },
    el('div', { class: 'body' }, el('div', {}, label), el('div', { class: 'details' }, detail)),
    el('button', { class: 'link', type: 'button', onclick: async (/** @type {Event} */ ev) => {
      const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), restore);
      if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
      ctx.saved(done, r);
    } }, 'Restore'));
  return el('section', {},
    el('details', {},
      el('summary', { class: 'section-summary' }, el('h2', {}, `Recently removed${total ? ` (${total})` : ''}`)),
      total === 0 ? el('p', { class: 'muted' }, 'Nothing to bring back.') : '',
      removed.events.length ? el('h3', { class: 'muted small' }, 'Cancelled events') : '',
      el('ul', { class: 'items' }, removed.events.map((e) => row(
        `${e.participants.join('+')} - ${e.title}`,
        `${niceDate(e.start_date)}${e.start_time ? ` ${e.start_time}` : ''}${e.routine ? ' · routine session' : ''}`,
        () => ctx.call('events.restore', { event_id: e.event_id }), `Restored "${e.title}".`))),
      removed.items.length ? el('h3', { class: 'muted small' }, 'Removed list items') : '',
      el('ul', { class: 'items' }, removed.items.map((i) => row(i.text, i.list_title,
        () => ctx.call('listItems.setStatus', { item_id: i.item_id, status: 'OPEN' }), `"${i.text}" is back on ${i.list_title}.`))),
      removed.reminders.length ? el('h3', { class: 'muted small' }, 'Cancelled reminders') : '',
      el('ul', { class: 'items' }, removed.reminders.map((r) => row(`${r.owner.join('+')} - ${r.title}`, `from ${niceDate(r.window_start)}`,
        () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status: 'ACTIVE' }), `Reopened "${r.title}".`))),
      el('p', { class: 'muted small' }, 'Ended routines are under Routines, where a change can also be undone.')));
}
