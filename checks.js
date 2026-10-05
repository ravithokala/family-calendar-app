// @ts-check
// GENERATED from app-kit/pwa/checks.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

import { recentProblems, problemText } from './problems.js';

/**
 * The checks of this phone that are the same in every app, for the System check in More: one
 * line each, fixed wording, counts at most. An app adds its own (how fresh its data is, whether
 * its copy matches the server) around them.
 *
 * @typedef {{ name: string, ok: boolean, detail: string, items?: string[] }} CheckLine  items: a short list under the line, if the app shows one
 */

/**
 * @param {string} version  this copy's version (version.js); 'local' is an unpublished copy
 * @returns {Promise<{ version: CheckLine, connection: CheckLine, offline: CheckLine, storage: CheckLine, problems: CheckLine }>}
 */
async function phoneChecks(version) {
  const published = / · [0-9a-f]{7,40}$/.test(version);
  // The saved copy of the app itself: the apps share one cache storage, each under its own path.
  const controlled = Boolean(navigator.serviceWorker?.controller);
  let files = 0;
  try {
    const app = new URL('./', window.location.href).pathname;
    for (const name of await caches.keys()) if (name.startsWith(app)) files += (await (await caches.open(name)).keys()).length;
  } catch (e) { /* no cache storage: counted as none */ }
  const offline = controlled && files > 0;
  /** @type {boolean|undefined} */
  let kept;
  try { kept = await navigator.storage?.persisted?.(); } catch (e) { kept = undefined; }
  // Requests that failed lately (problems.js): fails only for a problem in the last 24 hours, so an old bad spell
  // does not fail the check for a week.
  const now = Date.now();
  const problems = recentProblems(now);
  const lastDay = problems.filter((p) => now - p.at < 24 * 3600 * 1000).length;
  return {
    version: { name: 'App version', ok: published, detail: published ? version : 'An unpublished copy' },
    connection: { name: 'Connection', ok: navigator.onLine, detail: navigator.onLine ? 'Online' : 'Offline: viewing only; saving needs a connection' },
    offline: { name: 'Works offline', ok: offline,
      detail: offline ? `The app opens without a connection (viewing only): ${files} files saved`
        : controlled ? 'The saved copy of the app is missing: open the app once more while online' : 'Not yet: open the app once more while online' },
    // Information only: browsers decide this themselves (installed apps are usually kept).
    storage: { name: 'Phone storage', ok: true,
      detail: kept === true ? "Kept: the browser will not clear this app's copy"
        : kept === false ? 'May be cleared by the browser if space runs low (the sheet keeps everything; adding the app to the Home Screen helps)'
          : 'This browser does not say' },
    problems: { name: 'Failed requests', ok: lastDay === 0,
      detail: problems.length === 0 ? 'None in the last 7 days'
        : `${problems.length} in the last 7 days${lastDay ? `, ${lastDay} in the last 24 hours` : ''}: Google is sometimes slow or busy for a while; the saved copy stays on screen`,
      items: problems.map(problemText) },
  };
}

export { phoneChecks };
