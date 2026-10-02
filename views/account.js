// @ts-check

import { el } from '../dom.js';
import { busy } from './fields.js';
import { toast } from './sheet.js';
import { user, signOutOfGoogle } from '../auth.js';
import { signOut, signOutEverywhere } from '../api.js';
import * as cache from '../cache.js';

/**
 * More → Account (ADR-101): who is signed in, sign out of this phone, and sign out of every
 * device (a lost phone). Sign out used to be in the header, where it was never used (RT, 2026-10-02).
 */
export function accountSection() {
  /** This phone forgets its session and its saved answers, then starts again at sign-in. */
  const leave = () => {
    signOutOfGoogle();
    cache.clear();
    window.location.hash = '';
    window.location.reload();
  };
  /** @param {Event} ev */
  const everywhere = async (ev) => {
    if (!window.confirm('Sign out on every device where you are signed in, including this one?')) return;
    let r;
    try {
      r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => signOutEverywhere());
    } catch (e) {
      toast(`Could not sign out all devices: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!r.ok) { toast(`Could not sign out all devices: ${r.errors.map((e) => e.message).join('; ')}`); return; }
    leave();
  };
  return el('section', { id: 'account-section' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Account')),
    el('p', { class: 'muted small' }, user() ? `Signed in as ${user()}.` : 'Signed in.'),
    el('button', { class: 'wide-button', type: 'button', onclick: async () => { await signOut(); leave(); } }, 'Sign out of this phone'),
    el('button', { class: 'wide-button danger-text', type: 'button', onclick: everywhere }, 'Sign out all devices'),
    el('p', { class: 'muted small' }, 'For a lost phone: "Sign out all devices" ends your sign-in everywhere. The other person stays signed in.'));
}
