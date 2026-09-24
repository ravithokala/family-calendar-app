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
 *   redraw: () => void, persist: () => void, reload: () => void }} ListsScreen
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
      const r = list
        ? await screen.ctx.call('lists.update', { list_id: list.list_id, changes: values })
        : await screen.ctx.call('lists.add', values);
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      toast(list ? `Saved "${values.title}".` : `Created "${values.title}".`);
      if (!list) screen.open(r.data.list.list_id);
      screen.reload();
    })));
  const sheet = openSheet(list ? 'Edit list' : 'New list', form);
  if (!list) title.node.focus();
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
        const r = await screen.ctx.call('listItems.update', { item_id: item.item_id, changes });
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        Object.assign(item, r.data.item);
        sheet.close();
        screen.persist();
        screen.redraw();
      }),
      el('button', { class: 'danger', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => screen.ctx.call('listItems.setStatus', { item_id: item.item_id, status: 'REMOVED' }));
        if (!r.ok) { showIssues(sheet.messages, r); return; }
        screen.data.items = screen.data.items.filter((i) => i.item_id !== item.item_id);
        sheet.close();
        screen.persist();
        screen.redraw();
        toast(`Removed "${item.text}".`);
      } }, 'Remove')));
  const sheet = openSheet('Edit item', form);
}

/** Ticks are saved one at a time, in order, so quick taps never race. */
let saving = Promise.resolve();

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
  saving = saving.then(async () => {
    try {
      const r = await screen.ctx.call('listItems.setStatus', { item_id: item.item_id, status });
      if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
      Object.assign(item, r.data.item);
      screen.persist();
    } catch (e) {
      Object.assign(item, before);
      screen.redraw();
      toast(`Could not save the tick: ${e instanceof Error ? e.message : String(e)}`);
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
  return el('li', { class: `list-item${done ? ' done' : ''}` },
    el('button', { class: 'tick', type: 'button', 'aria-pressed': String(done), 'aria-label': done ? 'Untick' : 'Tick', onclick: () => toggle(screen, item) }, done ? '✓' : ''),
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
  const open = items.filter((i) => i.status !== 'DONE')
    // Due items first, soonest first; then the rest in the order they were added.
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const done = items.filter((i) => i.status === 'DONE');
  const event = list.event_id ? screen.data.events.find((e) => e.event_id === list.event_id) : undefined;

  const newText = /** @type {HTMLInputElement} */ (el('input', { type: 'text', placeholder: 'Add an item', enterkeyhint: 'done', class: 'add-input' }));
  const addButton = /** @type {HTMLButtonElement} */ (el('button', { class: 'primary', type: 'button' }, 'Add'));
  const addItem = async () => {
    const text = newText.value.trim();
    if (!text) { newText.focus(); return; }
    const r = await busy(addButton, () => screen.ctx.call('listItems.add', { list_id: listId, text }));
    if (!r.ok) { toast(r.errors.map((e) => e.message).join('; ')); return; }
    screen.data.items.push(r.data.item);
    screen.persist();
    screen.redraw();
    // Ready for the next item, as when writing a shopping list.
    setTimeout(() => /** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.focus(), 0);
  };
  addButton.addEventListener('click', addItem);
  newText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

  return el('div', { class: 'list-detail' },
    el('button', { class: 'link back', type: 'button', onclick: () => screen.open(null) }, '‹ All lists'),
    el('h2', { class: 'list-title' }, list.title, list.status === 'ARCHIVED' ? el('span', { class: 'tag' }, 'archived') : ''),
    event ? el('div', { class: 'details' }, `For ${eventText(event)}`) : '',
    el('div', { class: 'add-row' }, newText, addButton),
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
        toast(status === 'ARCHIVED' ? `Archived "${list.title}".` : `Reopened "${list.title}".`);
        if (status === 'ARCHIVED') screen.open(null); else screen.redraw();
      } }, list.status === 'ACTIVE' ? 'Archive list' : 'Reopen list')),
    el('p', { class: 'muted small' }, `Created ${fullDate(list.created_at.slice(0, 10))} by ${list.created_by}.`));
}
