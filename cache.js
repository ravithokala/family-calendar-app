// @ts-check

/**
 * The last answer for each screen, kept on this phone so a screen draws at once and refreshes
 * behind it (ADR-078). Cleared on sign-out. Never shared: it is this device's own storage.
 */
const PREFIX = 'fc.cache.';

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
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* storage full or unavailable */ }
}

export function clear() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
}
