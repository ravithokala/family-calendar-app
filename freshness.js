// @ts-check
// GENERATED from app-kit/pwa/freshness.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * The header's top right, the same in every app: when what is on screen last came from the
 * server, in London time, with the day too when that was not today. `short` is what shows beside
 * the ↻ ("09:14"); `label` is the whole sentence, for screen readers and the tooltip. Pure: the
 * app says what it knows, and draws the answer itself.
 * @param {{ lastSynced: number|null, refreshing: boolean, online: boolean, failed?: boolean }} status
 *   lastSynced: when it last came from the server (ms since 1970), or null if never
 *   failed: the last refresh got a failed answer while connected (the saved copy is still shown)
 * @param {number} now
 * @returns {{ short: string, label: string }}
 */
function updatedText(status, now) {
  if (status.refreshing) return { short: 'Updating…', label: 'Updating from the sheet' };
  const action = !status.online ? 'offline' : status.failed ? 'could not refresh, tap to try again' : 'tap to refresh';
  if (status.lastSynced === null) return { short: 'Not updated', label: `Not updated yet · ${action}` };
  const at = clock(status.lastSynced, now);
  return { short: at.short, label: `Updated ${at.long} · ${action}` };
}

/**
 * A time in London, with the day too when that was not today: "09:14", or "02/10 09:14" (short)
 * and "02/10/2026 09:14" (long).
 * @param {number} ms
 * @param {number} now
 * @returns {{ short: string, long: string }}
 */
function clock(ms, now) {
  const day = (/** @type {number} */ t) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  return day(ms) === day(now) ? { short: time, long: time } : { short: `${day(ms).slice(0, 5)} ${time}`, long: `${day(ms)} ${time}` };
}

/**
 * The note above a saved copy when a refresh failed. The rule in every app: a failed refresh
 * never takes the saved copy off the screen; this note says what went wrong and when the copy is
 * from. Only the server ending the session or refusing the account clears the screen (api.js,
 * endsAccess and onSessionEnded).
 * @param {string} reason   what went wrong, in the app's or the server's words
 * @param {number|null} savedAt  when the copy on screen came from the server, if known
 * @param {number} now
 * @returns {string}
 */
function refreshFailedText(reason, savedAt, now) {
  const why = String(reason || '').trim().replace(/[.\s]+$/, '');
  return `Could not refresh${why ? `: ${why}` : ''}.${savedAt === null ? '' : ` Showing the copy from ${clock(savedAt, now).long}.`}`;
}

/**
 * How long a load took, for the small line beside the version in More (where a slow open spends
 * its time): "Last load 2.3 s · server 0.4 s (set-up 0.2 s, rebuilt)". Empty when there is none:
 * an app passes a timing only once a load has been timed.
 * @param {{ total_ms: number, server_ms: number|null, setup_ms: number|null, served: string|null }|null|undefined} timing
 *   as api.js records it (lastTiming)
 * @param {string} [what]  what was loaded, when an app times more than one thing ("Calendar")
 * @returns {string}
 */
function loadTimeText(timing, what = '') {
  if (!timing || typeof timing.total_ms !== 'number') return '';
  const s = (/** @type {number} */ ms) => `${(ms / 1000).toFixed(1)} s`;
  const parts = [timing.setup_ms === null ? '' : `set-up ${s(timing.setup_ms)}`, timing.served ?? ''].filter(Boolean).join(', ');
  const server = timing.server_ms === null ? '' : ` · server ${s(timing.server_ms)}${parts ? ` (${parts})` : ''}`;
  return `${what ? `${what}: l` : 'L'}ast load ${s(timing.total_ms)}${server}`;
}

/**
 * A saved copy of the data older than this is not shown: it is removed when the app opens (as the
 * session itself ends after 30 days without use). A phone left in a drawer shows nothing stale.
 */
const COPY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether a saved copy is too old to show.
 * @param {number|null|undefined} savedAt  when it came from the server (ms since 1970)
 * @param {number} now
 */
const copyTooOld = (savedAt, now) => typeof savedAt === 'number' && now - savedAt > COPY_MAX_AGE_MS;

// Only this list: the portfolio's offline tests run this file as a plain script.
export { updatedText, refreshFailedText, loadTimeText, COPY_MAX_AGE_MS, copyTooOld };
