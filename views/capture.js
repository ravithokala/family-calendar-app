// @ts-check

import { el, niceDate } from '../dom.js';
import { eventSheet, routineSheet, reminderSheet } from './forms.js';
import { openSheet, showIssues, toast } from './sheet.js';
import { busy } from './fields.js';

/**
 * Quick Capture (ADR-083): type, or tap the keyboard's microphone and speak (ADR-041); the server
 * reads the line and the matching form opens filled in. Nothing is saved until the form is.
 *
 * @typedef {{ kind: 'EVENT'|'ROUTINE'|'REMINDER'|'CANCEL', title: string, people: string[], start_date: string|null,
 *   end_date: string|null, start_time: string|null, end_time: string|null, event_type: string|null, days: string[],
 *   category: string|null, activity_id: string|null, missing: string[] }} Proposal
 */

const ADULTS = ['RT', 'G'];

/** @param {Proposal} p */
const note = (p) => (p.missing.length ? `Still needed: ${p.missing.join(', ')}.` : 'Check the details, then save.');

/**
 * Opens the form a proposal belongs to.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Proposal} p
 * @param {Array<Record<string, any>>} targets  for a cancellation: the events it could mean
 * @param {string|null} me  the signed-in application user
 */
function openFor(ctx, p, targets, me) {
  if (p.kind === 'ROUTINE') {
    routineSheet(ctx, { person: p.people[0], name: p.title, category: p.category, days: p.days, start: p.start_time, end: p.end_time, note: note(p) });
  } else if (p.kind === 'REMINDER') {
    // "Renew C passport": the children named are what it is about; whoever does it is an adult.
    const adults = p.people.filter((x) => ADULTS.includes(x));
    reminderSheet(ctx, undefined, {
      title: p.title, owner: adults.length ? adults : me ? [me] : [], related: p.people.filter((x) => !ADULTS.includes(x)),
      from: p.start_date, until: p.end_date, note: note(p),
    });
  } else if (p.kind === 'CANCEL') {
    const list = targets.length === 0
      ? el('p', { class: 'muted' }, `Nothing matching "${p.title}"${p.start_date ? ` on ${niceDate(p.start_date)}` : ''} is on the calendar. Open the day to cancel something by hand.`)
      : el('div', { class: 'card-actions' }, targets.map((t) => el('button', { class: 'danger wide', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('events.cancel', { event_id: t.event_id }));
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved(`Cancelled "${t.title}" on ${niceDate(t.start_date)}.`, r);
      } }, `Cancel ${niceDate(t.start_date)}${t.start_time ? ` ${t.start_time}` : ''} · ${t.participants.join('+')} · ${t.title}`)));
    const sheet = openSheet('Cancel', el('div', { class: 'form' }, list));
  } else {
    eventSheet(ctx, {
      prefill: { title: p.title, event_type: p.event_type, start_date: p.start_date, end_date: p.end_date, start_time: p.start_time, end_time: p.end_time, participants: p.people },
      note: note(p),
    });
  }
}

/**
 * A 🎤 button that fills the box by speech, using the browser's own speech recognition (Chrome on
 * Android, recent Safari). Only shown where the browser supports it; the keyboard's own mic works
 * everywhere (ADR-041). The browser sends the audio to its speech service (Google or Apple); the app
 * keeps no audio.
 * @param {HTMLTextAreaElement} box
 * @returns {HTMLElement|null}
 */
function micButton(box) {
  const w = /** @type {any} */ (window);
  const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Recognition) return null;
  const button = /** @type {HTMLButtonElement} */ (el('button', { class: 'mic', type: 'button', 'aria-label': 'Speak' }, '🎤'));
  /** @type {any} */
  let listening = null;
  const stop = () => {
    listening = null;
    button.classList.remove('on');
    button.textContent = '🎤';
  };
  button.addEventListener('click', () => {
    if (listening) { listening.stop(); return; }
    const r = new Recognition();
    r.lang = 'en-GB';
    r.interimResults = true;
    r.continuous = false;
    const before = box.value.trim();
    r.onresult = (/** @type {any} */ e) => {
      const heard = [...e.results].map((res) => res[0].transcript).join(' ').trim();
      box.value = [before, heard].filter(Boolean).join(' ');
    };
    r.onerror = (/** @type {any} */ e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Microphone not allowed. Allow it for this app, or use the keyboard\'s mic.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`Could not listen (${e.error}). Try the keyboard's mic.`);
    };
    r.onend = stop;
    try {
      r.start();
      listening = r;
      button.classList.add('on');
      button.textContent = '■';
    } catch (err) {
      stop();
      toast("Could not start listening. Try the keyboard's mic.");
    }
  });
  return button;
}

/**
 * The Quick Capture box, for the top of the Add sheet.
 * @param {import('./forms.js').FormContext} ctx
 * @param {() => void} close  closes the Add sheet
 * @param {string|null} me
 */
export function captureBox(ctx, close, me) {
  const box = /** @type {HTMLTextAreaElement} */ (el('textarea', {
    rows: '2', class: 'capture-input', enterkeyhint: 'go',
    placeholder: 'Type or tap the mic: "GP for R next Tue 4pm", "no chess Saturday", "C chess every Thursday 5pm"',
  }));
  const go = /** @type {HTMLButtonElement} */ (el('button', { class: 'primary', type: 'button' }, 'Go'));
  const run = async () => {
    const text = box.value.trim();
    if (!text) { box.focus(); return; }
    const r = await busy(go, () => ctx.call('capture.parse', { text }));
    if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
    close();
    openFor(ctx, r.data.proposal, r.data.targets, me);
  };
  go.addEventListener('click', run);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
  setTimeout(() => box.focus(), 50);
  return el('div', { class: 'capture' }, el('label', { class: 'capture-label' }, 'Quick capture'), el('div', { class: 'capture-row' }, box, micButton(box), go));
}
