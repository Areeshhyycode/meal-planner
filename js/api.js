/* =========================================================================
   api.js  →  TheMealDB ke saare network calls
   API: https://www.themealdb.com/api.php  (free, koi key nahi chahiye)
   Concepts: fetch, async/await, try/catch/throw, Promise.all, AbortController,
             URLSearchParams, in-memory caching.
   ========================================================================= */

const BASE = 'https://www.themealdb.com/api/json/v1/1';

/** Same request dobara na jaye — chhota memory cache (Map). */
const cache = new Map();

/**
 * Sab requests isi function se guzarti hain — ek jagah error handling.
 * @param {string} path   e.g. "search.php"
 * @param {Record<string,string>} params  e.g. { s: "chicken" }
 * @param {AbortSignal} [signal]  purani request cancel karne ke liye
 */
async function request(path, params = {}, signal) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${path}?${qs}`;

  if (cache.has(url)) return cache.get(url); // cache hit → network hi nahi

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Network error ${res.status} — ${res.statusText}`);

  const data = await res.json();
  cache.set(url, data);
  return data;
}

/* --------------------- Public API functions --------------------- */

/** Naam se search. Returns FULL meal objects. */
export async function searchByName(query, signal) {
  const data = await request('search.php', { s: query }, signal);
  return data.meals ?? []; // API null bhejta hai jab kuch na mile → ?? se [] banao
}

/** Ingredient se filter. NOTE: sirf {idMeal, strMeal, strMealThumb} milta hai. */
export async function filterByIngredient(ingredient, signal) {
  const data = await request('filter.php', { i: ingredient.trim() }, signal);
  return data.meals ?? [];
}

export async function filterByCategory(category, signal) {
  const data = await request('filter.php', { c: category }, signal);
  return data.meals ?? [];
}

export async function filterByArea(area, signal) {
  const data = await request('filter.php', { a: area }, signal);
  return data.meals ?? [];
}

/** Ek recipe ki poori detail id se. */
export async function getMealById(id, signal) {
  const data = await request('lookup.php', { i: id }, signal);
  return data.meals?.[0] ?? null; // optional chaining on array
}

/** Random recipe (cache bypass — har baar naya chahiye). */
export async function getRandomMeal() {
  const res = await fetch(`${BASE}/random.php`);
  if (!res.ok) throw new Error('Random fetch fail');
  const data = await res.json();
  return data.meals?.[0] ?? null;
}

export async function listCategories() {
  const data = await request('list.php', { c: 'list' });
  return (data.meals ?? []).map((m) => m.strCategory);
}

export async function listAreas() {
  const data = await request('list.php', { a: 'list' });
  return (data.meals ?? []).map((m) => m.strArea);
}

/**
 * Bohot saari ids ki full detail ek saath (parallel).
 * Promise.all → sab requests ek saath chalti hain, serial loop se kaafi tez.
 * allSettled isliye ke ek fail ho to baaki na maren.
 */
export async function getMealsByIds(ids) {
  const settled = await Promise.allSettled(ids.map((id) => getMealById(id)));
  return settled
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
}
