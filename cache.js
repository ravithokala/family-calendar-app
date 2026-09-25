// @ts-check

/**
 * The last answer for each screen, kept on this phone so a screen draws at once and refreshes
 * behind it (ADR-078). Cleared on sign-out. Never shared: it is this device's own storage.
 */
/**
 * Bump FORMAT whenever a saved answer's shape changes: copies saved by an older app version are then
 * ignored and removed instead of being drawn wrongly (RT, 2026-09-24: the More tab broke on update).
 */
const FORMAT = 4;
const ROOT = 'fc.cache.';
const PREFIX = `${ROOT}v${FORMAT}.`;

// Remove copies saved in any older format.
try {
  Object.keys(localStorage).filter((k) => k.startsWith(ROOT) && !k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
} catch (e) { /* storage unavailable */ }
/** Enough for a few months, weeks and days either way; the oldest go first. */
const KEEP = 20;

/**
 * @param {string} key
 * @returns {{ at: number, data: any } | null}
 */
export function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** @param {string} key @param {unknown} data */
export function write(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length > KEEP) {
      keys.map((k) => ({ k, at: JSON.parse(localStorage.getItem(k) ?? '{"at":0}').at ?? 0 }))
        .sort((a, b) => a.at - b.at).slice(0, keys.length - KEEP)
        .forEach(({ k }) => localStorage.removeItem(k));
    }
  } catch (e) { /* storage full or unavailable: the app still works, just without the instant view */ }
}

export function clear() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(ROOT)).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
}

/**
 * The freshest saved answer covering [from, to], cut down to those days: a loaded month already
 * holds its weeks and days, for every filter (ADR-080).
 * @param {string} from
 * @param {string} to
 * @returns {{ at: number, data: any } | null}
 */
export function covering(from, to) {
  /** @type {{ at: number, data: any } | null} */
  let best = null;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(`${PREFIX}days:`)) continue;
      const m = key.slice(PREFIX.length).match(/^days:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
      if (!m || m[1] > from || m[2] < to) continue;
      const entry = read(key.slice(PREFIX.length));
      if (entry && (!best || entry.at > best.at)) best = entry;
    }
  } catch (e) {
    return null;
  }
  if (!best) return null;
  /** @type {Record<string, { days: Array<{ date: string }>, reminders: Array<{ window_start: string, window_end: string }>, todos?: unknown[] }>} */
  const views = best.data.views;
  return {
    at: best.at,
    data: {
      ...best.data, from, to,
      // Everything else a view carries (e.g. list to-dos, overdue ones included) is kept as it is.
      views: Object.fromEntries(Object.entries(views).map(([view, v]) => [view, {
        ...v,
        days: v.days.filter((d) => d.date >= from && d.date <= to),
        reminders: v.reminders.filter((r) => r.window_start <= to && r.window_end >= from),
      }])),
    },
  };
}

/**
 * Marks saved calendar ranges as out of date without dropping them, e.g. after a list change that
 * shows under "To do" (ADR-085): the calendar still draws at once and refreshes behind (RT, 2026-09-25).
 */
export function staleCalendar() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`${PREFIX}days:`)).forEach((k) => {
      const entry = JSON.parse(localStorage.getItem(k) ?? 'null');
      if (entry) localStorage.setItem(k, JSON.stringify({ ...entry, at: 0 }));
    });
  } catch (e) { /* ignore */ }
}

/**
 * Marks one saved screen out of date without dropping it: it still draws at once, then refreshes.
 * @param {string} key
 */
export function stale(key) {
  try {
    const entry = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
    if (entry) localStorage.setItem(PREFIX + key, JSON.stringify({ ...entry, at: 0 }));
  } catch (e) { /* ignore */ }
}

/** Forgets one saved screen. @param {string} key */
export function forget(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}
