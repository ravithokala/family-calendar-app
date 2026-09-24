// @ts-check

import { el, niceDate } from '../dom.js';
import { reminderSheet, routineSheet } from './forms.js';
import { showIssues } from './sheet.js';
import { busy } from './fields.js';
import { VERSION } from '../version.js';
import { sourceSheet, recentSources } from './sources.js';
import { printSheet } from './print.js';

/**
 * The More screen: review and sources, printing, reminders (add, edit, done, cancel, reopen) and
 * routines (list, add).
 * @param {import('./forms.js').FormContext} ctx
 * @param {{ reminders: import('./forms.js').Reminder[], activities: any[], schedules: any[],
 *   sources: import('./sources.js').SourceSummary[], pending: number }} data
 * @param {{ openReview: () => void, today: string }} nav
 */
export function moreView(ctx, data, nav) {
  const messages = el('div', { class: 'messages' });
  /** @param {import('./forms.js').Reminder} r @param {string} status @param {string} done */
  const setStatus = (r, status, done) => async (/** @type {Event} */ ev) => {
    const answer = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status }));
    if (!answer.ok) { showIssues(messages, answer); return; }
    ctx.saved(done, answer);
  };
  const reminders = [...data.reminders].sort((a, b) => a.window_start.localeCompare(b.window_start));
  const active = reminders.filter((r) => r.status === 'ACTIVE');
  const closed = reminders.filter((r) => r.status !== 'ACTIVE');

  /** @param {import('./forms.js').Reminder} r */
  const reminderRow = (r) => el('li', { class: 'item' },
    el('span', { class: 'time' }, `${niceDate(r.window_start).slice(4)} – ${niceDate(r.window_end).slice(4)}`),
    el('div', { class: 'body' },
      el('div', {}, `${r.owner.join('+')} - ${r.title}`),
      r.status === 'ACTIVE'
        ? el('div', { class: 'row-actions' },
          el('button', { class: 'link', type: 'button', onclick: () => reminderSheet(ctx, r) }, 'Edit'),
          el('button', { class: 'link', type: 'button', onclick: setStatus(r, 'DONE', `Marked "${r.title}" done.`) }, 'Done'),
          el('button', { class: 'link danger-text', type: 'button', onclick: setStatus(r, 'CANCELLED', `Cancelled "${r.title}".`) }, 'Cancel'))
        : el('div', { class: 'row-actions' }, el('span', { class: 'muted' }, r.status.toLowerCase()),
          el('button', { class: 'link', type: 'button', onclick: setStatus(r, 'ACTIVE', `Reopened "${r.title}".`) }, 'Reopen'))));

  const scheduleText = (/** @type {any} */ s) => (s.schedule_type === 'EXPLICIT_DATES'
    ? `published dates to ${niceDate(s.valid_to)}`
    : `${s.day_of_week.map((/** @type {string} */ d) => d.slice(0, 3).toLowerCase()).join(', ')}${s.valid_to ? ` until ${niceDate(s.valid_to)}` : ''}`);
  const routines = [...data.activities].filter((a) => a.active !== false)
    .sort((a, b) => `${a.person}${a.name}`.localeCompare(`${b.person}${b.name}`));

  return el('div', {},
    messages,
    el('section', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Review and sources'),
        el('button', { class: 'link', type: 'button', onclick: () => sourceSheet(ctx, data.activities) }, '+ Add a source')),
      el('button', { class: 'wide-button', type: 'button', onclick: nav.openReview },
        data.pending ? `Review ${data.pending} waiting item${data.pending === 1 ? '' : 's'}` : 'Review: nothing waiting'),
      recentSources(ctx, data.sources)),
    el('section', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Printed calendars')),
      el('button', { class: 'wide-button', type: 'button', onclick: () => printSheet(ctx, nav.today) }, '🖨 Print a month (PDFs)')),
    el('section', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Reminders'),
        el('button', { class: 'link', type: 'button', onclick: () => reminderSheet(ctx) }, '+ Add')),
      active.length ? el('ul', { class: 'items' }, active.map(reminderRow)) : el('p', { class: 'muted' }, 'No reminders.'),
      closed.length ? el('details', {}, el('summary', { class: 'muted' }, `Done or cancelled (${closed.length})`), el('ul', { class: 'items' }, closed.map(reminderRow))) : ''),
    el('section', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Routines'),
        el('button', { class: 'link', type: 'button', onclick: () => routineSheet(ctx) }, '+ Add')),
      el('ul', { class: 'items' }, routines.map((a) => el('li', { class: 'item' },
        el('span', { class: 'time' }, a.default_start_time ? `${a.default_start_time}${a.default_end_time ? `–${a.default_end_time}` : ''}` : ''),
        el('div', { class: 'body' },
          el('div', {}, `${a.person} - ${a.name}`),
          el('div', { class: 'details' }, [
            ...data.schedules.filter((s) => s.activity_id === a.activity_id && s.status === 'ACTIVE').map(scheduleText),
            a.term_time_only ? 'term time' : '',
          ].filter(Boolean).join(' · ')))))),
      el('p', { class: 'muted small' }, 'Changing or ending a routine is not available yet.')),
    el('p', { class: 'muted small version' }, `Family Cal · version ${VERSION}`));
}
