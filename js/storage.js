/* =========================================================================
   storage.js  →  localStorage ka chhota wrapper
   Concepts: JSON.stringify / JSON.parse, try..catch, default values,
             Set aur Map ko serialize karna.
   ========================================================================= */

const PREFIX = 'mp:'; // sab keys prefix ke saath, taake dusre apps se clash na ho

/**
 * localStorage se padho. Agar key nahi hai ya JSON corrupt hai to fallback do.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] "${key}" parse fail — fallback use kar rahe hain`, err);
    return fallback;
  }
}

/** localStorage me likho (object → string). */
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    // QuotaExceededError (storage full / private mode)
    console.error('[storage] save fail', err);
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

/** Sab app keys uda do (debug ke liye: storage.clearAll() console me). */
export function clearAll() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
