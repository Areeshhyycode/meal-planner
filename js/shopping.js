/* =========================================================================
   shopping.js  →  Week ke plan se shopping list banao
   Concepts: Promise.all (parallel fetch), Map for grouping, reduce,
             normalization (case/plural), sorting.
   ========================================================================= */

import { getMealsByIds } from './api.js';
import { extractIngredients, parseMeasure, prettyAmount } from './recipe.js';

/** "Chicken Breasts" / "chicken breast" → same bucket */
function normalizeName(name) {
  return name.toLowerCase().trim().replace(/s$/, '');
}

/**
 * Plan ke meals se aggregated shopping list.
 * Same ingredient + same unit → quantities jama ho jati hain.
 * @param {{id:string,name:string}[]} plannedMeals
 */
export async function buildShoppingList(plannedMeals) {
  // ek hi recipe do din plan ho to bhi id unique chahiye fetch ke liye
  const uniqueIds = [...new Set(plannedMeals.map((m) => m.id))];
  const meals = await getMealsByIds(uniqueIds);

  // kis recipe ka count kitna hai (2 baar plan = double ingredients)
  const counts = plannedMeals.reduce((map, m) => {
    map.set(m.id, (map.get(m.id) ?? 0) + 1);
    return map;
  }, new Map());

  /** @type {Map<string, {key,name,qty,unit,bought,sources:string[]}>} */
  const bucket = new Map();

  meals.forEach((meal) => {
    const times = counts.get(meal.idMeal) ?? 1;

    extractIngredients(meal).forEach((ing) => {
      const { amount, unit } = parseMeasure(ing.measure);
      const norm = normalizeName(ing.name);
      const key = `${norm}|${unit.toLowerCase()}`; // name+unit = group key

      const existing = bucket.get(key);
      if (existing) {
        existing.qty = existing.qty === null || amount === null
          ? null                               // "to taste" mila to qty chhod do
          : existing.qty + amount * times;
        if (!existing.sources.includes(meal.strMeal)) existing.sources.push(meal.strMeal);
      } else {
        bucket.set(key, {
          key,
          name: ing.name,
          qty: amount === null ? null : amount * times,
          unit,
          bought: false,
          sources: [meal.strMeal],
        });
      }
    });
  });

  return [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Display text: "2 1/2 cups" ya sirf unit agar qty null hai. */
export function formatQty(item) {
  if (item.qty === null) return item.unit || 'as needed';
  return `${prettyAmount(item.qty)} ${item.unit}`.trim();
}

/** WhatsApp par bhejne ke liye plain text. */
export function listAsText(items) {
  return items
    .filter((i) => !i.bought)
    .map((i) => `• ${i.name} — ${formatQty(i)}`)
    .join('\n');
}
