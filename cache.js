// @ts-check

/**
 * The last answer for each screen, kept on this phone so a screen draws at once and refreshes
 * behind it (ADR-078). Cleared on sign-out. Never shared: it is this device's own storage.
 */
const PREFIX = 'fc.cache.';
/** Enough for a few months, weeks and days either way; the oldest go first. */
const KEEP = 30;

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
 * The freshest saved answer for a view that covers [from, to], cut down to those days: a loaded
 * month already holds its weeks and days (ADR-080).
 * @param {string} view
 * @param {string} from
 * @param {string} to
 * @returns {{ at: number, data: any } | null}
 */
export function covering(view, from, to) {
  /** @type {{ at: number, data: any } | null} */
  let best = null;
  try {
    for (const key of Object.keys(localStorage)) {
      const m = key.match(/^fc\.cache\.days:([A-Z]+):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
      if (!m || m[1] !== view || m[2] > from || m[3] < to) continue;
      const entry = read(key.slice(PREFIX.length));
      if (entry && (!best || entry.at > best.at)) best = entry;
    }
  } catch (e) {
    return null;
  }
  if (!best) return null;
  const data = best.data;
  return {
    at: best.at,
    data: {
      ...data, from, to,
      days: data.days.filter((/** @type {{ date: string }} */ d) => d.date >= from && d.date <= to),
      reminders: data.reminders.filter((/** @type {{ window_start: string, window_end: string }} */ r) => r.window_start <= to && r.window_end >= from),
    },
  };
}
