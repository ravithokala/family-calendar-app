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

/**
 * A short message at the bottom of the screen: what was saved, plus any warnings.
 * @param {string} text
 * @param {Array<{ message: string }>} [warnings]
 */
export function toast(text, warnings = []) {
  document.getElementById('toast')?.remove();
  const box = el('div', { id: 'toast', class: warnings.length ? 'has-warnings' : '', onclick: () => box.remove() },
    el('div', {}, text), warnings.map((w) => el('div', { class: 'warn' }, w.message)));
  document.body.append(box);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box.remove(), warnings.length ? 9000 : 3000);
}
