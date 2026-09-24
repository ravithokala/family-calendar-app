// @ts-check

import { el, monthTitle } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { field, select, saveButton } from './fields.js';

/**
 * Printed calendars from the phone (SPEC §8, ADR-082): the month's Master, C, R and combined PDFs,
 * saved to Drive, with links to open them.
 * @param {import('./forms.js').FormContext} ctx
 * @param {string} today
 * @param {string} [chosen]  YYYY-MM to preselect, e.g. the month on screen
 */
export function printSheet(ctx, today, chosen) {
  /** @type {Array<[string, string]>} */
  const months = [];
  for (let i = -1; i <= 6; i++) {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    const iso = d.toISOString().slice(0, 10);
    months.push([iso.slice(0, 7), monthTitle(iso)]);
  }
  // The month on screen, or else next month (calendars are usually printed ahead).
  const month = select(chosen && months.some(([m]) => m === chosen) ? chosen : months[2]?.[0] ?? months[1][0], months);
  const result = el('div', {});
  const form = el('div', { class: 'form' },
    field('Month', month.node),
    el('p', { class: 'muted small' }, 'Makes Master, C, R and the combined three-page PDF in Drive. It takes a little while.'),
    el('div', { class: 'actions' }, saveButton('Generate PDFs', async () => {
      const [year, m] = (month.get() ?? '').split('-').map(Number);
      const r = await ctx.call('print.generateMonth', { year, month: m });
      showIssues(sheet.messages, r);
      if (!r.ok) return;
      result.replaceChildren(el('ul', { class: 'links' },
        r.data.files.map((/** @type {{ name: string, url: string }} */ f) => el('li', {}, el('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.name))),
        el('li', {}, el('a', { href: r.data.folder_url, target: '_blank', rel: 'noopener' }, 'Open the folder'))));
    })),
    result);
  const sheet = openSheet('Print a month', form);
}
