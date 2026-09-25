// @ts-check

import { el, niceDate, fullDate } from '../dom.js';
import { openSheet, showIssues, toast } from './sheet.js';
import { field, input, select, chips, saveButton, busy } from './fields.js';

/**
 * Lists (ADR-085): shopping, moving house, a party, anything. Shared by RT and G; items have
 * optional who, due date and notes. Ticking is instant on the phone and saved behind it, because a
 * list is often used in a shop.
 *
 * @typedef {{ list_id: string, title: string, event_id: string|null, status: string, created_at: string, created_by: string,
 *   done: number, total: number }} List
 * @typedef {{ item_id: string, list_id: string, text: string, owner: string[], due_date: string|null, notes: string|null,
 *   status: string, done_at: string|null, done_by: string|null }} Item
 * @typedef {{ event_id: string, title: string, start_date: string, participants: string[] }} LinkableEvent
 * @typedef {{ lists: List[], items: Item[], events: LinkableEvent[] }} ListsData
 * @typedef {{ ctx: import('./forms.js').FormContext, data: ListsData, open: (listId: string|null) => void,
 *   redraw: () => void, persist: () => void, reload: () => void, renamed: (from: string, to: string) => void }} ListsScreen
 */

/** @param {LinkableEvent|undefined} e */
const eventText = (e) => (e ? `${e.title} · ${niceDate(e.start_date)}` : '');

/**
 * Attach-to-event choices: none, or an upcoming one-off event.
 * @param {ListsData} data
 * @param {string|null} current
 */
function eventSelect(data, current) {
  return select(current ?? '', [['', '(not attached to an event)'], ...data.events.map((e) => /** @type {[string, string]} */ ([e.event_id, eventText(e)]))]);
}

/**
 * A new list, or renaming / re-attaching one.
 * @param {ListsScreen} screen
 * @param {List} [list]
 */
function listSheet(screen, list) {
  const title = input('text', list?.title ?? null, { placeholder: 'e.g. India shopping' });
  const event = eventSelect(screen.data, list?.event_id ?? null);
  const form = el('div', { class: 'form' },
    field('Name', title.node),
    field('Belongs to an event (optional)', event.node),
    el('div', { class: 'actions' }, saveButton(list ? 'Save' : 'Create list', async () => {
      const values = { title: title.get(), event_id: event.get() };
      if (list) {
        const r = await screen.ctx.call('lists.update', { list_id: list.list_id, changes: values });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        sheet.close();
        toast(`Saved "${values.title}".`);
        screen.reload();
        return;
      }
      if (!values.title) { showIssues(sheet.messages, { errors: [{ field: 'title', message: 'give the list a name' }], warnings: [] }); return; }
      sheet.close();
      createList(screen, values.title, values.event_id || null);
    })));
  const sheet = openSheet(list ? 'Edit list' : 'New list', form);
  if (!list) title.node.focus();
}

/**
 * Shows a new list at once and saves it behind (RT, 2026-09-25). Items added before the server
 * answers wait in the same queue, so they are saved into the list once it has its real id.
 * @param {ListsScreen} screen
 * @param {string} title
 * @param {string|null} eventId
 */
function createList(screen, title, eventId) {
  /** @type {List} */
  const list = { list_id: newId(), title, event_id: eventId, status: 'ACTIVE', created_at: new Date().toISOString(), created_by: 'you', done: 0, total: 0 };
  const tempId = list.list_id;
  screen.data.lists.push(list);
  screen.persist();
  screen.open(tempId);
  enqueue(async () => {
    try {
      const r = await screen.ctx.call('lists.add', { title, event_id: eventId });
      if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
      Object.assign(list, r.data.list);
      screen.data.items.filter((i) => i.list_id === tempId).forEach((i) => { i.list_id = list.list_id; });
      if (!screen.data.lists.some((l) => l.list_id === list.list_id)) screen.data.lists.push(list);
      screen.persist();
      screen.renamed(tempId, list.list_id);
      screen.redraw();
    } catch (e) {
      screen.data.lists = screen.data.lists.filter((l) => l !== list);
      screen.data.items = screen.data.items.filter((i) => i.list_id !== tempId);
      toast(`Could not create "${title}": ${message(e)}`);
      screen.open(null);
    } finally {
      unsaved.delete(tempId);
    }
  });
}

