// @ts-check

import { el, longDate } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { field, input, select, checkbox, chips, saveButton, busy } from './fields.js';
import { timeText } from './parts.js';

/**
 * Adding and editing from the phone (ADR-081). Every save goes to the same server services as
 * the web page, which validate it, keep history and warn about clashes.
 *
 * @typedef {import('../api.js').ApiResponse} ApiResponse
 * @typedef {{ participants: string[], children: string[], eventTypes: string[], categories: string[], icons: string[], periodTypes: string[],
 *   weekdays: string[], schools: Array<{ school_id: string, school_name: string, person: string }> }} Meta
 * @typedef {{ meta: Meta, call: (action: string, payload?: unknown) => Promise<ApiResponse>,
 *   saved: (message: string, r: ApiResponse) => void }} FormContext
 * @typedef {import('./parts.js').AppItem} AppItem
 */

/** @param {string} s */
const words = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * The event form, empty for a new event or filled in to edit one. Editing sends only what changed;
 * the server keeps the old version as history (ADR-070). With `review`, the form corrects a
 * proposed event and approving it sends only the corrections (ADR-074, ADR-082).
 * @param {FormContext} ctx
 * With `prefill` (Quick Capture, ADR-083) a new event starts filled in, and `note` says what is still needed.
 * @param {{ item?: AppItem, date?: string, review?: { heading: string, send: (corrections: Record<string, unknown>) => Promise<ApiResponse> },
 *   prefill?: Record<string, any>, note?: string }} from
 */
export function eventSheet(ctx, from) {
  const item = from.item;
  const review = from.review;
  const p = from.prefill ?? {};
  const e = item?.edit;
  const initial = {
    title: item?.title ?? p.title ?? null, event_type: item?.event_type ?? p.event_type ?? 'APPOINTMENT',
    start_date: e?.start_date ?? p.start_date ?? from.date ?? null, end_date: e?.end_date ?? p.end_date ?? null,
    all_day: e ? Boolean(e.all_day) : !p.start_time, start_time: item?.start_time ?? p.start_time ?? null, end_time: item?.end_time ?? p.end_time ?? null,
    participants: item?.participants ?? p.participants ?? [], related_people: item?.related_people ?? [], location: item?.location ?? null,
    notes: item?.notes ?? null, calendars: e?.calendars ?? [], icon: e?.icon ?? null,
  };
  const f = {
    title: input('text', initial.title, { required: true, placeholder: 'e.g. Swimming gala' }),
    event_type: select(initial.event_type, ctx.meta.eventTypes.map((t) => [t, words(t)])),
    start_date: input('date', initial.start_date),
    end_date: input('date', initial.end_date),
    all_day: checkbox(initial.all_day, 'All day'),
    start_time: input('time', initial.start_time),
    end_time: input('time', initial.end_time),
    participants: chips(ctx.meta.participants, initial.participants),
    related_people: chips(ctx.meta.participants, initial.related_people),
    location: input('text', initial.location),
    notes: input('text', initial.notes),
    masterOnly: checkbox(initial.calendars.length > 0, 'Print on Master only'),
    icon: select(initial.icon ?? '', [['', '(automatic)'], ...ctx.meta.icons.map((i) => /** @type {[string, string]} */ ([i, i]))]),
  };
  const times = el('div', { class: 'row' }, field('Start', f.start_time.node), field('End', f.end_time.node));
  const syncTimes = () => { times.hidden = f.all_day.get(); };
  f.all_day.box.addEventListener('change', syncTimes);
  syncTimes();

  const values = () => {
    const allDay = f.all_day.get();
    return {
      title: f.title.get(), event_type: f.event_type.get(), start_date: f.start_date.get(), end_date: f.end_date.get(),
      all_day: allDay, start_time: allDay ? null : f.start_time.get(), end_time: allDay ? null : f.end_time.get(),
      participants: f.participants.get(), related_people: f.related_people.get(), location: f.location.get(), notes: f.notes.get(),
      calendars: f.masterOnly.get() ? ['MASTER'] : [], icon: f.icon.get(),
    };
  };

  const form = el('div', { class: 'form' },
    from.note ? el('div', { class: 'msg warning' }, from.note) : '',
    field('What', f.title.node),
    el('div', { class: 'row' }, field('Type', f.event_type.node), field('Date', f.start_date.node)),
    f.all_day.node, times,
    field('Who takes part', f.participants.node),
    field('About (optional)', f.related_people.node),
    el('details', { class: 'more-fields' }, el('summary', {}, 'More: until, where, notes, printing'),
      field('Until (multi-day)', f.end_date.node), field('Where', f.location.node), field('Notes', f.notes.node),
      f.masterOnly.node, field('Icon', f.icon.node)),
    el('div', { class: 'actions' }, saveButton(review ? 'Approve' : item ? 'Save changes' : 'Add event', async () => {
      const v = values();
      /** @type {ApiResponse} */
      let r;
      if (review) {
        const corrections = Object.fromEntries(Object.entries(v).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify(/** @type {any} */ (initial)[k])));
        r = await review.send(corrections);
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved(`Approved "${v.title}".`, r);
        return;
      }
      if (item) {
        const changes = Object.fromEntries(Object.entries(v).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify(/** @type {any} */ (initial)[k])));
        if (Object.keys(changes).length === 0) { sheet.close(); return; }
        r = await ctx.call('events.update', { event_id: item.event_id, changes });
      } else {
        r = await ctx.call('events.createManual', v);
      }
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(item ? `Saved "${v.title}".` : `Added "${v.title}".`, r);
    })));
  const sheet = openSheet(review ? review.heading : item ? 'Edit event' : 'Add event', form);
  if (!item && !from.prefill) f.title.node.focus();
}

