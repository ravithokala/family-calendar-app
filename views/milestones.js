// @ts-check

import { el, niceDate } from '../dom.js';
import { openSheet, showIssues } from './sheet.js';
import { field, input, checkbox, chips, saveButton } from './fields.js';
import { toneStyle, icon } from './parts.js';
import { app } from '../app/state.js';
import { photoUrl, shrink } from '../photos.js';

/**
 * Milestones (ADR-112): the family's year as on RT's paper sheet. Months down the side, a column per
 * person (RT, G, C, R). The layout comes from the server (MilestoneLayout): a box spans neighbours,
 * breaks (dashed edge) around someone not in it, and fills the row for all four. Only the month is
 * shown; a known day is kept for later.
 *
 * @typedef {{ start: number, span: number, open_left: boolean, open_right: boolean }} Piece
 * @typedef {{ milestone_id: string, title: string, tone: string, pieces: Piece[] }} Placement
 * @typedef {{ file_id: string, thumb_id: string, width: number, height: number, focus_x: number, focus_y: number }} Photo
 * @typedef {{ milestone_id: string, title: string, date: string, people: string[], notes: string|null,
 *   event_id: string|null, event_title: string|null, icon?: string|null, highlight?: boolean, photos?: Photo[] }} Milestone
 * @typedef {{ year: number, columns: string[], months: Array<{ month: number, lines: Placement[][] }>,
 *   milestones: Milestone[], years: number[] }} MilestoneYear
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 Nov 2026", or "November 2026" when only the month is known. @param {string} date */
const whenText = (date) => (date.length === 7 ? `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` : `${niceDate(date)} ${date.slice(0, 4)}`);

/**
 * A photo's small copy as an <img>, filled in once it is had (from the phone, else the server).
 * @param {Photo} p
 * @param {string} cls
 */
function thumb(p, cls) {
  const img = /** @type {HTMLImageElement} */ (el('img', { class: cls, alt: '', style: { objectPosition: `${p.focus_x * 100}% ${p.focus_y * 100}%` } }));
  photoUrl(p.thumb_id).then((url) => { if (url) img.src = url; });
  return img;
}

/**
 * The year grid.
 * @param {import('./parts.js').Theme} theme
 * @param {MilestoneYear} data
 * @param {(m: Milestone) => void} onTap
 */
export function milestonesView(theme, data, onTap) {
  const byId = new Map(data.milestones.map((m) => [m.milestone_id, m]));
  const head = el('div', { class: 'ms-month ms-head' }, el('div', {}, ''),
    ...data.columns.map((c, i) => el('div', { class: 'ms-name', style: { gridColumn: String(i + 2) } }, c)));
  const months = data.months.map(({ month, lines }) => {
    const rows = Math.max(1, lines.length);
    return el('div', { class: 'ms-month', style: { gridTemplateRows: `repeat(${rows}, auto)` } },
      el('div', { class: 'ms-label', style: { gridRow: `1 / span ${rows}` } }, MONTHS[month - 1]),
      // Column lines, so an empty cell (or the gap in a broken box) still reads as that person's.
      ...data.columns.map((_, i) => el('div', { class: 'ms-col', style: { gridColumn: String(i + 2), gridRow: `1 / span ${rows}` } })),
      ...lines.flatMap((line, row) => line.flatMap((p) => p.pieces.map((piece, k) => {
        const m = byId.get(p.milestone_id);
        // The cover photo (or the icon when there is none) in the first piece only (ADR-113).
        const cover = k === 0 && m?.photos?.length ? thumb(m.photos[0], 'ms-thumb') : null;
        const drawn = k === 0 && !cover && m?.icon ? icon(theme, m.icon) : null;
        return el('button', {
          type: 'button',
          class: `ms-box${piece.open_left ? ' open-left' : ''}${piece.open_right ? ' open-right' : ''}`,
          style: { ...toneStyle(theme, p.tone), gridColumn: `${piece.start + 2} / span ${piece.span}`, gridRow: String(row + 1) },
          onclick: () => { if (m) onTap(m); },
        }, cover ?? drawn ?? '', el('span', {}, p.title));
      }))));
  });
  const none = data.milestones.length === 0
    ? el('p', { class: 'muted small' }, `No milestones in ${data.year} yet. Add one with +, or with "Add as milestone" on an event.`) : '';
  return el('div', { class: 'milestones' }, none, el('div', { class: 'ms-grid' }, head, ...months));
}

/**
 * The years to jump to, newest first, each with how many milestones it has.
 * @param {number[]} years
 * @param {Record<string, number>} counts
 * @param {number} current
 * @param {(year: number) => void} pick
 */
