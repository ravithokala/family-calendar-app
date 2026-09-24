// @ts-check

import { el, niceDate } from '../dom.js';
import { eventSheet } from './forms.js';
import { busy } from './fields.js';
import { toast } from './sheet.js';

/**
 * The review inbox (ADR-074, ADR-082): what sources propose, waiting for RT or G. Nothing reaches
 * the calendar until it is approved here.
 *
 * @typedef {Record<string, any>} Rec  an Event or Candidate record, as the server sends it
 * @typedef {{ change: Rec, candidate: Rec|null, target: Rec|null, source_title: string|null, similar: Rec[] }} ChangeEntry
 * @typedef {{ candidate: Rec, reason: string, options: Rec[], source_title: string|null, similar: Rec[] }} AttentionEntry
 * @typedef {{ changes: ChangeEntry[], attention: AttentionEntry[], count: number }} Inbox
 */

const LABELS = /** @type {Record<string, string>} */ ({
  ADD_EVENT: 'New event', UPDATE_EVENT: 'Changed event', CANCEL_EVENT: 'Cancellation', POSSIBLY_REMOVED: 'Missing from the latest source',
});

/** @param {Rec} r */
function summary(r) {
  const time = r.start_time ? `${r.start_time}${r.end_time ? `–${r.end_time}` : ''}` : '';
  return [r.start_date ? niceDate(r.start_date) : 'no date', time, (r.participants ?? []).join('+'), r.title].filter(Boolean).join(' · ');
}

/**
 * An Event or Candidate as the event form's starting point.
 * @param {Rec} r
 * @returns {import('./parts.js').AppItem}
 */
function asItem(r) {
  const allDay = r.all_day ?? !r.start_time;
  return {
    event_id: r.event_id ?? '', title: r.title ?? '', label: r.title ?? '', tone: '', icon: '', event_type: r.event_type ?? 'APPOINTMENT',
    all_day: allDay, start_time: r.start_time ?? null, end_time: r.end_time ?? null, span: null,
    participants: r.participants ?? [], related_people: r.related_people ?? [], location: r.location ?? null, notes: r.notes ?? null,
    routine: false, edit: { start_date: r.start_date ?? null, end_date: r.end_date ?? null, calendars: r.calendars ?? [], icon: r.icon ?? null, all_day: allDay },
  };
}

/** @param {Rec[]} similar */
const similarNote = (similar) => (similar?.length
  ? el('div', { class: 'msg warning' }, `Possibly already on the calendar: ${similar.map(summary).join('; ')}`) : '');

/**
 * @param {import('./forms.js').FormContext} ctx
 * @param {Inbox} inbox
 */
export function reviewView(ctx, inbox) {
  /**
   * A button that sends one decision and refreshes.
   * @param {string} label
   * @param {string} cls
   * @param {string} action
   * @param {Record<string, unknown>} payload
   * @param {string} done
   */
  const decide = (label, cls, action, payload, done) => el('button', { class: cls, type: 'button', onclick: async (/** @type {Event} */ ev) => {
    const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call(action, payload));
    if (r.ok) ctx.saved(done, r);
    else toast(r.errors.map((e) => e.message).join('; '));
  } }, label);

  /** @param {ChangeEntry} entry */
  function changeCard({ change, candidate, target, source_title: sourceTitle, similar }) {
    const id = { change_id: change.change_id };
    const approveWith = (/** @type {string} */ heading, /** @type {Rec} */ baseline) => el('button', { class: 'secondary', type: 'button',
      onclick: () => eventSheet(ctx, { item: asItem(baseline), review: { heading, send: (corrections) => ctx.call('review.approve', { ...id, corrections }) } }) },
    'Edit & approve');
    /** @type {unknown[]} */
    let body = [];
    /** @type {unknown[]} */
    let buttons = [];
    if (change.change_type === 'ADD_EVENT' && candidate) {
      body = [el('div', {}, summary(candidate)), similarNote(similar)];
      buttons = [decide('Add', 'primary', 'review.approve', id, `Added "${candidate.title}".`), approveWith('New event', candidate),
        decide('Reject', 'secondary', 'review.reject', id, 'Rejected; nothing added.')];
    } else if (change.change_type === 'UPDATE_EVENT' && target) {
      const oldValue = JSON.parse(change.old_value || '{}');
      const newValue = JSON.parse(change.new_value || '{}');
      body = [el('div', {}, summary(target)), el('ul', { class: 'diff' }, Object.keys(newValue).map((k) => el('li', {},
        `${k.replace(/_/g, ' ')}: `, el('del', {}, String(oldValue[k] ?? '—')), ' → ', el('ins', {}, String(newValue[k] ?? '—')))))];
      buttons = [decide('Apply', 'primary', 'review.approve', id, `Updated "${target.title}".`), approveWith('Changed event', { ...target, ...newValue }),
        decide('Keep as is', 'secondary', 'review.reject', id, 'Kept as it was.')];
    } else if (change.change_type === 'CANCEL_EVENT' && target) {
      body = [el('div', {}, summary(target))];
      buttons = [decide('Cancel it', 'danger', 'review.approve', id, `Cancelled "${target.title}".`), decide('Keep it', 'secondary', 'review.reject', id, 'Kept.')];
    } else if (target) {
      body = [el('div', {}, summary(target)), el('div', { class: 'muted small' }, 'Not listed by the latest version of this source. It stays on the calendar unless you cancel it.')];
      buttons = [decide('Keep it', 'secondary', 'review.reject', id, 'Kept.'), decide('Cancel it', 'danger', 'review.approve', id, `Cancelled "${target.title}".`)];
    }
    return el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, LABELS[change.change_type] ?? change.change_type), el('span', { class: 'tag' }, sourceTitle ?? 'source')),
      body, el('div', { class: 'card-actions' }, buttons));
  }

  /** @param {AttentionEntry} entry */
  function attentionCard({ candidate, reason, options, source_title: sourceTitle, similar }) {
    const id = { candidate_id: candidate.candidate_id };
    const dismiss = decide('Dismiss', 'secondary', 'review.reject', id, 'Dismissed.');
    const buttons = candidate.kind === 'CANCEL'
      ? [...options.map((o) => decide(`Cancel ${summary(o)}`, 'danger wide', 'review.approve', { ...id, target_event_id: o.event_id }, `Cancelled "${o.title}".`)), dismiss]
      : [el('button', { class: 'primary', type: 'button', onclick: () => eventSheet(ctx, { item: asItem(candidate),
        review: { heading: 'Check and add', send: (corrections) => ctx.call('review.approve', { ...id, corrections }) } }) }, 'Check & add'), dismiss];
    return el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, candidate.kind === 'CANCEL' ? 'Cancellation?' : 'Needs checking'), el('span', { class: 'tag' }, sourceTitle ?? 'source')),
      el('div', {}, candidate.kind === 'CANCEL' ? `${candidate.title}${candidate.start_date ? ` · ${niceDate(candidate.start_date)}` : ''}` : summary(candidate)),
      el('div', { class: 'muted small' }, reason), similarNote(similar),
      el('div', { class: 'card-actions' }, buttons));
  }

  if (inbox.count === 0) return el('p', { class: 'muted' }, 'Nothing to review.');
  return el('div', {},
    el('p', { class: 'muted small' }, 'Proposed by sources. Nothing reaches the calendar until it is approved here.'),
    inbox.changes.map(changeCard), inbox.attention.map(attentionCard));
}
