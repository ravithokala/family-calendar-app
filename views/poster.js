// @ts-check

import { el } from '../dom.js';
import { openSheet } from './sheet.js';
import { field, input, select } from './fields.js';
import { app } from '../app/state.js';
import { photoUrl } from '../photos.js';
import { drawPoster, loaded } from '../poster.js';

/**
 * The year's mosaic poster (ADR-113): choose a size, see a preview drawn from the photos' small
 * copies (M52a), then make the print file from the full photos and save or share it (M52b).
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

/** Print resolution aimed for. */
const DPI = 300;
/**
 * The largest canvas this phone can draw, in pixels: Safari on an iPhone or iPad stops at about 16.7
 * million (ADR-113); elsewhere a limit that keeps a 16×20″ print at full resolution without running
 * an older phone out of memory.
 */
const isApple = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const maxPixels = () => (isApple() ? 16_777_216 : 36_000_000);

/**
 * The print file's size in pixels for a page, and the resolution that gives.
 * @param {{ width: number, height: number }} page  mm
 */
export function printPixels(page) {
  const inches = (page.width / 25.4) * (page.height / 25.4);
  const dpi = Math.min(DPI, Math.floor(Math.sqrt(maxPixels() / inches)));
  return { width: Math.round((page.width / 25.4) * dpi), height: Math.round((page.height / 25.4) * dpi), dpi };
}

/**
 * A photo at full size, opened for drawing: from the phone's store, else once through the server.
 * @param {import('../poster.js').PosterPhoto} p
 */
async function fullCopy(p) {
  const url = await photoUrl(p.file_id);
  return url ? loaded(url) : null;
}

/** @param {number} bytes */
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Saves the print file: the share sheet where the phone has one (Save to Photos or Files, a print
 * shop's app), else a download. Needs a fresh tap: browsers only share straight after one.
 * @param {Blob} blob
 * @param {string} name
 * @returns {Promise<string>}  what happened, for the status line
 */
async function share(blob, name) {
  const file = new File([blob], name, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'Shared.';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'Not shared. Tap again to share or save it.';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = /** @type {HTMLAnchorElement} */ (el('a', { href: url, download: name }));
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'Saved to the phone\'s downloads.';
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
  const saveArea = el('div', { class: 'poster-save' });
  let asked = 0;
  /** @type {import('../poster.js').Poster|null} the layout shown in the preview */
  let shown = null;

  /** The button that makes the print file, with what it will be. */
  const makeButton = () => {
    if (!shown || shown.tiles.length === 0) { saveArea.replaceChildren(); return; }
    const px = printPixels(shown);
    const label = SIZES.find(([k]) => k === shown?.size)?.[1] ?? shown.size;
    saveArea.replaceChildren(
      el('button', { class: 'primary wide-button poster-make', type: 'button', onclick: () => makePrint(/** @type {import('../poster.js').Poster} */ (shown)) }, 'Make the print file'),
      el('p', { class: 'muted small' }, `${label} ${shown.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'}, ${px.width} × ${px.height} pixels (${px.dpi} dpi)${px.dpi < DPI
        ? `: the most this phone can draw, still fine for a wall` : ''}. The full photos come through the server the first time, so it can take a minute.`));
  };

  /**
   * Draws the poster at print size from the full photos, then offers it to save or share.
   * @param {import('../poster.js').Poster} poster
   */
  const makePrint = async (poster) => {
    const mine = asked;
    const px = printPixels(poster);
    const total = poster.tiles.reduce((n, t) => n + t.photos.length, 0);
    let done = 0;
    const progress = el('p', { class: 'muted small poster-progress' }, total ? `Photo 0 of ${total}…` : 'Drawing…');
    saveArea.replaceChildren(progress);
    const big = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
    big.width = px.width;
    big.height = px.height;
    try {
      await drawPoster(big, poster, /** @type {any} */ (app.theme), async (p) => {
        const img = await fullCopy(p);
        done += 1;
        progress.textContent = `Photo ${done} of ${total}…`;
        return img;
      });
      progress.textContent = 'Making the JPEG…';
      const blob = await new Promise((resolve) => big.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('this phone could not make a picture that large; try a smaller size');
      if (mine !== asked) return; // the size was changed meanwhile
      const label = SIZES.find(([k]) => k === poster.size)?.[1] ?? poster.size;
      const name = `Milestones ${year} ${label.replace('″', 'in')} ${poster.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait'}.jpg`;
      const result = el('p', { class: 'muted small' }, `Ready: ${px.width} × ${px.height} pixels, ${megabytes(/** @type {Blob} */ (blob).size)}.`);
      saveArea.replaceChildren(
        el('button', { class: 'primary wide-button poster-share', type: 'button', 'data-bytes': String(/** @type {Blob} */ (blob).size),
          onclick: async () => { result.textContent = await share(/** @type {Blob} */ (blob), name); } }, 'Save or share the poster'),
        result);
    } catch (e) {
      saveArea.replaceChildren(el('div', { class: 'msg warning' }, `Could not make the print file: ${e instanceof Error ? e.message : String(e)}.`));
      setTimeout(makeButton, 0);
    } finally {
      // Hand the memory back: a print-size canvas is tens of megabytes.
      big.width = 0;
      big.height = 0;
    }
  };

  const refresh = async () => {
    const mine = ++asked;
    shown = null;
    saveArea.replaceChildren();
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
    shown = poster;
    makeButton();
  };

  let typing = 0;
  size.node.addEventListener('change', refresh);
  orientation.node.addEventListener('change', refresh);
  line.node.addEventListener('input', () => { clearTimeout(typing); typing = window.setTimeout(refresh, 600); });

  const form = el('div', { class: 'form' },
    el('div', { class: 'row' }, field('Size', size.node), field('Shape', orientation.node)),
    field('Line beside the year', line.node),
    notes, status, canvas, saveArea,
    el('p', { class: 'muted small' }, 'In date order; highlights get a big tile, with up to 2 more photos ticked "On poster". The preview is drawn from small copies; the print file from the full photos.'));
  openSheet(`Poster ${year}`, form);
  // Laid out once the sheet is on screen, so the preview knows its width (a timer: animation frames wait while the page is hidden).
  setTimeout(() => { refresh(); }, 0);
}
