// @ts-check

import { el } from '../dom.js';
import { VERSION } from '../version.js';
import { phoneChecks } from '../checks.js';

/**
 * More → System (ADR-095): runs the server's read-only checks and shows one line each, then this
 * phone's own (ADR-105; app-kit's checks.js, the same in Household Admin). The last result is kept
 * in memory only, so it survives More redrawing but not a reload.
 *
 * @typedef {{ name: string, ok: boolean, detail: string, items?: string[] }} CheckLine  items: a short list under the line (Failed requests, ADR-109)
 * @typedef {{ running: true } | { result: import('../api.js').ApiResponse, phone: CheckLine[] }} CheckState
 */

/** @type {CheckState|null} */
let state = null;

/**
 * @param {import('./forms.js').FormContext} ctx
 */
export function systemSection(ctx) {
  const section = el('section', { id: 'system' });
  const draw = () => {
    const result = state && 'result' in state ? state.result : null;
    /** @type {CheckLine[]|null} */
    const checks = result?.ok && Array.isArray(result.data?.checks) ? result.data.checks : null;
    const phone = state && 'phone' in state ? state.phone : [];
    const failed = (checks ? checks.filter((c) => !c.ok).length : 0) + phone.filter((c) => !c.ok).length;
    const total = (checks ? checks.length : 0) + phone.length;
    /** @param {CheckLine} c */
    const line = (c) => el('li', { class: 'item plain' },
      el('div', { class: 'body' },
        el('div', {}, el('span', { class: c.ok ? 'check-ok' : 'check-fail', 'aria-label': c.ok ? 'Passed' : 'Failed' }, c.ok ? '✓ ' : '✕ '), c.name),
        el('div', { class: 'details' }, c.detail),
        c.items?.length ? el('ul', { class: 'details check-items' }, c.items.map((i) => el('li', {}, i))) : ''));
    const status = state && 'running' in state ? 'Checking… this can take up to a minute'
      : checks ? `${failed ? `${failed} of ${total} checks failed` : `All ${total} checks passed`}${typeof result?.data?.ms === 'number' ? ` · ${(result.data.ms / 1000).toFixed(1)} s` : ''}`
        : result ? `Could not run the check: ${result.errors?.[0]?.message ?? 'unknown'}`
          : 'Checks the workbook, routines, refresh runs, backups, Drive, Google sign-in and sessions.';
    const run = /** @type {HTMLButtonElement} */ (el('button', { class: 'wide-button', type: 'button', onclick: go }, checks ? '⚙ Run the system check again' : '⚙ Run system check'));
    if (state && 'running' in state) run.disabled = true;
    section.replaceChildren(
      el('div', { class: 'section-head' }, el('h2', {}, 'System')),
      run,
      el('p', { class: `muted small${failed ? ' overdue-text' : ''}`, role: 'status' }, status),
      checks ? el('ul', { class: 'items' }, checks.map(line)) : '',
      // This phone's own checks, whether or not the server answered.
      ...(phone.length ? [el('p', { class: 'muted small' }, 'This phone'), el('ul', { class: 'items' }, phone.map(line))] : []));
  };
  async function go() {
    if (state && 'running' in state) return;
    const mine = state = { running: /** @type {true} */ (true) };
    draw();
    /** @type {import('../api.js').ApiResponse} */
    let result;
    try {
      result = await ctx.call('system.check', {});
    } catch (e) {
      result = { ok: false, data: null, errors: [{ field: 'request', code: 'OFFLINE', message: 'no connection' }], warnings: [] };
    }
    const phone = Object.values(await phoneChecks(VERSION));
    if (state !== mine) return;
    state = { result, phone };
    draw();
  }
  draw();
  return section;
}
