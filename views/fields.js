// @ts-check

import { el } from '../dom.js';

/**
 * Form fields for the app's sheets. Each returns the element and a way to read its value, so
 * forms stay plain data in, plain data out; the server validates everything.
 */

/**
 * A labelled control. A group of chips is not put inside a <label>: a label passes a tap on to its
 * first button, so on iPhone choosing one person also toggled the first chip, RT (RT, 2026-10-02).
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [cls]
 */
export const field = (label, control, cls = '') => (control.classList.contains('chips')
  ? el('div', { class: `field ${cls}`, role: 'group', 'aria-label': label }, el('span', {}, label), control)
  : el('label', { class: `field ${cls}` }, el('span', {}, label), control));

/**
 * @param {string} type  text, date, time
 * @param {string|null} value
 * @param {Record<string, unknown>} [attrs]
 */
export function input(type, value, attrs = {}) {
  const node = /** @type {HTMLInputElement} */ (el('input', { type, value: value ?? '', ...attrs }));
  return { node, get: () => node.value.trim() || null };
}

/**
 * @param {string|null} value
 * @param {Array<[string, string]>} options  [value, label]
 */
export function select(value, options) {
  const node = /** @type {HTMLSelectElement} */ (el('select', {}, options.map(([v, label]) => el('option', { value: v, selected: v === value }, label))));
  return { node, get: () => node.value || null };
}

/**
 * @param {boolean} value
 * @param {string} label
 */
export function checkbox(value, label) {
  const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', checked: value }));
  return { node: el('label', { class: 'check' }, box, el('span', {}, label)), box, get: () => box.checked };
}

/**
 * Toggle chips for choosing people (or any short codes).
 * @param {string[]} options
 * @param {string[]} chosen
 * @param {{ single?: boolean }} [opts]
 */
export function chips(options, chosen, opts = {}) {
  const selected = new Set(chosen);
  /** @type {Array<() => void>} */
  const listeners = [];
  // The buttons are made once and only their pressed state changes: replacing a button while it is
  // being tapped confuses where the tap landed (iPhone).
  const buttons = options.map((o) => el('button', {
    type: 'button',
    onclick: () => {
      if (opts.single) { selected.clear(); selected.add(o); } else if (selected.has(o)) selected.delete(o); else selected.add(o);
      draw();
      listeners.forEach((fn) => fn());
    },
  }, o));
  const draw = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(selected.has(options[i]))));
  const node = el('div', { class: 'chips' }, buttons);
  draw();
  return { node, get: () => options.filter((o) => selected.has(o)), onChange: (/** @type {() => void} */ fn) => listeners.push(fn) };
}

/**
 * A form's Save button, which disables itself while saving.
 * @param {string} label
 * @param {() => Promise<void>} save
 */
export function saveButton(label, save) {
  const button = /** @type {HTMLButtonElement} */ (el('button', { class: 'primary', type: 'button' }, label));
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await save();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  return button;
}

/**
 * Runs a server request from a button, disabled and saying so until the answer comes back, so it
 * cannot be pressed twice.
 * @template T
 * @param {HTMLButtonElement} button
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function busy(button, work) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