/**
 * Editing one item: text, who, due date, notes; or removing it.
 * @param {ListsScreen} screen
 * @param {Item} item
 */
function itemSheet(screen, item) {
  const text = input('text', item.text);
  const owner = chips(screen.ctx.meta.participants, item.owner);
  const due = input('date', item.due_date);
  const notes = input('text', item.notes, { placeholder: 'e.g. 2 kg, the blue one' });
  const form = el('div', { class: 'form' },
    field('Item', text.node), field('Who (optional)', owner.node),
    el('div', { class: 'row' }, field('Due (optional)', due.node), field('Notes', notes.node)),
    el('div', { class: 'actions' },
      saveButton('Save', async () => {
        const values = { text: text.get(), owner: owner.get(), due_date: due.get(), notes: notes.get() };
        const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(/** @type {any} */ (item)[k] ?? (Array.isArray(v) ? [] : null))));
        if (Object.keys(changes).length === 0) { sheet.close(); return; }
        await saving; // a new item gets its real id first
        const r = await screen.ctx.call('listItems.update', { item_id: item.item_id, changes });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        Object.assign(item, r.data.item);
        sheet.close();
        screen.persist();
        screen.redraw();
      }),
      el('button', { class: 'danger', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), async () => { await saving; return screen.ctx.call('listItems.setStatus', { item_id: item.item_id, status: 'REMOVED' }); });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        screen.data.items = screen.data.items.filter((i) => i.item_id !== item.item_id);
        sheet.close();
        screen.persist();
        screen.redraw();
        toast(`Removed "${item.text}".`, [], () => bringBack(screen, item));
      } }, 'Remove')));
  const sheet = openSheet('Edit item', form);
}

/**
 * Undo for a removed item (ADR-087): it comes back open, where it was.
 * @param {ListsScreen} screen
 * @param {Item} item
 */
async function bringBack(screen, item) {
  const r = await screen.ctx.call('listItems.setStatus', { item_id: item.item_id, status: 'OPEN' });
  if (!r.ok) { toast(`Could not undo: ${r.errors.map((e) => e.message).join('; ')}`); return; }
  if (!screen.data.items.some((i) => i.item_id === item.item_id)) screen.data.items.push({ ...item, ...r.data.item });
  screen.persist();
  screen.redraw();
  toast(`"${item.text}" is back.`);
}

/** Changes are saved one at a time, in order, so quick taps never race. */
let saving = Promise.resolve();
/** @param {() => Promise<void>} job */
const enqueue = (job) => {
  pending += 1;
  saving = saving.then(job).finally(() => { pending -= 1; });
};
/** How many changes are still waiting to be saved. */
let pending = 0;
/** Whether any tick, new item or new list is still being saved. */
export const hasPendingSaves = () => pending > 0;

/** Ids of lists and items shown before the server has saved them. */
const unsaved = new Set();
let counter = 0;
const newId = () => { const id = `new-${Date.now()}-${++counter}`; unsaved.add(id); return id; };
/** @param {string} id */
export const isUnsaved = (id) => unsaved.has(id);
/** @param {unknown} e */
const message = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Shows new items at once and saves them behind, in one request however many there are
 * (RT, 2026-09-25). If the save fails they are taken off again and the text is offered back.
 * @param {ListsScreen} screen
 * @param {List} list
 * @param {string[]} texts
 */
function addItems(screen, list, texts) {
  const lines = texts.map((t) => t.trim()).filter(Boolean);
  if (lines.length === 0) return;
  /** @type {Item[]} */
  const items = lines.map((text) => ({ item_id: newId(), list_id: list.list_id, text, owner: [], due_date: null, notes: null, status: 'OPEN', done_at: null, done_by: null }));
  const tempIds = items.map((i) => i.item_id);
  screen.data.items.push(...items);
  screen.redraw();
  enqueue(async () => {
    try {
      if (isUnsaved(list.list_id)) throw new Error('the list was not created');
      const r = lines.length === 1
        ? await screen.ctx.call('listItems.add', { list_id: list.list_id, text: lines[0] })
        : await screen.ctx.call('listItems.addMany', { list_id: list.list_id, texts: lines });
      if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
      /** @type {Item[]} */
      const saved = lines.length === 1 ? [r.data.item] : r.data.items;
      items.forEach((item, n) => {
        const done = { status: item.status, done_at: item.done_at, done_by: item.done_by };
        Object.assign(item, saved[n], done);
        if (!screen.data.items.some((i) => i.item_id === item.item_id)) screen.data.items.push(item);
      });
      screen.persist();
    } catch (e) {
      screen.data.items = screen.data.items.filter((i) => !items.includes(i));
      screen.redraw();
      toast(`Could not add ${lines.length === 1 ? `"${lines[0]}"` : `${lines.length} items`}: ${message(e)}`);
    } finally {
      tempIds.forEach((id) => unsaved.delete(id));
      screen.redraw();
    }
  });
}

