// @ts-check

import { call } from '../api.js';
import * as cache from '../cache.js';
import { el } from '../dom.js';
import { moreView } from '../views/more.js';
import { reviewView } from '../views/review.js';
import { formContext } from './context.js';
import { $, go, today, FRESH_MS, isCurrent, clock, refreshLink, drawSaved, showError, showPending } from './state.js';

/**
 * The More screen (saved copy first, as with the calendar), from one request (RT, 2026-09-25:
 * five made it slow).
 * @param {number} mine
 * @param {boolean} [force]  ask the server even if the saved copy is fresh
 * @param {boolean} [fresh]  and have the server rebuild its answer
 */
export async function showMore(mine, force = false, fresh = false) {
  const saved = cache.read('more');
  const draw = (/** @type {any} */ data) => moreView(formContext(), data, { openReview: () => go({ screen: 'review' }), today: today() });
  const savedView = saved ? drawSaved(() => draw(saved.data)) : null;
  if (saved && savedView && !force && Date.now() - saved.at < FRESH_MS) {
    $('main').replaceChildren(savedView, refreshLink(`Updated ${clock(saved.at)}`));
    return;
  }
  if (savedView) $('main').replaceChildren(savedView, el('p', { class: 'status muted' }, 'Updating…'));
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    const r = await call('app.more', fresh ? { fresh: true } : {});
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    showPending(r.data.pending);
    cache.write('more', r.data);
    $('main').replaceChildren(draw(r.data), refreshLink(`Updated ${clock(Date.now())}`));
  } catch (e) {
    if (!isCurrent(mine)) return;
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * The review inbox (saved copy first).
 * @param {number} mine
 */
export async function showReview(mine) {
  const saved = cache.read('review');
  const draw = (/** @type {any} */ inbox) => reviewView(formContext(), inbox);
  const savedView = saved ? drawSaved(() => draw(saved.data)) : null;
  if (savedView) $('main').replaceChildren(savedView, el('p', { class: 'status muted' }, 'Updating…'));
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  try {
    const r = await call('review.inbox');
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write('review', r.data);
    showPending(r.data.count);
    $('main').replaceChildren(draw(r.data), refreshLink(`Updated ${clock(Date.now())}`));
  } catch (e) {
    if (!isCurrent(mine)) return;
    showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
  }
}