export function yearPicker(years, counts, current, pick) {
  const list = el('div', { class: 'year-list' }, [...years].sort((a, b) => b - a).map((y) => el('button', {
    type: 'button', class: `wide-button${y === current ? ' current' : ''}`, 'aria-current': String(y === current),
    onclick: () => { sheet.close(); pick(y); },
  }, `${y} · ${counts[String(y)] ? `${counts[String(y)]} milestone${counts[String(y)] === 1 ? '' : 's'}` : 'none yet'}`)));
  const sheet = openSheet('Milestones: choose a year', el('div', { class: 'form' }, list,
    el('p', { class: 'muted small' }, 'For an earlier year with none yet, add a milestone with its date: its year then appears here.')));
}

/**
 * Add a milestone, or edit one: what, when (a day, or only the month), who, a note.
 * @param {import('./forms.js').FormContext} ctx
 * @param {{ milestone?: Milestone, title?: string, date?: string, people?: string[], event_id?: string|null, event_title?: string|null, icon?: string|null }} [prefill]
 */
export function milestoneSheet(ctx, prefill = {}) {
  const editing = prefill.milestone;
  const start = editing?.date ?? prefill.date ?? new Date().toISOString().slice(0, 10);
  const f = {
    title: input('text', editing?.title ?? prefill.title ?? null, { placeholder: 'e.g. Swimming level 1 done', maxlength: '80' }),
    monthOnly: checkbox(start.length === 7, 'I only know the month'),
    day: input('date', start.length === 10 ? start : null),
    month: input('month', start.slice(0, 7)),
    people: chips(ctx.meta.participants, editing?.people ?? prefill.people ?? []),
    notes: input('text', editing?.notes ?? null, { placeholder: 'optional' }),
    highlight: checkbox(editing?.highlight === true, 'Highlight: a big tile on the poster'),
  };
  // The drawn icons (ADR-113), shown when there is no photo; one or none.
  let chosenIcon = editing ? editing.icon ?? null : prefill.icon ?? null;
  // Untouched on a new one: the server fills it in from a linked event's activity.
  let iconTouched = Boolean(editing);
  const iconRow = el('div', { class: 'icon-picker' });
  const drawIcons = () => iconRow.replaceChildren(...[null, ...ctx.meta.icons].map((name) => el('button', {
    type: 'button', 'aria-pressed': String(name === chosenIcon), 'aria-label': name ?? 'No icon',
    onclick: () => { chosenIcon = name; iconTouched = true; drawIcons(); },
  }, name === null ? 'None' : icon(/** @type {any} */ (app.theme), name) ?? name)));
  drawIcons();
  const dayRow = field('Day', f.day.node);
  const monthRow = field('Month', f.month.node);
  const sync = () => { dayRow.hidden = f.monthOnly.get(); monthRow.hidden = !f.monthOnly.get(); };
  f.monthOnly.box.addEventListener('change', sync);
  sync();
  const eventId = editing ? editing.event_id : prefill.event_id ?? null;
  const eventTitle = editing ? editing.event_title : prefill.event_title ?? null;
  const form = el('div', { class: 'form' },
    eventTitle ? el('p', { class: 'muted small' }, `From the calendar: ${eventTitle}`) : '',
    field('What', f.title.node), f.monthOnly.node, dayRow, monthRow,
    field('Who', f.people.node), field('Note', f.notes.node),
    field(eventId && !editing ? 'Icon (when there is no photo; from the event if you leave it)' : 'Icon (when there is no photo)', iconRow), f.highlight.node,
    el('div', { class: 'actions' }, saveButton(editing ? 'Save' : 'Add milestone', async () => {
      const fields = { title: f.title.get(), date: f.monthOnly.get() ? f.month.get() : f.day.get(), people: f.people.get(), notes: f.notes.get(),
        ...(iconTouched ? { icon: chosenIcon } : {}), highlight: f.highlight.get() };
      const r = editing
        ? await ctx.call('milestones.update', { milestone_id: editing.milestone_id, changes: fields })
        : await ctx.call('milestones.add', { ...fields, ...(eventId ? { event_id: eventId } : {}) });
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      ctx.saved(editing ? `Saved "${fields.title}".` : `Added "${fields.title}" to the milestones.`, r);
    })));
  const sheet = openSheet(editing ? 'Edit milestone' : 'Add a milestone', form);
}

/**
 * A milestone tapped in the grid: what it records, with Edit and Remove (Undo brings it back).
 * @param {import('./forms.js').FormContext} ctx
 * @param {Milestone} m
 */
