// @ts-check

import { el } from '../dom.js';
import { toast } from './sheet.js';
import { installState, install, installHint, onInstallChange } from '../install.js';

/**
 * More → Install this app, at the bottom (ADR-108, app-kit's install.js): Android Chrome's ⋮ menu refuses to install a
 * second app from ravithokala.github.io, so the app offers its own button. Nothing is shown once the
 * app runs from its icon. The section redraws itself when Chrome's offer arrives (More is drawn from
 * its saved copy and does not redraw for it).
 */

/** Draws the section now on screen; More redraws itself on refresh, replacing it. */
let drawLatest = () => { /* no section yet */ };
onInstallChange(() => drawLatest());

export function installSection() {
  const section = el('section', { id: 'install-section' });
  const draw = () => {
    const state = installState();
    section.hidden = state === 'installed';
    section.replaceChildren(
      el('div', { class: 'section-head' }, el('h2', {}, 'Install this app')),
      ...(state === 'ready'
        ? [el('p', { class: 'muted small' }, 'Adds Family Cal to your home screen, so it opens full screen.'),
          el('button', { class: 'wide-button', type: 'button', onclick: async () => {
            if (await install() === 'accepted') toast('Installing… look for Family Cal on your home screen.');
          } }, 'Install this app')]
        : [el('p', { class: 'muted small' }, installHint())]));
  };
  drawLatest = draw;
  draw();
  return section;
}