/**
 * An event's details, with Edit and Cancel.
 * @param {FormContext} ctx
 * @param {import('./parts.js').Theme} theme
 * @param {AppItem} item
 * @param {string} date  the day it was opened from
 */
export function eventDetails(ctx, theme, item, date) {
  const e = item.edit;
  const when = e && e.end_date && e.end_date !== e.start_date ? `${longDate(e.start_date ?? date)} – ${longDate(e.end_date)}` : longDate(date);
  const rows = [
    ['When', `${when}${timeText(item) ? `, ${timeText(item)}` : ''}`],
    ['Who', item.participants.join(', ') || '—'],
    ['About', item.related_people.join(', ')],
    ['Where', item.location ?? ''],
    ['Notes', item.notes ?? ''],
    ['Kind', `${words(item.event_type)}${item.routine ? ' (routine session)' : ''}`],
  ].filter(([, v]) => v);
  const body = el('div', { class: 'form' },
    el('dl', { class: 'details-list' }, rows.map(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('div', { class: 'actions' },
      el('button', { class: 'primary', type: 'button', onclick: () => { sheet.close(); eventSheet(ctx, { item }); } }, 'Edit'),
      el('button', { class: 'danger', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const what = item.routine ? `this ${item.title} session only` : `"${item.title}"`;
        if (!confirm(`Cancel ${what}? It is kept in the history and can be restored.`)) return;
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('events.cancel', { event_id: item.event_id }));
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved(`Cancelled "${item.title}".`, r);
      } }, item.routine ? 'Cancel this session' : 'Cancel event')));
  const sheet = openSheet(item.label, body);
}

/**
 * A new weekly routine, e.g. R's chess on Fridays (ADR-081). Its sessions appear on the next view.
 * @param {FormContext} ctx
 * @param {{ person?: string, name?: string, category?: string|null, days?: string[], start?: string|null, end?: string|null, note?: string }} [prefill]
 */
