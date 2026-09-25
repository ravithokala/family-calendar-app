// @ts-check

import { el, niceDate } from '../dom.js';
import { reminderSheet, routineSheet } from './forms.js';
import { showIssues } from './sheet.js';
import { busy } from './fields.js';

import { VERSION } from '../version.js';
import { sourceSheet, recentSources } from './sources.js';
import { printSheet } from './print.js';
import { schoolsSection } from './schools.js';
import { routineDetail, runningSchedules, scheduleText, endedOn } from './routines.js';
import { removedSection } from './removed.js';

/**
 * The More screen: review and sources, printing, reminders (add, edit, done, cancel, reopen) and
 * routines (list, add, change, end).
 * @param {import('./forms.js').FormContext} ctx
 * @param {{ reminders: import('./forms.js').Reminder[], activities: any[], schedules: any[],
 *   sources: import('./sources.js').SourceSummary[], pending: number, periods: import('./schools.js').Period[],
 *   undoable?: Record<string, string>, removed?: import('./removed.js').Removed }} data
 * @param {{ openReview: () => void, today: string }} nav
 */
export function moreView(ctx, data, nav) {
  const messages = el('div', { class: 'messages' });
  /** @param {import('./forms.js').Reminder} r @param {string} status @param {string} done */
  const setStatus = (r, status, done) => async (/** @type {Event} */ ev) => {
    const answer = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status }));
    if (!answer.ok) { showIssues(messages, answer); return; }
    ctx.saved(done, answer, status === 'ACTIVE' ? undefined : () => ctx.call('reminders.setStatus', { reminder_id: r.reminder_id, status: r.status }));
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

  const routines = [...data.activities].filter((a) => a.active !== false)
    .sort((a, b) => `${a.person}${a.name}`.localeCompare(`${b.person}${b.name}`));
  const current = routines.filter((a) => runningSchedules(a, data.schedules, nav.today).length > 0);
  const ended = routines.filter((a) => runningSchedules(a, data.schedules, nav.today).length === 0);
  /** @param {any} a @param {boolean} isEnded */
  const routineRow = (a, isEnded) => el('li', { class: 'item plain tappable', onclick: () => routineDetail(ctx, a, data.schedules, nav.today, data.undoable?.[a.activity_id]) },
    el('div', { class: 'body' },
      el('div', {}, `${a.person} - ${a.name}`),
      el('div', { class: 'details' }, [
        ...(isEnded ? [endedOn(a, data.schedules)] : runningSchedules(a, data.schedules, nav.today).map((s) => scheduleText(a, s, nav.today))),
        a.term_time_only ? 'term time' : '',
      ].filter(Boolean).join(' · '))));

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
      // Active reminders live under each month on the Month tab (ADR-089); here, adding and history.
      el('p', { class: 'muted small' }, active.length
        ? `${active.length} active: they show under each month on the Month tab.`
        : 'Active reminders show under each month on the Month tab.'),
      closed.length ? el('details', {}, el('summary', { class: 'muted' }, `Done or cancelled (${closed.length})`), el('ul', { class: 'items' }, closed.map(reminderRow))) : ''),
    el('section', {},
      el('div', { class: 'section-head' }, el('h2', {}, 'Routines'),
        el('button', { class: 'link', type: 'button', onclick: () => routineSheet(ctx) }, '+ Add')),
      el('ul', { class: 'items' }, current.map((a) => routineRow(a, false))),
      ended.length ? el('details', {}, el('summary', { class: 'muted' }, `Ended (${ended.length})`), el('ul', { class: 'items' }, ended.map((a) => routineRow(a, true)))) : '',
      el('p', { class: 'muted small' }, 'Tap a routine to change it from a date, end it, or change its icon.')),
    schoolsSection(ctx, data.periods, nav.today),
    data.removed ? removedSection(ctx, data.removed) : '',
    el('p', { class: 'muted small version' }, `Family Cal · version ${VERSION}`));
}
