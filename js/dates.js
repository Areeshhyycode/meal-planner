/* =========================================================================
   dates.js  →  Week calculations (Monday-start)
   Concepts: Date object, timezone-safe keys, Intl.DateTimeFormat, immutability.
   ⚠️ Date mutable hai — hamesha `new Date(d)` se copy banao.
   ========================================================================= */

/** "2026-09-07" — localStorage keys ke liye stable format */
export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Us hafte ka Monday nikalo jis me `date` hai. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();            // 0 = Sunday, 1 = Monday …
  const diff = day === 0 ? -6 : 1 - day; // Sunday ko pichhle Monday par le jao
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday se Sunday tak 7 Date objects. */
export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isToday(date) {
  return toKey(date) === toKey(new Date());
}

const dayFmt   = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const rangeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const dayName   = (d) => dayFmt.format(d);       // "Mon"
export const shortDate = (d) => shortFmt.format(d);     // "7 Sep"

export function weekLabel(weekStart) {
  const end = addDays(weekStart, 6);
  return `${shortDate(weekStart)} – ${rangeFmt.format(end)}`;
}
