/* =========================================================================
   state.js  →  Poori app ka "single source of truth"
   Concepts: module scope = private state, getters, spread operator,
             immutable updates, auto-persist to localStorage.
   Rule: DOM kabhi state ko seedha na chhue — sirf in functions ke through.
   ========================================================================= */

import { load, save } from './storage.js';
import { startOfWeek, toKey } from './dates.js';

const state = {
  /** { [id]: {id, name, thumb, category, area} } — object map = O(1) lookup */
  favorites: load('favorites', {}),
  /** { "2026-09-07": [ {id, name, thumb} ] } */
  plan: load('plan', {}),
  /** [ {key, name, qty, unit, bought, sources:[]} ] */
  shopping: load('shopping', []),
  /** current search results (persist nahi karte — ye temporary hai) */
  results: [],
  /** kaun sa hafta dekh rahe hain */
  weekStart: startOfWeek(new Date()),
};

/* ---------------- Subscribers (mini pub-sub) ---------------- */
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { listeners.forEach((fn) => fn(what, state)); }

export const getState = () => state;

/* ---------------- Favorites ---------------- */
export function isFavorite(id) {
  return Object.hasOwn(state.favorites, id);
}

export function toggleFavorite(meal) {
  if (isFavorite(meal.id)) {
    const { [meal.id]: _removed, ...rest } = state.favorites; // destructure se delete
    state.favorites = rest;
  } else {
    state.favorites = {
      ...state.favorites,
      [meal.id]: { id: meal.id, name: meal.name, thumb: meal.thumb,
                   category: meal.category ?? '', area: meal.area ?? '' },
    };
  }
  save('favorites', state.favorites);
  emit('favorites');
  return isFavorite(meal.id);
}

export const favoriteList = () => Object.values(state.favorites);

/* ---------------- Weekly plan ---------------- */
export function setWeekStart(date) {
  state.weekStart = startOfWeek(date);
  emit('week');
}

export function addToPlan(dateKey, meal) {
  const day = state.plan[dateKey] ?? [];
  if (day.some((m) => m.id === meal.id)) return false;   // duplicate rok do
  state.plan = {
    ...state.plan,
    [dateKey]: [...day, { id: meal.id, name: meal.name, thumb: meal.thumb }],
  };
  save('plan', state.plan);
  emit('plan');
  return true;
}

export function removeFromPlan(dateKey, mealId) {
  const day = (state.plan[dateKey] ?? []).filter((m) => m.id !== mealId);
  const next = { ...state.plan, [dateKey]: day };
  if (day.length === 0) delete next[dateKey];            // khaali din store na karo
  state.plan = next;
  save('plan', state.plan);
  emit('plan');
}

/** Drag & drop: ek din se dusre din shift karna. */
export function moveInPlan(fromKey, toKey_, mealId) {
  if (fromKey === toKey_) return;
  const meal = (state.plan[fromKey] ?? []).find((m) => m.id === mealId);
  if (!meal) return;
  removeFromPlan(fromKey, mealId);
  addToPlan(toKey_, meal);
}

export function clearWeek(dateKeys) {
  const next = { ...state.plan };
  dateKeys.forEach((k) => delete next[k]);
  state.plan = next;
  save('plan', state.plan);
  emit('plan');
}

/** Us hafte ke saare meals (flat array). */
export function mealsOfWeek(dateKeys) {
  return dateKeys.flatMap((k) => state.plan[k] ?? []);
}

/* ---------------- Search results ---------------- */
export function setResults(list) { state.results = list; emit('results'); }

/* ---------------- Shopping list ---------------- */
export function setShopping(items) {
  state.shopping = items;
  save('shopping', state.shopping);
  emit('shopping');
}

export function toggleBought(key) {
  state.shopping = state.shopping.map((it) =>
    it.key === key ? { ...it, bought: !it.bought } : it
  );
  save('shopping', state.shopping);
  emit('shopping');
}

export function removeBought() {
  setShopping(state.shopping.filter((it) => !it.bought));
}

/* ---------------- Helper ---------------- */
export const keyOf = toKey;
