// @ts-check
// GENERATED from app-kit/pwa/guard.js. Do not edit here: change it in ../app-kit, then run "node ../app-kit/sync.js" in this app.

/**
 * The app refuses to run inside another page. GitHub Pages cannot send the header that forbids
 * framing, so a hostile page could otherwise show the app in a hidden frame and trick taps
 * through to it. Checked first thing at start-up; the app then shows FRAMED_MESSAGE and stops.
 * Only `export { … }` at the end: the portfolio's offline tests run this file as a plain script.
 */

/** Whether this page is inside a frame (a page that will not say counts as one). */
function inFrame() {
  try {
    return window.top !== window.self;
  } catch (e) {
    return true;
  }
}

const FRAMED_MESSAGE = 'This app cannot be shown inside another page. Open it directly.';

export { inFrame, FRAMED_MESSAGE };
