// @ts-check

import { el } from '../dom.js';
import { busy } from './fields.js';
import { toast } from './sheet.js';

/**
 * More → Household Admin (ADR-099): reminders from Household Admin come in with every refresh run
 * (4 a day); this brings changes in straight away. The counts say what changed; the calendar redraws.
 * @param {import('./forms.js').FormContext} ctx
 */
export function householdSection(ctx) {
  /** @param {Event} ev */
  const run = async (ev) => {
    let r;
    try {
      r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('household.sync', {}));
    } catch (e) {
      toast(`Could not sync: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!r.ok) { toast(`Could not sync: ${r.errors.map((e) => e.message).join('; ')}`); return; }
    const d = r.data;
    const changes = [d.created ? `${d.created} added` : '', d.updated ? `${d.updated} updated` : '', d.done + d.cancelled ? `${d.done + d.cancelled} closed` : '']
      .filter(Boolean);
    const unknown = d.unknown ? ` ${d.unknown} item${d.unknown === 1 ? ' has' : 's have'} a code this calendar does not know (see System check).` : '';
    const unreadable = d.unreadable ? ` ${d.unreadable} item${d.unreadable === 1 ? ' has' : 's have'} a due date that cannot be read: set it in Household Admin.` : '';
    ctx.saved(`Household Admin: ${changes.length ? changes.join(', ') : 'already up to date'}.${unknown}${unreadable}`, r);
  };
  return el('section', { id: 'household' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Household Admin')),
    el('button', { class: 'wide-button', type: 'button', onclick: run }, '⟳ Sync from Household Admin'),
    el('p', { class: 'muted small' }, 'Renewals ticked "Show on the family calendar" there appear here as reminders. They update 4 times a day on their own; sync to bring changes in now.'));
}
