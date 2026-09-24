// @ts-check

import { el, niceDate, fullDate } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { field, input, select, saveButton } from './fields.js';

/**
 * School dates on the phone (ADR-084): each child's school, its coming breaks, and a form for a
 * new year's dates (terms, half terms, holidays, INSET days). Term-time routines follow them.
 *
 * @typedef {{ period_id: string, school_id: string, school_name: string, person: string, period_type: string,
 *   start_date: string, end_date: string }} Period
 */

const LABELS = /** @type {Record<string, string>} */ ({ TERM: 'Term', HALF_TERM: 'Half term', HOLIDAY: 'Holiday', INSET_DAY: 'INSET day' });

/** @param {Period} p */
const span = (p) => (p.end_date && p.end_date !== p.start_date ? `${niceDate(p.start_date)} – ${niceDate(p.end_date)}` : niceDate(p.start_date));

/**
 * @param {Period[]} periods
 * @returns {Array<{ id: string, name: string, person: string, periods: Period[] }>}
 */
function bySchool(periods) {
  /** @type {Map<string, { id: string, name: string, person: string, periods: Period[] }>} */
  const schools = new Map();
  for (const p of periods) {
    const s = schools.get(p.school_id) ?? { id: p.school_id, name: p.school_name, person: p.person, periods: [] };
    s.periods.push(p);
    schools.set(p.school_id, s);
  }
  return [...schools.values()].sort((a, b) => a.person.localeCompare(b.person));
}

/**
 * The School dates section of More.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Period[]} periods
 * @param {string} today
 */
export function schoolsSection(ctx, periods, today) {
  const schools = bySchool(periods);
  return el('section', {},
    el('div', { class: 'section-head' }, el('h2', {}, 'School dates'),
      el('button', { class: 'link', type: 'button', onclick: () => schoolSheet(ctx, schools) }, '+ Add dates')),
    schools.length === 0 ? el('p', { class: 'muted small' }, 'No school dates yet.') : '',
    schools.map((s) => {
      const known = s.periods.reduce((max, p) => (p.end_date > max ? p.end_date : max), '');
      const coming = s.periods.filter((p) => p.period_type !== 'TERM' && p.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      return el('details', { class: 'school' },
        el('summary', {}, el('strong', {}, `${s.person} · ${s.name}`), el('span', { class: 'muted small' }, ` dates known to ${fullDate(known)}`)),
        coming.length === 0 ? el('p', { class: 'muted small' }, 'No more breaks recorded. Add next year\'s dates.')
          : el('ul', { class: 'items' }, coming.slice(0, 8).map((p) => el('li', { class: 'item' },
            el('span', { class: 'time' }, LABELS[p.period_type] ?? p.period_type), el('div', { class: 'body' }, span(p))))));
    }));
}

/**
 * Add a school's dates: pick the school (or a new one), say where the dates came from, add periods.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Array<{ id: string, name: string, person: string }>} schools
 */
function schoolSheet(ctx, schools) {
  const school = select(schools[0]?.id ?? '', [...schools.map((s) => /** @type {[string, string]} */ ([s.id, `${s.person} · ${s.name}`])), ['', 'A new school…']]);
  const newId = input('text', null, { placeholder: 'e.g. OAKFIELD' });
  const newName = input('text', null, { placeholder: 'as printed' });
  const newChild = select(ctx.meta.children[0] ?? '', ctx.meta.children.map((c) => /** @type {[string, string]} */ ([c, c])));
  const newRows = el('div', {}, field('School id', newId.node), field('School name', newName.node), field('Child', newChild.node));
  const source = input('text', null, { placeholder: 'e.g. Term dates 2027-28' });
  const url = input('url', null, { placeholder: 'https://… (optional)' });
  const rows = el('div', { class: 'periods' });
  const addRow = () => {
    const type = select('HALF_TERM', ctx.meta.periodTypes.map((t) => /** @type {[string, string]} */ ([t, LABELS[t] ?? t])));
    const from = input('date', null);
    const to = input('date', null);
    const row = el('div', { class: 'period' }, type.node, from.node, to.node,
      el('button', { class: 'link danger-text', type: 'button', onclick: () => row.remove() }, '✕'));
    Object.assign(row, { read: () => ({ period_type: type.get(), start_date: from.get(), end_date: to.get() ?? undefined }) });
    rows.append(row);
  };
  addRow();
  const sync = () => { newRows.hidden = school.get() !== null; };
  school.node.addEventListener('change', sync);
  sync();

  const form = el('div', { class: 'form' },
    field('School', school.node), newRows,
    field('Where these dates came from', source.node), field('Link (optional)', url.node),
    el('div', { class: 'field' }, el('span', {}, 'Dates (type, from, to; "to" can be left blank for one day)'), rows),
    el('button', { class: 'link', type: 'button', onclick: addRow }, '+ Another period'),
    el('div', { class: 'actions' }, saveButton('Save dates', async () => {
      const existing = schools.find((s) => s.id === school.get());
      const r = await ctx.call('schools.addPeriods', {
        school_id: existing ? existing.id : (newId.get() ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        school_name: existing ? existing.name : newName.get() ?? '',
        person: existing ? existing.person : newChild.get(),
        source: { title: source.get(), source_url: url.get() },
        periods: [...rows.children].map((row) => /** @type {any} */ (row).read()),
      });
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(`Saved: ${r.data.added} added, ${r.data.skipped} already recorded.`, r);
    })));
  const sheet = openSheet('Add school dates', form);
}
