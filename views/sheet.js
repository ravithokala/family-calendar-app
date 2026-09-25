// @ts-check

import { el } from '../dom.js';

/**
 * A sheet that slides over the calendar (a native <dialog>, so Back and Escape close it).
 * @param {string} title
 * @param {HTMLElement} body
 * @returns {{ close: () => void, messages: HTMLElement }}
 */
export function openSheet(title, body) {
  const messages = el('div', { class: 'messages' });
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'sheet' },
    el('div', { class: 'sheet-head' },
      el('h2', {}, title),
      el('button', { class: 'link', type: 'button', onclick: () => dialog.close() }, 'Close')),
    messages,
    body));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return { close: () => dialog.close(), messages };
}

/**
 * Shows a server answer's errors and warnings in a sheet's message area.
 * @param {HTMLElement} target
 * @param {{ errors: Array<{ field: string, message: string }>, warnings: Array<{ message: string }> }} r
 */
export function showIssues(target, r) {
  target.replaceChildren(
    ...r.errors.map((e) => el('div', { class: 'msg error' }, e.field && e.field !== 'request' ? `${e.field.replace(/_/g, ' ')}: ${e.message}` : e.message)),
    ...r.warnings.map((w) => el('div', { class: 'msg warning' }, w.message)));
}

let toastTimer = 0;

/** How long an Undo stays offered (ADR-087). */
const UNDO_MS = 8000;

/**
 * A short message at the bottom of the screen: what was saved, plus any warnings, and an Undo
 * button when what was done takes something away (ADR-087).
 * @param {string} text
 * @param {Array<{ message: string }>} [warnings]
 * @param {() => void} [undo]
 */
export function toast(text, warnings = [], undo) {
  document.getElementById('toast')?.remove();
  const box = el('div', { id: 'toast', class: `${warnings.length ? 'has-warnings' : ''}${undo ? ' has-undo' : ''}`, onclick: () => box.remove() },
    el('div', { class: 'toast-row' }, el('div', {}, text),
      undo ? el('button', { class: 'undo', type: 'button', onclick: (/** @type {Event} */ ev) => { ev.stopPropagation(); box.remove(); undo(); } }, 'Undo') : ''),
    warnings.map((w) => el('div', { class: 'warn' }, w.message)));
  document.body.append(box);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box.remove(), undo ? UNDO_MS : warnings.length ? 9000 : 3000);
}