export function milestoneDetails(ctx, m) {
  const photos = m.photos ?? [];
  const status = el('p', { class: 'muted small', hidden: true });
  const picker = /** @type {HTMLInputElement} */ (el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true }));
  picker.addEventListener('change', async () => {
    const files = [...(picker.files ?? [])];
    if (files.length === 0) return;
    let last = null;
    for (const [i, file] of files.entries()) {
      status.hidden = false;
      status.textContent = `Adding photo ${i + 1} of ${files.length}…`;
      try {
        last = await ctx.call('milestones.addPhoto', { milestone_id: m.milestone_id, ...(await shrink(file)) });
      } catch (e) {
        last = { ok: false, data: null, errors: [{ field: '', code: 'PHOTO', message: `That photo could not be read (${e instanceof Error ? e.message : String(e)}).` }], warnings: [] };
      }
      if (!last.ok) { showIssues(sheet.messages, last); status.hidden = true; return; }
    }
    sheet.close();
    ctx.saved(`Added ${files.length} photo${files.length === 1 ? '' : 's'} to "${m.title}".`, /** @type {any} */ (last));
  });
  const photoRow = (/** @type {Photo} */ p, /** @type {number} */ i) => el('div', { class: 'ms-photo' },
    thumb(p, 'ms-photo-img'),
    el('div', { class: 'row-actions' },
      i === 0 ? el('span', { class: 'muted small' }, '★ Cover') : el('button', { class: 'link', type: 'button', onclick: async () => {
        const r = await ctx.call('milestones.updatePhoto', { milestone_id: m.milestone_id, file_id: p.file_id, cover: true });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved('That photo is the cover now.', r);
      } }, 'Make cover'),
      el('button', { class: 'link', type: 'button', onclick: () => { sheet.close(); focusSheet(ctx, m, p); } }, 'Set focus'),
      el('button', { class: 'link danger-text', type: 'button', onclick: async () => {
        if (!window.confirm('Remove this photo? It goes to the Drive bin.')) return;
        const r = await ctx.call('milestones.removePhoto', { milestone_id: m.milestone_id, file_id: p.file_id });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved('Photo removed.', r);
      } }, 'Remove photo')));
  const form = el('div', { class: 'form' },
    photos.length ? el('div', { class: 'ms-photos' }, photos.map(photoRow)) : '',
    el('button', { class: 'wide-button', type: 'button', onclick: () => picker.click() }, photos.length ? '+ Add more photos' : '+ Add photos'),
    picker, status,
    el('p', {}, whenText(m.date)),
    el('p', { class: 'muted' }, m.people.join(' + ')),
    m.notes ? el('p', {}, m.notes) : '',
    m.event_title ? el('p', { class: 'muted small' }, `From the calendar: ${m.event_title}`) : '',
    el('div', { class: 'actions' },
      el('button', { class: 'danger', type: 'button', onclick: async () => {
        const r = await ctx.call('milestones.remove', { milestone_id: m.milestone_id });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        ctx.saved(`Removed "${m.title}".`, r, () => ctx.call('milestones.restore', { milestone_id: m.milestone_id }));
      } }, 'Remove'),
      el('button', { class: 'primary', type: 'button', onclick: () => { sheet.close(); milestoneSheet(ctx, { milestone: m }); } }, 'Edit')));
  const sheet = openSheet(m.title, form);
}

/**
 * Tap the face (or whatever matters) in the photo: crops on the poster keep that point (ADR-113).
 * @param {import('./forms.js').FormContext} ctx
 * @param {Milestone} m
 * @param {Photo} p
 */
function focusSheet(ctx, m, p) {
  const img = /** @type {HTMLImageElement} */ (el('img', { class: 'ms-focus-img', alt: '' }));
  const dot = el('div', { class: 'ms-focus-dot', style: { left: `${p.focus_x * 100}%`, top: `${p.focus_y * 100}%` } });
  photoUrl(p.thumb_id).then((url) => { if (url) img.src = url; });
  const frame = el('div', { class: 'ms-focus' }, img, dot);
  frame.addEventListener('click', async (/** @type {MouseEvent} */ ev) => {
    const box = img.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height));
    Object.assign(dot.style, { left: `${x * 100}%`, top: `${y * 100}%` });
    const r = await ctx.call('milestones.updatePhoto', { milestone_id: m.milestone_id, file_id: p.file_id, focus_x: Math.round(x * 100) / 100, focus_y: Math.round(y * 100) / 100 });
    if (!r.ok) { showIssues(sheet.messages, r); return; }
    sheet.close();
    ctx.saved('Focus point saved.', r);
  });
  const sheet = openSheet('Set focus', el('div', { class: 'form' }, el('p', { class: 'muted small' }, 'Tap what matters most, e.g. a face: crops on the poster keep it.'), frame));
}
