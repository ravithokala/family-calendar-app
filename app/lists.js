// @ts-check

import { call } from '../api.js';
import * as cache from '../cache.js';
import { el } from '../dom.js';
import { listsOverview, listDetail, isUnsaved, hasPendingSaves } from '../views/lists.js';
import { toast } from '../views/sheet.js';
import { formContext } from './context.js';
import { $, app, go, readState, today, isCurrent, drawSaved, showError } from './state.js';

/**
 * The copy of the lists in memory: one for every visit to Lists, so saves still running from an
 * earlier visit (a new list, new items) land in what is on screen now.
 * @type {import('../views/lists.js').ListsData | null}
 */
let listsData = null;

/** The lists as this phone holds them now, for searching their items. */
export const currentLists = () => listsData ?? cache.read('lists')?.data ?? null;

/** Whether a new list or item is still being saved. */
const busySaving = () => hasPendingSaves() || Boolean(listsData && (listsData.lists.some((l) => isUnsaved(l.list_id)) || listsData.items.some((i) => isUnsaved(i.item_id))));

/**
 * Takes lists fetched in the background (after the calendar), unless something is still being saved.
 * @param {import('../views/lists.js').ListsData} data
 */
export function acceptBackgroundLists(data) {
  cache.write('lists', data);
  if (!busySaving()) listsData = data;
}

/** While Lists is open, the server is asked this often for changes from the other phone. */
const POLL_MS = 30 * 1000;
/** @type {number|undefined} */
let polling;

/**
 * Asks for the lists every POLL_MS while Lists is on screen and the app is in front, and redraws
 * only when something changed, and not while typing or while a sheet is open (RT, 2026-09-25:
 * shopping from the same list on two phones).
 * @param {number} mine
 * @param {() => HTMLElement} drawIt
 */
function pollWhileOpen(mine, drawIt) {
  clearInterval(polling);
  polling = window.setInterval(async () => {
    if (!isCurrent(mine) || readState().screen !== 'lists') { clearInterval(polling); return; }
    if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]') || busySaving()) return;
    if (/** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.value) return;
    try {
      const r = await call('lists.all', {});
      if (!r.ok || !isCurrent(mine) || busySaving()) return;
      const changed = JSON.stringify(r.data) !== JSON.stringify(listsData);
      cache.write('lists', r.data);
      if (!changed) return;
      listsData = r.data;
      if (!document.querySelector('dialog[open]') && !(/** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.value)) {
        $('main').replaceChildren(drawIt());
      }
    } catch (e) {
      // The next check tries again.
    }
  }, POLL_MS);
}

/**
 * Lists: the overview, or one list (saved copy first). Ticks and new items update the saved copy
 * directly, so the screen stays instant; everything else reloads from the server.
 * @param {number} mine
 * @param {boolean} [force]  ask the server even if the saved copy is fresh
 * @param {boolean} [fresh]  and have the server rebuild its answer
 */
export async function showLists(mine, force = false, fresh = false) {
  // The copy in memory holds any saves still running; the stored copy says how old it is.
  const stored = cache.read('lists');
  const saved = listsData ? { at: stored?.at ?? 0, data: listsData } : stored;
  listsData = saved?.data ?? { lists: [], items: [], events: [] };
  /** @type {import('../views/lists.js').ListsScreen} */
  const screen = {
    ctx: formContext(),
    get data() { return /** @type {import('../views/lists.js').ListsData} */ (listsData); },
    set data(v) { listsData = v; },
    open: (listId) => go({ screen: 'lists', list: listId }),
    redraw: () => { if (readState().screen === 'lists') $('main').replaceChildren(drawIt()); },
    // A list change can change what the calendar shows under "To do": saved months stay, but refresh.
    persist: () => { cache.write('lists', screen.data); cache.staleCalendar(); },
    reload: () => { if (isCurrent(mine)) app.show(true); },
    // A new list got its real id: point the address at it without drawing again.
    renamed: (from, to) => { if (location.hash.endsWith(`/${from}`)) history.replaceState(null, '', location.hash.replace(`/${from}`, `/${to}`)); },
  };
  // The address, not the state when drawing began: a new list's id changes once it is saved.
  const drawIt = () => { const list = readState().list; return list ? listDetail(screen, list, today()) : listsOverview(screen); };
  const savedView = saved ? drawSaved(drawIt) : null;
  if (savedView) $('main').replaceChildren(savedView);
  else $('main').replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
  pollWhileOpen(mine, drawIt);
  // Always ask: lists are shared and change often, so even a minute-old copy may miss the other
  // phone's changes (RT, 2026-09-25). The saved copy is on screen meanwhile.
  try {
    const r = await call('lists.all', fresh ? { fresh: true } : {});
    if (!isCurrent(mine)) return;
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
    // Lists and items still being saved are kept: the server does not know them yet.
    screen.data = { ...r.data,
      lists: [...r.data.lists, ...screen.data.lists.filter((l) => isUnsaved(l.list_id))],
      items: [...r.data.items, ...screen.data.items.filter((i) => isUnsaved(i.item_id))] };
    cache.write('lists', r.data);
    // Keep what is being typed: only redraw if the quick-add box is empty.
    const typing = /** @type {HTMLInputElement|null} */ (document.querySelector('.add-input'))?.value;
    if (!typing) $('main').replaceChildren(drawIt());
  } catch (e) {
    if (!isCurrent(mine)) return;
    if (!savedView) showError(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
    else toast(`Could not refresh: ${e instanceof Error ? e.message : String(e)}`);
  }
}
