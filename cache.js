// @ts-check

/**
 * The last answer for each screen, kept on this phone so a screen draws at once and refreshes
 * behind it (ADR-078). Cleared on sign-out. Never shared: it is this device's own storage.
 */
const PREFIX = 'fc.cache.';
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
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
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
      const m = key.match(/^fc\.cache\.days:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
      if (!m || m[1] > from || m[2] < to) continue;
      const entry = read(key.slice(PREFIX.length));
      if (entry && (!best || entry.at > best.at)) best = entry;
    }
  } catch (e) {
    return null;
  }
  if (!best) return null;
  /** @type {Record<string, { days: Array<{ date: string }>, reminders: Array<{ window_start: string, window_end: string }> }>} */
  const views = best.data.views;
  return {
    at: best.at,
    data: {
      ...best.data, from, to,
      views: Object.fromEntries(Object.entries(views).map(([view, v]) => [view, {
        days: v.days.filter((d) => d.date >= from && d.date <= to),
        reminders: v.reminders.filter((r) => r.window_start <= to && r.window_end >= from),
      }])),
    },
  };
}

/** Forgets every saved calendar range and the More lists, e.g. after a change. */
export function clearDays() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`${PREFIX}days:`) || k === `${PREFIX}more`).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
}
