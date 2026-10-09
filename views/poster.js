// @ts-check

import { el } from '../dom.js';
import { openSheet } from './sheet.js';
import { field, input, select } from './fields.js';
import { app } from '../app/state.js';
import { photoUrl } from '../photos.js';
import { drawPoster, loaded } from '../poster.js';

/**
 * The year's mosaic poster (ADR-113, M52a): choose a size, see a preview drawn from the photos'
 * small copies. Saving it at print size comes in M52b.
 */

const KEY = 'fc.poster';
/** The last size and orientation chosen, else A3 portrait (ADR-113). */
function remembered() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.size === 'string' && typeof saved.orientation === 'string') return saved;
  } catch (e) { /* first time, or storage blocked */ }
  return { size: 'A3', orientation: 'PORTRAIT' };
}
/** @param {{ size: string, orientation: string }} choice */
function remember(choice) {
  try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (e) { /* this visit only */ }
}

/** The page sizes offered, as the server lists them; this list until it answers. */
const SIZES = [['8x10', '8×10″'], ['A4', 'A4'], ['12x12', '12×12″'], ['11x14', '11×14″'], ['12x16', '12×16″'], ['A3', 'A3'], ['16x20', '16×20″']];

/**
 * A photo's small copy, opened for drawing.
 * @param {import('../poster.js').PosterPhoto} p
 */
async function smallCopy(p) {
  const url = await photoUrl(p.thumb_id);
  return url ? loaded(url) : null;
}

/**
 * @param {import('./forms.js').FormContext} ctx
 * @param {number} year
 */
export function posterSheet(ctx, year) {
  const start = remembered();
  const size = select(start.size, /** @type {Array<[string, string]>} */ (SIZES));
  const orientation = select(start.orientation, [['PORTRAIT', 'Portrait (tall)'], ['LANDSCAPE', 'Landscape (wide)']]);
  const line = input('text', null, { placeholder: 'optional, e.g. Our year', maxlength: '80' });
  const status = el('p', { class: 'muted small poster-status' }, 'Laying out…');
  const notes = el('div', { class: 'poster-notes' });
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas', { class: 'poster-preview', 'aria-label': `Preview of the ${year} poster` }));
  let asked = 0;

  const refresh = async () => {
    const mine = ++asked;
    const choice = { size: size.get() ?? 'A3', orientation: orientation.get() ?? 'PORTRAIT' };
    remember(choice);
    status.textContent = 'Laying out…';
    status.hidden = false;
    const r = await ctx.call('milestones.poster', { year, ...choice, line: line.get() ?? '' });
    if (mine !== asked) return;
    if (!r.ok) { status.textContent = `Could not lay out the poster: ${r.errors.map((e) => e.message).join('; ')}`; return; }
    /** @type {import('../poster.js').Poster} */
    const poster = r.data.poster;
    notes.replaceChildren(...poster.problems.map((p) => el('div', { class: p.code === 'EMPTY' ? 'msg' : 'msg warning' }, p.message,
      p.suggest ? el('button', { class: 'link', type: 'button', onclick: () => { size.node.value = /** @type {string} */ (p.suggest); refresh(); } }, ` Use ${SIZES.find(([k]) => k === p.suggest)?.[1] ?? p.suggest}`) : '')));
    // Sharp on the phone's screen: its own pixels, the page's shape.
    const width = Math.round((canvas.clientWidth || 320) * (window.devicePixelRatio || 1));
    canvas.width = width;
    canvas.height = Math.round(width * (poster.height / poster.width));
    status.textContent = 'Drawing the preview…';
    await drawPoster(canvas, poster, /** @type {any} */ (app.theme), smallCopy);
    if (mine !== asked) return;
    status.hidden = true;
    canvas.dataset.tiles = String(poster.tiles.length);
  };

  let typing = 0;
  size.node.addEventListener('change', refresh);
  orientation.node.addEventListener('change', refresh);
  line.node.addEventListener('input', () => { clearTimeout(typing); typing = window.setTimeout(refresh, 600); });

  const form = el('div', { class: 'form' },
    el('div', { class: 'row' }, field('Size', size.node), field('Shape', orientation.node)),
    field('Line beside the year', line.node),
    notes, status, canvas,
    el('p', { class: 'muted small' }, 'In date order; highlights get a big tile, with up to 2 more photos ticked "On poster". Drawn here from small copies: saving at print size comes next.'));
  openSheet(`Poster ${year}`, form);
  // Laid out once the sheet is on screen, so the preview knows its width (a timer: animation frames wait while the page is hidden).
  setTimeout(() => { refresh(); }, 0);
}
