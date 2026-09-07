/* =========================================================================
   nutrition.js  →  Approx nutrition estimator
   TheMealDB nutrition nahi deta, isliye hum ek chhota lookup table + unit
   conversion se ANDAAZA lagate hain. (Real app me Edamam/Spoonacular use karo.)
   Concepts: object lookup, reduce, includes(), rounding, pure functions.
   ========================================================================= */

import { parseMeasure } from './recipe.js';

/** per 100 g → { kcal, protein, carbs, fat } */
const TABLE = {
  chicken: { kcal: 165, p: 31, c: 0,  f: 3.6 },
  beef:    { kcal: 250, p: 26, c: 0,  f: 15  },
  lamb:    { kcal: 294, p: 25, c: 0,  f: 21  },
  pork:    { kcal: 242, p: 27, c: 0,  f: 14  },
  fish:    { kcal: 206, p: 22, c: 0,  f: 12  },
  salmon:  { kcal: 208, p: 20, c: 0,  f: 13  },
  prawn:   { kcal: 99,  p: 24, c: 0,  f: 0.3 },
  egg:     { kcal: 155, p: 13, c: 1.1,f: 11  },
  rice:    { kcal: 130, p: 2.7,c: 28, f: 0.3 },
  pasta:   { kcal: 131, p: 5,  c: 25, f: 1.1 },
  flour:   { kcal: 364, p: 10, c: 76, f: 1   },
  bread:   { kcal: 265, p: 9,  c: 49, f: 3.2 },
  potato:  { kcal: 77,  p: 2,  c: 17, f: 0.1 },
  onion:   { kcal: 40,  p: 1.1,c: 9,  f: 0.1 },
  tomato:  { kcal: 18,  p: 0.9,c: 3.9,f: 0.2 },
  garlic:  { kcal: 149, p: 6.4,c: 33, f: 0.5 },
  carrot:  { kcal: 41,  p: 0.9,c: 10, f: 0.2 },
  spinach: { kcal: 23,  p: 2.9,c: 3.6,f: 0.4 },
  butter:  { kcal: 717, p: 0.9,c: 0.1,f: 81  },
  oil:     { kcal: 884, p: 0,  c: 0,  f: 100 },
  cheese:  { kcal: 402, p: 25, c: 1.3,f: 33  },
  milk:    { kcal: 42,  p: 3.4,c: 5,  f: 1   },
  cream:   { kcal: 340, p: 2.1,c: 2.8,f: 36  },
  yogurt:  { kcal: 59,  p: 10, c: 3.6,f: 0.4 },
  sugar:   { kcal: 387, p: 0,  c: 100,f: 0   },
  honey:   { kcal: 304, p: 0.3,c: 82, f: 0   },
  bean:    { kcal: 127, p: 8.7,c: 23, f: 0.5 },
  lentil:  { kcal: 116, p: 9,  c: 20, f: 0.4 },
  chocolate:{kcal: 546, p: 4.9,c: 61, f: 31  },
  nut:     { kcal: 607, p: 20, c: 21, f: 54  },
};

/** Unit → approx grams. Nahi mila to 50 g default. */
const UNIT_GRAMS = {
  g: 1, gram: 1, grams: 1, kg: 1000,
  ml: 1, l: 1000, litre: 1000, liter: 1000,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  tbs: 15, tbsp: 15, tablespoon: 15, tablespoons: 15,
  cup: 240, cups: 240,
  oz: 28, ounce: 28, ounces: 28, lb: 454, pound: 454,
  clove: 5, cloves: 5, slice: 25, slices: 25,
  can: 400, tin: 400, pinch: 1, dash: 1,
};

function gramsOf(measure) {
  const { amount, unit } = parseMeasure(measure);
  if (amount === null) return 20;                       // "to taste" → chhoti quantity
  const key = unit.toLowerCase().replace(/[^a-z]/g, ''); // "tbsp." → "tbsp"
  const perUnit = UNIT_GRAMS[key] ?? (unit === '' ? 80 : 50); // sirf number = 1 piece
  return amount * perUnit;
}

/** Ingredient name me se koi known keyword dhoondo. */
function lookup(name) {
  const lower = name.toLowerCase();
  const key = Object.keys(TABLE).find((k) => lower.includes(k));
  return key ? TABLE[key] : null;
}

/**
 * Poori recipe ka approx nutrition (per serving).
 * @returns {{kcal:number, protein:number, carbs:number, fat:number, coverage:number}}
 */
export function estimateNutrition(ingredients, servings = 4) {
  let matched = 0;

  const total = ingredients.reduce(
    (acc, ing) => {
      const info = lookup(ing.name);
      if (!info) return acc;            // unknown ingredient → skip
      matched++;
      const g = gramsOf(ing.measure) / 100; // per-100g table hai
      acc.kcal    += info.kcal * g;
      acc.protein += info.p    * g;
      acc.carbs   += info.c    * g;
      acc.fat     += info.f    * g;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const per = (v) => Math.round(v / servings);
  return {
    kcal: per(total.kcal),
    protein: per(total.protein),
    carbs: per(total.carbs),
    fat: per(total.fat),
    // kitne ingredients pehchane gaye → user ko bata do ke ye andaza hai
    coverage: ingredients.length ? Math.round((matched / ingredients.length) * 100) : 0,
  };
}
