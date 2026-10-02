// @ts-check

import { call } from '../api.js';
import * as cache from '../cache.js';
import { el } from '../dom.js';
import { moreView } from '../views/more.js';
import { reviewView } from '../views/review.js';
import { formContext } from './context.js';
import { $, go, today, FRESH_MS, isCurrent, clock, showUpdated, showUpdating, showFetched, drawSaved, showError, showPending } from './state.js';

/**
 * A refresh that failed: the saved copy stays on screen with a note above it, as on Month; only
 * with nothing saved is the screen the message alone (RT, 2026-10-03: More went blank offline).
 * @param {unknown} e
 * @param {{ at: number } | null} saved
 * @param {HTMLElement|null} savedView
 */
function refreshFailed(e, saved, savedView) {
  const reason = e instanceof Error ? e.message : String(e);
  if (saved && savedView) {
    $('main').replaceChildren(el('div', { class: 'msg warning' }, `Could not refresh: ${reason}. Showing ${clock(saved.at)}.`), savedView);
    showUpdated(saved.at);
  } else {
    showError(`Could not load: ${reason}`);
    showUpdated(null);
  }
}

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
    $('main').replaceChildren(savedView);
    showUpdated(saved.at);
    return;
  }
  if (savedView) $('main').replaceChildren(savedView);
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  showUpdating();
  try {
    const r = await call('app.more', fresh ? { fresh: true } : {});
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    showPending(r.data.pending);
    cache.write('more', r.data);
    // Timed before drawing: More itself shows the load times.
    showFetched('More');
    $('main').replaceChildren(draw(r.data));
  } catch (e) {
    if (!isCurrent(mine)) return;
    refreshFailed(e, saved, savedView);
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
  if (savedView) $('main').replaceChildren(savedView);
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  showUpdating();
  try {
    const r = await call('review.inbox');
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    cache.write('review', r.data);
    showPending(r.data.count);
    $('main').replaceChildren(draw(r.data));
    showFetched('Review');
  } catch (e) {
    if (!isCurrent(mine)) return;
    refreshFailed(e, saved, savedView);
  }
}