export function routineSheet(ctx, prefill = {}) {
  const f = {
    person: chips(ctx.meta.participants, prefill.person ? [prefill.person] : [], { single: true }),
    name: input('text', prefill.name ?? null, { placeholder: 'as printed, e.g. Chess' }),
    category: select(prefill.category ?? 'OTHER', ctx.meta.categories.map((c) => [c, words(c)])),
    days: chips(ctx.meta.weekdays.map((d) => d.slice(0, 3)), (prefill.days ?? []).map((d) => d.slice(0, 3))),
    start: input('time', prefill.start ?? null), end: input('time', prefill.end ?? null),
    from: input('date', new Date().toISOString().slice(0, 10)), until: input('date', null),
    termTime: checkbox(false, 'Term time only (not in school holidays)'),
    location: input('text', null),
    source: input('text', null, { placeholder: 'e.g. Club email, 24 Sep' }),
  };
  const termRow = el('div', {}, f.termTime.node);
  const sync = () => { termRow.hidden = !ctx.meta.children.includes(f.person.get()[0] ?? ''); };
  f.person.onChange(sync);
  sync();
  const form = el('div', { class: 'form' },
    prefill.note ? el('div', { class: 'msg warning' }, prefill.note) : '',
    field('Whose', f.person.node), field('Name', f.name.node), field('Kind', f.category.node),
    field('Days', f.days.node), el('div', { class: 'row' }, field('Start', f.start.node), field('End', f.end.node)),
    el('div', { class: 'row' }, field('From', f.from.node), field('Until (optional)', f.until.node)),
    termRow, field('Where', f.location.node), field('Where this came from', f.source.node),
    el('div', { class: 'actions' }, saveButton('Add routine', async () => {
      const person = f.person.get()[0] ?? null;
      const name = f.name.get();
      const school = ctx.meta.schools.find((s) => s.person === person);
      const termTime = person !== null && ctx.meta.children.includes(person) && f.termTime.get();
      const dayNames = f.days.get().map((d) => ctx.meta.weekdays.find((w) => w.startsWith(d)) ?? d);
      const r = await ctx.call('routines.add', {
        activity: {
          // A readable id, as ADR conventions ask: e.g. R_CHESS.
          activity_id: person && name ? `${person}_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}` : null,
          name, person, category: f.category.get(), term_time_only: termTime, term_calendar: termTime && school ? school.school_id : null,
          default_start_time: f.start.get(), default_end_time: f.end.get(), location: f.location.get(),
        },
        schedule: { name: 'Weekly', valid_from: f.from.get(), valid_to: f.until.get(), day_of_week: dayNames },
        source: { title: f.source.get() },
      });
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(`Added ${person} ${name}.`, r);
    })));
  const sheet = openSheet('Add a weekly routine', form);
}

/**
 * @typedef {{ reminder_id: string, title: string, owner: string[], related_people: string[], window_start: string,
 *   window_end: string, notes: string|null, status: string }} Reminder
 */

/**
 * A reminder: something to do within a window, never an event (ADR-072). Edited in place.
 * @param {FormContext} ctx
 * @param {Reminder} [reminder]
 * @param {{ title?: string, owner?: string[], related?: string[], from?: string|null, until?: string|null, note?: string }} [prefill]
 */
export function reminderSheet(ctx, reminder, prefill = {}) {
  const f = {
    title: input('text', reminder?.title ?? prefill.title ?? null, { placeholder: 'e.g. Book the boiler service' }),
    owner: chips(ctx.meta.participants, reminder?.owner ?? prefill.owner ?? []),
    related: chips(ctx.meta.participants, reminder?.related_people ?? prefill.related ?? []),
    from: input('date', reminder?.window_start ?? prefill.from ?? null), until: input('date', reminder?.window_end ?? prefill.until ?? null),
    notes: input('text', reminder?.notes ?? null),
  };
  const form = el('div', { class: 'form' },
    prefill.note ? el('div', { class: 'msg warning' }, prefill.note) : '',
    field('What', f.title.node), field('Who does it', f.owner.node), field('About (optional)', f.related.node),
    el('div', { class: 'row' }, field('From', f.from.node), field('By', f.until.node)), field('Notes', f.notes.node),
    el('div', { class: 'actions' }, saveButton(reminder ? 'Save changes' : 'Add reminder', async () => {
      const values = { title: f.title.get(), owner: f.owner.get(), related_people: f.related.get(), window_start: f.from.get(), window_end: f.until.get(), notes: f.notes.get() };
      /** @type {ApiResponse} */
      let r;
      if (reminder) {
        const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(/** @type {any} */ (reminder)[k] ?? null)));
        if (Object.keys(changes).length === 0) { sheet.close(); return; }
        r = await ctx.call('reminders.update', { reminder_id: reminder.reminder_id, changes });
      } else {
        r = await ctx.call('reminders.add', values);
      }
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(reminder ? `Saved "${values.title}".` : `Added "${values.title}".`, r);
    })));
  const sheet = openSheet(reminder ? 'Edit reminder' : 'Add a reminder', form);
}
