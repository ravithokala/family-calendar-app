// @ts-check

import { el, niceDate, addDays, addMonths } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { busy } from './fields.js';
import { reminderSheet } from './forms.js';

/**
 * Reminders under the Month grid, like the printed page's REMINDERS box (ADR-072, ADR-089): the
 * active ones whose window touches the month, most urgent first, just who and what; overdue ones
 * in red. Tapping one shows its dates with Edit, Done and Cancel; one from Household Admin shows
 * its dates and a link to change it there instead (ADR-099).
 */

/**
 * @param {import('./forms.js').FormContext} ctx
 * @param {import('./parts.js').AppReminder} r
 * @param {string} today
 */
export function reminderActions(ctx, r, today) {
  const full = /** @type {import('./forms.js').Reminder} */ ({ related_people: [], notes: null, status: 'ACTIVE', ...r });
  // In progress (ADR-121): done my part, waiting on someone else; never overdue, never printed.
  const waiting = full.status === 'IN_PROGRESS';
  /** @param {string} status @param {string} done */
  const setStatus = (status, done) => async (/** @type {Event} */ ev) => {
    const answer = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status }));
    if (!answer.ok) { showIssues(sheet.messages, answer); return; }
    sheet.close();
    // Undo puts back the status it had.
    ctx.saved(done, answer, () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status: full.status }));
  };
  const overdue = !waiting && r.window_end < today;
  const dates = el('p', { class: overdue ? 'overdue-text' : '' }, `${niceDate(r.window_start)} – ${niceDate(r.window_end)}${overdue ? ' · overdue' : waiting ? ' · in progress' : ''}`);
  const about = full.related_people.length ? el('p', { class: 'muted' }, `About ${full.related_people.join('+')}`) : '';
  if (r.link) {
    // Read-only here: it changes, and is finished, in Household Admin (ADR-099).
    openSheet(`${r.owner.join('+')} - ${r.title}`, el('div', { class: 'form' }, dates, about,
      el('p', { class: 'muted small' }, 'From Household Admin. Change it there, or mark it renewed there: this reminder follows on its own.'),
      el('div', { class: 'actions' }, el('a', { class: 'link-button primary', href: r.link, target: '_blank', rel: 'noopener' }, 'Open in Household Admin'))));
    return;
  }
  const sheet = openSheet(`${r.owner.join('+')} - ${r.title}`, el('div', { class: 'form' },
    dates,
    about,
    full.notes ? el('p', { class: 'muted' }, full.notes) : '',
    el('div', { class: 'actions' },
      el('button', { class: 'secondary', type: 'button', onclick: () => { sheet.close(); reminderSheet(ctx, full); } }, 'Edit'),
      waiting
        ? el('button', { class: 'secondary', type: 'button', onclick: setStatus('ACTIVE', `"${r.title}" is back to do.`) }, 'Back to to-do')
        : el('button', { class: 'secondary', type: 'button', onclick: setStatus('IN_PROGRESS', `"${r.title}" is in progress.`) }, 'In progress'),
      el('button', { class: 'primary', type: 'button', onclick: setStatus('DONE', `Marked "${r.title}" done.`) }, 'Done'),
      waiting ? '' : el('button', { class: 'danger', type: 'button', onclick: setStatus('CANCELLED', `Cancelled "${r.title}".`) }, 'Cancel')),
    waiting ? '' : el('p', { class: 'muted small' }, 'In progress: you have done your part and are waiting on someone else. It stays in the app until Done, and is not printed.')));
}

/**
 * @param {import('./forms.js').FormContext} ctx
 * @param {import('./parts.js').AppReminder[]} reminders  the view's reminders (any that touch the loaded range)
 * @param {string} monthStart  YYYY-MM-01
 * @param {string} today
 */
export function monthReminders(ctx, reminders, monthStart, today) {
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const shown = reminders.filter((r) => r.status !== 'IN_PROGRESS' && r.window_start <= monthEnd && r.window_end >= monthStart)
    .sort((a, b) => a.window_end.localeCompare(b.window_end) || a.title.localeCompare(b.title));
  // In progress (ADR-121): their own group below, whatever their dates, until done; not overdue.
  const waiting = reminders.filter((r) => r.status === 'IN_PROGRESS').sort((a, b) => a.window_end.localeCompare(b.window_end) || a.title.localeCompare(b.title));
  // A new reminder here covers the rest of this month by default.
  const from = today > monthStart && today <= monthEnd ? today : monthStart;
  return el('section', { class: 'month-reminders' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Reminders'),
      el('button', { class: 'link', type: 'button', onclick: () => reminderSheet(ctx, undefined, { from, until: monthEnd }) }, '+ Add')),
    shown.length === 0 ? el('p', { class: 'muted small' }, 'No reminders this month.')
      : el('ul', { class: 'items' }, shown.map((r) => el('li', { class: 'item plain tappable', onclick: () => reminderActions(ctx, r, today) },
        el('div', { class: `body${r.window_end < today ? ' overdue-text' : ''}` }, `${r.owner.join('+')} - ${r.title}`)))),
    waiting.length ? el('h3', { class: 'muted small in-progress-head' }, 'In progress') : '',
    waiting.length ? el('ul', { class: 'items in-progress' }, waiting.map((r) => el('li', { class: 'item plain tappable', onclick: () => reminderActions(ctx, r, today) },
      el('div', { class: 'body' }, `${r.owner.join('+')} - ${r.title}`, r.notes ? el('div', { class: 'details' }, r.notes) : '')))) : '');
}