/**
 * Several items at once: one per line, as written or pasted from a note.
 * @param {ListsScreen} screen
 * @param {List} list
 */
function severalSheet(screen, list) {
  const box = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '8', placeholder: 'One item per line, e.g.\nRice\nToothpaste\nChargers' }));
  const form = el('div', { class: 'form' },
    field('Items', box),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: () => {
      const lines = box.value.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\[ ?\]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      if (lines.length === 0) { box.focus(); return; }
      sheet.close();
      addItems(screen, list, lines);
    } }, 'Add items')));
  const sheet = openSheet(`Add to ${list.title}`, form);
  box.focus();
}

/**
 * Ticks or unticks at once on the phone, then saves; undoes the tick if the save fails.
 * @param {ListsScreen} screen
 * @param {Item} item
 */
function toggle(screen, item) {
  const before = { status: item.status, done_at: item.done_at, done_by: item.done_by };
  const status = item.status === 'DONE' ? 'OPEN' : 'DONE';
  Object.assign(item, { status, done_at: status === 'DONE' ? new Date().toISOString() : null, done_by: status === 'DONE' ? 'you' : null });
  screen.redraw();
  enqueue(async () => {
    // An item whose own save failed has gone already.
    if (!screen.data.items.includes(item)) return;
    try {
      const r = await screen.ctx.call('listItems.setStatus', { item_id: item.item_id, status });
      if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
      Object.assign(item, r.data.item);
      screen.persist();
    } catch (e) {
      Object.assign(item, before);
      screen.redraw();
      toast(`Could not save the tick: ${message(e)}`);
    }
  });
}

/**
 * One item row: a tick box, the text, and who / due / notes.
 * @param {ListsScreen} screen
 * @param {Item} item
 * @param {string} today
 */
function itemRow(screen, item, today) {
  const done = item.status === 'DONE';
  const overdue = !done && item.due_date !== null && item.due_date < today;
  const meta = [
    item.owner.join('+'),
    item.due_date ? `${overdue ? 'overdue · ' : 'by '}${niceDate(item.due_date)}` : '',
    item.notes ?? '',
    done && item.done_by ? `ticked by ${item.done_by}` : '',
  ].filter(Boolean).join(' · ');
  return el('li', { class: `list-item${done ? ' done' : ''}${isUnsaved(item.item_id) ? ' saving' : ''}` },
    el('button', { class: 'tick', type: 'button', 'aria-pressed': String(done), 'aria-label': done ? 'Untick' : 'Tick', onclick: () => toggle(screen, item) }),
    el('div', { class: 'list-item-body', onclick: () => itemSheet(screen, item) },
      el('div', { class: 'list-item-text' }, item.text),
      meta ? el('div', { class: `details${overdue ? ' overdue' : ''}` }, meta) : ''));
}

/**
 * The lists overview: active lists with progress, a New list button, archived lists folded away.
 * @param {ListsScreen} screen
 */
export function listsOverview(screen) {
  const active = screen.data.lists.filter((l) => l.status === 'ACTIVE').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const archived = screen.data.lists.filter((l) => l.status === 'ARCHIVED');
  const events = new Map(screen.data.events.map((e) => [e.event_id, e]));
  /** @param {List} l */
  const card = (l) => {
    const items = screen.data.items.filter((i) => i.list_id === l.list_id);
    const done = items.filter((i) => i.status === 'DONE').length;
    const event = l.event_id ? events.get(l.event_id) : undefined;
    return el('button', { class: 'list-card', type: 'button', onclick: () => screen.open(l.list_id) },
      el('div', { class: 'list-card-title' }, l.title),
      el('div', { class: 'details' }, [items.length ? `${done} of ${items.length} done` : 'empty', eventText(event)].filter(Boolean).join(' · ')),
      items.length ? el('div', { class: 'progress' }, el('span', { style: { width: `${Math.round((done / items.length) * 100)}%` } })) : '');
  };
  return el('div', {},
    el('button', { class: 'wide-button', type: 'button', onclick: () => listSheet(screen) }, '+ New list'),
    active.length ? active.map(card) : el('p', { class: 'muted' }, 'No lists yet. Make one for shopping, a party, moving house, anything.'),
    archived.length ? el('details', { class: 'archived' }, el('summary', { class: 'muted' }, `Archived (${archived.length})`), archived.map(card)) : '');
}

