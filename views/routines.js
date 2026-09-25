// @ts-check

import { el, niceDate, fullDate } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { field, input, select, chips, saveButton, busy } from './fields.js';

/**
 * Routines in More: what each one is now, and changing it from a date, ending it, or its icon
 * (ADR-068, ADR-086). A change or an end is previewed before anything is saved.
 *
 * @typedef {{ activity_id: string, name: string, person: string, default_start_time: string|null, default_end_time: string|null,
 *   location: string|null, term_time_only: boolean, active: boolean, icon: string|null }} Activity
 * @typedef {{ schedule_id: string, activity_id: string, schedule_type: string, valid_from: string|null, valid_to: string|null,
 *   day_of_week: string[], start_time: string|null, end_time: string|null, status: string }} Schedule
 * @typedef {{ date: string, reason: 'cancelled'|'edited' }} Dropped
 */

/** @param {string[]} days */
const dayText = (days) => days.map((d) => d.charAt(0) + d.slice(1, 3).toLowerCase()).join(', ');

/** @param {string|null} start @param {string|null} end */
const timeText = (start, end) => (start ? `${start}${end ? `–${end}` : ''}` : '');

/**
 * The routine's schedules still running on or after today, earliest first.
 * @param {Activity} a
 * @param {Schedule[]} schedules
 * @param {string} today
 */
export const runningSchedules = (a, schedules, today) => schedules
  .filter((s) => s.activity_id === a.activity_id && s.status === 'ACTIVE' && (s.valid_to === null || s.valid_to >= today))
  .sort((x, y) => (x.valid_from ?? '').localeCompare(y.valid_from ?? ''));

/**
 * e.g. "Mon 18:00–19:00 until Sun 1 Nov" or "from Mon 2 Nov: Wed 17:00–18:00".
 * @param {Activity} a
 * @param {Schedule} s
 * @param {string} today
 */
export function scheduleText(a, s, today) {
  if (s.schedule_type === 'EXPLICIT_DATES') return `published dates to ${niceDate(/** @type {string} */ (s.valid_to))}`;
  const start = s.start_time ?? a.default_start_time;
  const end = s.start_time !== null ? s.end_time : a.default_end_time;
  return [
    s.valid_from && s.valid_from > today ? `from ${niceDate(s.valid_from)}:` : '',
    dayText(s.day_of_week), timeText(start, end),
    s.valid_to ? `until ${niceDate(s.valid_to)}` : '',
  ].filter(Boolean).join(' ');
}

/** @param {Dropped[]} dropped */
const droppedList = (dropped) => (dropped.length === 0 ? '' : el('div', { class: 'msg warning' },
  el('div', {}, 'These sessions were changed by hand and will not carry over. Redo them afterwards if they still apply:'),
  el('ul', {}, dropped.map((d) => el('li', {}, `${niceDate(d.date)}: ${d.reason === 'cancelled' ? 'cancelled, but not on the new days' : 'edited, replaced by the new time'}`)))));

/** @param {number} n @param {string} word */
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Two steps in one sheet: the form, then its preview with Save and Back.
 * @param {import('./forms.js').FormContext} ctx
 * @param {string} title
 * @param {Node} form
 * @param {string} previewLabel
 * @param {() => Promise<{ ok: boolean, data: any, errors: any[], warnings: any[] }>} preview
 * @param {(data: any) => Node} describe
 * @param {string} saveLabel
 * @param {() => Promise<{ ok: boolean, data: any, errors: any[], warnings: any[] }>} save
 * @param {(data: any) => string} done
 * @param {string} [saveClass]
 */
function previewSheet(ctx, title, form, previewLabel, preview, describe, saveLabel, save, done, saveClass = 'primary') {
  const stage = el('div', {});
  const editing = () => stage.replaceChildren(form, el('div', { class: 'actions' },
    el('button', { class: 'primary', type: 'button', onclick: async (/** @type {Event} */ ev) => {
      const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), preview);
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.messages.replaceChildren();
      stage.replaceChildren(describe(r.data), el('div', { class: 'actions' },
        el('button', { class: 'link', type: 'button', onclick: editing }, '‹ Back'),
        el('button', { class: saveClass, type: 'button', onclick: async (/** @type {Event} */ e2) => {
          const answer = await busy(/** @type {HTMLButtonElement} */ (e2.currentTarget), save);
          if (!answer.ok) { showIssues(sheet.messages, answer); return; }
          sheet.close();
          ctx.saved(done(answer.data), answer);
        } }, saveLabel)));
    } }, previewLabel)));
  editing();
  const sheet = openSheet(title, el('div', { class: 'form' }, stage));
}

/**
 * Changing a weekly routine from a date: days, times and where (ADR-086). Also starts an ended
 * routine again.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Activity} a
 * @param {Schedule|undefined} current  the schedule to start from, if any
 * @param {string} today
 */
