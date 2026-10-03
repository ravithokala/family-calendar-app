// @ts-check

/**
 * Where the app finds its server and which Google sign-in client it is (ADR-078). Both are
 * public by nature: the server refuses every request without a family member's Google sign-in.
 */
export const CONFIG = Object.freeze({
  /** The Apps Script API deployment's URL, ending /exec. */
  apiUrl: 'https://script.google.com/macros/s/AKfycbyv8rRgpzDNoYXnH-oL5sHtasxsBrTARyeSIyy-_hsxzA_nu46Es41E71nCZpvTifuxSQ/exec',
  /** The OAuth client ID from Google Cloud, ending .apps.googleusercontent.com. */
  clientId: '558653473092-ltcjl3vevvo8is49of49hovo7tcsshho.apps.googleusercontent.com',
  /** Prefix of this app's localStorage keys: the three apps share one origin (github.io). */
  storage: 'fc',
  /**
   * What kind each action is (app-kit's api.js, ADR-104). `reads` only read: they give up after 20
   * seconds, and the saved copy is shown with a clear message (connected but with no internet, a
   * request never fails, it hangs: RT, 2026-10-02). `slow` take long by nature (making the PDFs,
   * reading an uploaded PDF, reading Household Admin's sheet): one try of three minutes. Everything
   * else is a save: an id, 12 seconds, then one automatic retry with the same id, which the server
   * applies once.
   */
  waits: Object.freeze({
    reads: Object.freeze(['app.days', 'app.more', 'app.search', 'lists.all', 'meta.get', 'review.inbox', 'system.check', 'sources.prompt', 'capture.parse']),
    slow: Object.freeze(['print.generateMonth', 'sources.addPdf', 'household.sync']),
  }),
});