/**
 * One list: quick add at the top, open items, done items folded away, and the list's settings.
 * @param {ListsScreen} screen
 * @param {string} listId
 * @param {string} today
 */
export function listDetail(screen, listId, today) {
  const list = screen.data.lists.find((l) => l.list_id === listId);
  if (!list) return el('div', {}, el('p', { class: 'muted' }, 'This list is not here any more.'), el('button', { class: 'link', type: 'button', onclick: () => screen.open(null) }, '‹ All lists'));
  const items = screen.data.items.filter((i) => i.list_id === listId);
  // Newest first, so what was just added is at the top (RT, 2026-09-25).
  const open = items.filter((i) => i.status !== 'DONE').reverse();
  const done = items.filter((i) => i.status === 'DONE');
  const event = list.event_id ? screen.data.events.find((e) => e.event_id === list.event_id) : undefined;

  const newText = /** @type {HTMLInputElement} */ (el('input', { type: 'text', placeholder: 'Add an item', enterkeyhint: 'done', class: 'add-input' }));
  const add = () => {
    const text = newText.value.trim();
    if (!text) { newText.focus(); return; }
    newText.value = '';
    addItems(screen, list, [text]);
    // Ready for the next item, as when writing a shopping list.
    setTimeout(() => /** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.focus(), 0);
  };
  newText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  // Pasting several lines (e.g. from a note) adds one item per line.
  newText.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    addItems(screen, list, lines);
  });

  return el('div', { class: 'list-detail' },
    el('button', { class: 'link back', type: 'button', onclick: () => screen.open(null) }, '‹ All lists'),
    el('h2', { class: 'list-title' }, list.title, list.status === 'ARCHIVED' ? el('span', { class: 'tag' }, 'archived') : ''),
    event ? el('div', { class: 'details' }, `For ${eventText(event)}`) : '',
    el('div', { class: 'add-row' }, newText, el('button', { class: 'primary', type: 'button', onclick: add }, 'Add')),
    el('button', { class: 'link add-several', type: 'button', onclick: () => severalSheet(screen, list) }, '+ Add several at once'),
    open.length ? el('ul', { class: 'list-items' }, open.map((i) => itemRow(screen, i, today))) : el('p', { class: 'muted' }, items.length ? 'All done.' : 'Nothing on this list yet.'),
    done.length ? el('details', { class: 'done-items' }, el('summary', { class: 'muted' }, `Done (${done.length})`),
      el('ul', { class: 'list-items' }, done.map((i) => itemRow(screen, i, today)))) : '',
    el('div', { class: 'row-actions list-actions' },
      el('button', { class: 'link', type: 'button', onclick: () => listSheet(screen, list) }, 'Rename or attach to an event'),
      el('button', { class: 'link', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const status = list.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => screen.ctx.call('lists.setStatus', { list_id: listId, status }));
        if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
        list.status = status;
        screen.persist();
        toast(status === 'ARCHIVED' ? `Archived "${list.title}".` : `Reopened "${list.title}".`, [], status === 'ARCHIVED' ? async () => {
          const back = await screen.ctx.call('lists.setStatus', { list_id: listId, status: 'ACTIVE' });
          if (!back.ok) { toast(`Could not undo: ${back.errors.map((e) => e.message).join('; ')}`); return; }
          list.status = 'ACTIVE';
          screen.persist();
          screen.open(listId);
        } : undefined);
        if (status === 'ARCHIVED') screen.open(null); else screen.redraw();
      } }, list.status === 'ACTIVE' ? 'Archive list' : 'Reopen list')),
    el('p', { class: 'muted small' }, `Created ${fullDate(list.created_at.slice(0, 10))} by ${list.created_by}.`));
}