function changeSheet(ctx, a, current, today) {
  const f = {
    from: input('date', today),
    days: chips(ctx.meta.weekdays.map((/** @type {string} */ d) => d.slice(0, 3)), (current?.day_of_week ?? []).map((d) => d.slice(0, 3))),
    start: input('time', current?.start_time ?? a.default_start_time),
    end: input('time', current?.start_time ? current.end_time : a.default_end_time),
    location: input('text', a.location),
  };
  const form = el('div', {},
    field('From', f.from.node),
    field('Days', f.days.node),
    el('div', { class: 'row' }, field('Start', f.start.node), field('End', f.end.node)),
    field('Where', f.location.node),
    el('p', { class: 'muted small' }, 'Sessions before this date stay as they were.'));
  const payload = () => ({
    activity_id: a.activity_id, from: f.from.get(), start_time: f.start.get(), end_time: f.end.get(), location: f.location.get(),
    day_of_week: f.days.get().map((d) => ctx.meta.weekdays.find((/** @type {string} */ w) => w.startsWith(d)) ?? d),
  });
  previewSheet(ctx, `Change ${a.person} - ${a.name}`, form,
    'Preview',
    () => ctx.call('routines.change', { ...payload(), dry_run: true }),
    (d) => el('div', {},
      el('p', {}, el('strong', {}, `From ${niceDate(d.from)}: `), `${dayText(d.schedule.day_of_week)} ${timeText(d.schedule.start_time, d.schedule.end_time)}${f.location.get() ? ` at ${f.location.get()}` : ''}.`),
      el('p', {}, d.replaced > 0
        ? `${count(d.replaced, 'upcoming session')} replaced by ${d.sessions} new one${d.sessions === 1 ? '' : 's'}.`
        : `${count(d.sessions, 'session')} added.`),
      d.kept_cancelled.length ? el('p', {}, `Kept cancelled: ${d.kept_cancelled.map(niceDate).join(', ')}.`) : '',
      droppedList(d.dropped),
      d.sessions === 0 ? el('div', { class: 'msg warning' }, 'No sessions: check the days, and for term-time routines that school dates are recorded.') : ''),
    'Save change',
    () => ctx.call('routines.change', payload()),
    (d) => `${a.person} ${a.name} changed from ${niceDate(d.from)}.`);
}

/**
 * Ending a routine after its last session (ADR-086).
 * @param {import('./forms.js').FormContext} ctx
 * @param {Activity} a
 * @param {string} today
 */
function endSheet(ctx, a, today) {
  const last = input('date', today);
  const form = el('div', {},
    field('Last session on', last.node),
    el('p', { class: 'muted small' }, 'Later sessions go from the calendar and the printouts. Earlier ones stay. It can be started again later.'));
  previewSheet(ctx, `End ${a.person} - ${a.name}`, form,
    'Preview',
    () => ctx.call('routines.end', { activity_id: a.activity_id, last_date: last.get(), dry_run: true }),
    (d) => el('div', {},
      el('p', {}, el('strong', {}, `Last session: ${niceDate(d.last_date)}. `), `${count(d.removed, 'later session')} removed from the calendar.`),
      droppedList(d.dropped)),
    'End routine',
    () => ctx.call('routines.end', { activity_id: a.activity_id, last_date: last.get() }),
    (d) => `${a.person} ${a.name} ends after ${niceDate(d.last_date)}.`,
    'danger');
}

/**
 * A routine's own sheet: what it is now, and what can be done with it.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Activity} a
 * @param {Schedule[]} schedules  all schedules
 * @param {string} today
 */
export function routineDetail(ctx, a, schedules, today) {
  const running = runningSchedules(a, schedules, today);
  const weekly = running.filter((s) => s.schedule_type === 'RECURRENCE');
  const published = running.some((s) => s.schedule_type === 'EXPLICIT_DATES');
  const ended = running.length === 0;
  const icon = select(a.icon ?? '', [['', '(from its kind)'], ...ctx.meta.icons.map((/** @type {string} */ i) => /** @type {[string, string]} */ ([i, i]))]);
  const open = (/** @type {() => void} */ next) => () => { sheet.close(); next(); };
  const body = el('div', { class: 'form' },
    el('p', {}, ended ? 'Ended.' : running.map((s) => scheduleText(a, s, today)).join(' · ')),
    a.location ? el('p', { class: 'muted' }, a.location) : '',
    el('div', { class: 'actions stacked' },
      published ? '' : el('button', { class: 'wide-button', type: 'button', onclick: open(() => changeSheet(ctx, a, weekly[weekly.length - 1], today)) },
        ended ? 'Start again from a date…' : 'Change from a date…'),
      ended ? '' : el('button', { class: 'wide-button danger-text', type: 'button', onclick: open(() => endSheet(ctx, a, today)) }, 'End this routine…')),
    published ? el('p', { class: 'muted small' }, 'This routine follows published dates: new dates come from a source.') : '',
    field('Icon', icon.node),
    el('div', { class: 'actions' }, saveButton('Save icon', async () => {
      const r = await ctx.call('routines.setIcon', { activity_id: a.activity_id, icon: icon.get() });
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(`Icon saved for ${a.person} ${a.name}.`, r);
    })),
    el('p', { class: 'muted small' }, a.term_time_only ? 'Term time only.' : ''));
  const sheet = openSheet(`${a.person} - ${a.name}`, body);
}

/**
 * When a routine's last schedule ended, for the Ended list.
 * @param {Activity} a
 * @param {Schedule[]} schedules
 */
export function endedOn(a, schedules) {
  const ends = schedules.filter((s) => s.activity_id === a.activity_id && s.status === 'ACTIVE' && s.valid_to !== null)
    .map((s) => /** @type {string} */ (s.valid_to)).sort();
  return ends.length ? `ended ${fullDate(ends[ends.length - 1])}` : 'ended';
}
