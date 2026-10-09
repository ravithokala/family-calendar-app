// @ts-check

import { call } from './api.js';

/**
 * Milestone photos on the phone (ADR-113).
 * - Shrinking before upload: the long side at most 3000 px (sharp for a large print), and a 400 px
 *   copy for the screen, both JPEG, the right way up (the browser applies the camera's rotation).
 * - A store of their own (IndexedDB), apart from the service worker's saved copies, which it clears.
 *   The phone cannot open private Drive files, so a photo comes once through the server, then from here.
 *   Cleared with the saved answers, on sign-out and when the session ends (cache.clear, ADR-105).
 */

const DB = 'fc.photos';
const STORE = 'images';
const FULL_SIDE = 3000;
const THUMB_SIDE = 400;
const QUALITY = 0.85;

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest} use
 * @returns {Promise<any>}
 */
async function withStore(mode, use) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = use(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * A photo to show: from this phone's store, else fetched once through the server and kept.
 * @param {string} fileId
 * @returns {Promise<string|null>}  a data: URL, or null if it could not be had
 */
export async function photoUrl(fileId) {
  try {
    const saved = await withStore('readonly', (s) => s.get(fileId));
    if (typeof saved === 'string') return saved;
  } catch (e) { /* no store: fetch it */ }
  try {
    const r = await call('milestones.photo', { file_id: fileId });
    if (!r.ok) return null;
    const url = `data:image/jpeg;base64,${r.data.base64}`;
    try { await withStore('readwrite', (s) => s.put(url, fileId)); } catch (e) { /* shown, not kept */ }
    return url;
  } catch (e) {
    return null;
  }
}

/** Forgets every photo kept on this phone (sign-out, session ended). */
export function forgetPhotos() {
  try { indexedDB.deleteDatabase(DB); } catch (e) { /* nothing kept */ }
}

/**
 * @param {HTMLImageElement} img
 * @param {number} side  the longest side wanted
 * @returns {Promise<string>}  JPEG as base64 (no data: prefix)
 */
async function scaled(img, side) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('the photo could not be prepared');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(/** @type {Blob} */ (blob));
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * A picked photo, shrunk for upload: the photo and its small copy, with the photo's size.
 * @param {File} file
 * @returns {Promise<{ photo_base64: string, thumb_base64: string, width: number, height: number }>}
 */
export async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, FULL_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    return {
      photo_base64: await scaled(img, FULL_SIDE),
      thumb_base64: await scaled(img, THUMB_SIDE),
      width: Math.max(1, Math.round(img.naturalWidth * scale)),
      height: Math.max(1, Math.round(img.naturalHeight * scale)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
