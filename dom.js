// @ts-check

/**
 * Builds an element. Text is always inserted as text, never as HTML.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...unknown} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = String(value);
    else if (key === 'style' && typeof value === 'object' && value !== null) Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), /** @type {EventListener} */ (value));
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === '' || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** The date in the UK, as YYYY-MM-DD. @param {Date} d */
export const isoDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** @param {string} iso @param {number} days */
export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} months  → the 1st of that month */
export function addMonths(iso, months) {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. @param {string} iso */
export const weekdayIndex = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/** The Monday on or before a date. @param {string} iso */
export const mondayOf = (iso) => addDays(iso, -weekdayIndex(iso));

/** @param {string} iso @param {Intl.DateTimeFormatOptions} options */
const format = (iso, options) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });

/** e.g. "Fri 9 Oct" @param {string} iso */
export const niceDate = (iso) => format(iso, { weekday: 'short', day: 'numeric', month: 'short' });
/** e.g. "Friday 9 October" @param {string} iso */
export const longDate = (iso) => format(iso, { weekday: 'long', day: 'numeric', month: 'long' });
/** e.g. "October 2026" @param {string} iso */
export const monthTitle = (iso) => format(iso, { month: 'long', year: 'numeric' });
/** e.g. "31 Aug 2027" @param {string} iso */
export const fullDate = (iso) => format(iso, { day: 'numeric', month: 'short', year: 'numeric' });
