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
