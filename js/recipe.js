/* =========================================================================
   recipe.js  →  API ke ajeeb data ko saaf shape me badalna + servings math
   Concepts: Array.from, map/filter/reduce, regex, destructuring,
             number parsing (fractions!), pure functions.
   ========================================================================= */

/**
 * TheMealDB ingredients ko strIngredient1..20 / strMeasure1..20 me deta hai.
 * Hum usko [{name, measure}] array me convert karte hain.
 */
export function extractIngredients(meal) {
  return Array.from({ length: 20 }, (_, i) => i + 1)      // [1..20]
    .map((i) => ({
      name: (meal[`strIngredient${i}`] || '').trim(),
      measure: (meal[`strMeasure${i}`] || '').trim(),
    }))
    .filter((ing) => ing.name !== '');                     // khaali slots hatao
}

/** Raw API meal → app ke andar ka clean object. */
export function normalizeMeal(meal) {
  return {
    id: meal.idMeal,
    name: meal.strMeal,
    thumb: meal.strMealThumb,
    category: meal.strCategory ?? '',
    area: meal.strArea ?? '',
    tags: (meal.strTags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    youtube: meal.strYoutube ?? '',
    instructions: meal.strInstructions ?? '',
    ingredients: extractIngredients(meal),
    baseServings: 4, // API servings nahi deta → hum assume karte hain
  };
}

/* ---------------- Servings calculator ka dil: measure parsing ---------------- */

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅛': 0.125,
};

/**
 * "1 1/2 cups" → { amount: 1.5, unit: "cups" }
 * "a pinch"    → { amount: null, unit: "a pinch" }   (scale nahi hoga)
 */
export function parseMeasure(measure) {
  if (!measure) return { amount: null, unit: '' };

  // unicode fractions ko normal text me badlo: "1½" → "1 1/2"
  let text = measure;
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replaceAll(char, ` ${fractionToString(val)} `);
  }

  // pattern: optional whole number + optional fraction (2, 1/2, 1 1/2, 2.5)
  const match = text.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  if (!match) return { amount: null, unit: measure.trim() };

  const [, numPart, rest] = match;
  return { amount: toNumber(numPart), unit: rest.trim() };
}

function toNumber(str) {
  if (str.includes(' ')) {                   // "1 1/2"
    const [whole, frac] = str.split(/\s+/);
    return Number(whole) + toNumber(frac);
  }
  if (str.includes('/')) {                   // "1/2"
    const [a, b] = str.split('/').map(Number);
    return b ? a / b : 0;
  }
  return Number(str);
}

function fractionToString(v) {
  const map = { 0.5: '1/2', 0.25: '1/4', 0.75: '3/4', 0.2: '1/5', 0.125: '1/8' };
  return map[v] ?? String(v);
}

/** 0.333333 → "1/3", 1.5 → "1 1/2", 2 → "2" (display ke liye) */
export function prettyAmount(n) {
  if (n === null || Number.isNaN(n)) return '';
  const whole = Math.floor(n);
  const frac = n - whole;
  const table = [[0.125, '1/8'], [0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'],
                 [2 / 3, '2/3'], [0.75, '3/4']];
  const hit = table.find(([val]) => Math.abs(frac - val) < 0.04);

  if (hit) return whole ? `${whole} ${hit[1]}` : hit[1];
  if (frac < 0.04) return String(whole);
  return String(Math.round(n * 100) / 100); // 2 decimal tak
}

/**
 * Servings badalne par ingredient list scale karo.
 * factor = newServings / baseServings
 */
export function scaleIngredients(ingredients, factor) {
  return ingredients.map((ing) => {
    const { amount, unit } = parseMeasure(ing.measure);
    if (amount === null) return { ...ing, scaled: ing.measure }; // "to taste" waghera
    return { ...ing, scaled: `${prettyAmount(amount * factor)} ${unit}`.trim() };
  });
}
