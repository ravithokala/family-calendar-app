// @ts-check

import { call } from '../api.js';
import * as cache from '../cache.js';
import { el } from '../dom.js';
import { milestonesView, milestoneDetails, yearPicker } from '../views/milestones.js';
import { posterSheet } from '../views/poster.js';
import { formContext } from './context.js';
import { $, app, go, isCurrent, clock, showUpdated, showUpdating, showFetched, drawSaved, showError } from './state.js';
import { toast } from '../views/sheet.js';

/**
 * Tapping the title on Milestones: every year that has milestones, and this year, to jump to
 * (RT, 2026-10-09: stepping back with ‹ one year at a time is slow for older years).
 * @param {number} year  the year on screen
 */
export function openYears(year) {
  const data = cache.read(`milestones:${year}`)?.data;
  if (!data) { toast('Milestones are still loading.'); return; }
  yearPicker(data.years, data.counts ?? {}, year, (y) => go({ screen: 'milestones', date: `${y}-01-01` }));
}

/**
 * The Milestones screen (ADR-112), reached from More: one year, the saved copy first, then the
 * server's. ‹ › and swiping change the year.
 * @param {number} mine
 * @param {import('./state.js').State} s
 */
export async function showMilestones(mine, s) {
  const year = Number(s.date.slice(0, 4));
  const key = `milestones:${year}`;
  const saved = cache.read(key);
  const draw = (/** @type {any} */ data) => milestonesView(/** @type {any} */ (app.theme), data, (m) => milestoneDetails(formContext(), m), () => posterSheet(formContext(), year));
  const savedView = saved ? drawSaved(() => draw(saved.data)) : null;
  $('main').replaceChildren(savedView ?? el('p', { class: 'muted' }, 'Loading…'));
  showUpdating();
  try {
    const r = await call('milestones.year', { year });
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write(key, r.data);
    showFetched('Milestones');
    $('main').replaceChildren(draw(r.data));
  } catch (e) {
    if (!isCurrent(mine)) return;
    // The saved copy stays, with a note, as on More (RT, 2026-10-02).
    const reason = e instanceof Error ? e.message : String(e);
    if (saved && savedView) {
      $('main').replaceChildren(el('div', { class: 'msg warning' }, `Could not refresh: ${reason}. Showing ${clock(saved.at)}.`), savedView);
      showUpdated(saved.at);
    } else {
      showError(`Could not load: ${reason}`);
      showUpdated(null);
    }
  }
}
