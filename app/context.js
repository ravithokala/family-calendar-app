// @ts-check

import { call } from '../api.js';
import * as cache from '../cache.js';
import { toast } from '../views/sheet.js';
import { app, go } from './state.js';

/**
 * What the forms need: the vocabularies, the API, and what to do after a save: mark saved
 * screens out of date, redraw from the server, and say what happened, with Undo when offered.
 * @returns {import('../views/forms.js').FormContext}
 */
export const formContext = () => ({
  meta: app.meta,
  call,
  openList: (/** @type {string} */ listId) => go({ screen: 'lists', list: listId }),
  saved: (message, r, undo) => {
    // Saved copies stay on screen while they refresh, instead of a first-time "Loading…" (RT, 2026-09-25).
    cache.staleCalendar();
    cache.stale('more');
    cache.stale('review');
    cache.stale('lists');
    cache.stale('search');
    toast(message, r.warnings, undo && (() => undoSaved(undo)));
    app.show(true);
  },
});

/**
 * Runs an Undo from the message, then refreshes like any save (ADR-087).
 * @param {() => Promise<import('../api.js').ApiResponse>} undo
 */
async function undoSaved(undo) {
  toast('Undoing…');
  try {
    const r = await undo();
    if (!r.ok) { toast(`Could not undo: ${r.errors.map((e) => e.message).join('; ')}`); return; }
    formContext().saved('Undone.', r);
  } catch (e) {
    toast(`Could not undo: ${e instanceof Error ? e.message : String(e)}`);
  }
}
