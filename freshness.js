// @ts-check
// GENERATED from app-kit/pwa/freshness.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * The header's top right, the same in every app: when what is on screen last came from the
 * server, in London time, with the day too when that was not today. `short` is what shows beside
 * the ↻ ("09:14"); `label` is the whole sentence, for screen readers and the tooltip. Pure: the
 * app says what it knows, and draws the answer itself.
 * @param {{ lastSynced: number|null, refreshing: boolean, online: boolean }} status
 *   lastSynced: when it last came from the server (ms since 1970), or null if never
 * @param {number} now
 * @returns {{ short: string, label: string }}
 */
export function updatedText(status, now) {
  if (status.refreshing) return { short: 'Updating…', label: 'Updating from the sheet' };
  const action = status.online ? 'tap to refresh' : 'offline';
  if (status.lastSynced === null) return { short: 'Not updated', label: `Not updated yet · ${action}` };
  const day = (/** @type {number} */ ms) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date(status.lastSynced).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const today = day(status.lastSynced) === day(now);
  return { short: today ? time : `${day(status.lastSynced).slice(0, 5)} ${time}`, label: `Updated ${today ? time : `${day(status.lastSynced)} ${time}`} · ${action}` };
}
