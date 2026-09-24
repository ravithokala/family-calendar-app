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
});
