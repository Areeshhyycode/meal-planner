/* =========================================================================
   ai.js  →  AI Meal Plan Generator (browser side)

   Flow:
     1. Apne server (/api/meal-plan) ko poochho → AI dish names + search queries deta hai
     2. Har dish ko TheMealDB me dhoondo → asli recipe (id, photo) mile
     3. Planner ke dinon me bhar do

   ⭐ AI ko recipe IDs nahi pata — isliye wo sirf NAAM deta hai, aur matching
      hum yahan karte hain. Isi wajah se plan me hamesha asli, chalne wali
      recipes aati hain (AI hallucination ka risk khatam).

   Concepts: fetch POST, Promise.all (parallel matching), fallback chains,
             Set for dedupe, optional chaining, error boundaries.
   ========================================================================= */

import * as api from './api.js';
import * as S from './state.js';
import { weekDays, toKey } from './dates.js';

/** Apne backend se AI plan mangao. */
export async function requestPlan({ prompt, days, mealsPerDay, servings }) {
  const res = await fetch('/api/meal-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, days, mealsPerDay, servings }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
  return data; // { plan, usage, model }
}

/* -------------------------------------------------------------------------
   Matching: ek AI meal ke liye TheMealDB candidates dhoondo.
   Queries ko ORDER me try karte hain — best pehle, phir broad.
   Aakhir me mainIngredient se filter (last resort).
   Ek meal ke liye kai candidates laate hain taake dedupe ke waqt
   dusra option available ho.
   ------------------------------------------------------------------------- */
async function findCandidates(aiMeal) {
  const queries = [...(aiMeal.queries ?? []), aiMeal.dish].filter(Boolean);

  for (const q of queries) {
    try {
      const hits = await api.searchByName(q);
      if (hits.length) return hits.map(toMeal);
    } catch {
      /* ek query fail ho to agli try karo */
    }
  }

  // Fallback: main ingredient se
  if (aiMeal.mainIngredient) {
    try {
      const hits = await api.filterByIngredient(aiMeal.mainIngredient);
      if (hits.length) return hits.slice(0, 12).map(toMeal);
    } catch {
      /* ignore */
    }
  }

  return []; // kuch nahi mila
}

function toMeal(m) {
  return {
    id: m.idMeal,
    name: m.strMeal,
    thumb: m.strMealThumb,
    category: m.strCategory ?? '',
    area: m.strArea ?? '',
  };
}

/**
 * AI plan → planner me daal do.
 *
 * @param {object} plan       server se aaya plan object
 * @param {Date}   weekStart  kis hafte me daalna hai
 * @param {(msg:string)=>void} onProgress  status text ke liye callback
 * @returns {{added:number, skipped:string[], matches:object[]}}
 */
export async function applyPlan(plan, weekStart, onProgress = () => {}) {
  const dates = weekDays(weekStart);

  // Saare meals ko ek flat list me kar lo, apne din ke saath
  const flat = (plan.days ?? []).flatMap((day) =>
    (day.meals ?? []).map((meal) => ({ ...meal, dayIndex: day.dayIndex }))
  );

  onProgress(`${flat.length} dishes ko real recipes se match kar rahe hain…`);

  // ⭐ Sab searches PARALLEL — 21 meals bhi 1-2 second me match ho jate hain.
  //    (Serial loop me 21 × ~300ms = 6+ second lagta.)
  const candidateLists = await Promise.all(flat.map((m) => findCandidates(m)));

  // Ab picking SERIAL hai — kyunki dedupe ke liye pata hona chahiye
  // ke pehle kaunsi recipes le chuke hain.
  const used = new Set(
    dates.flatMap((d) => (S.getState().plan[toKey(d)] ?? []).map((m) => m.id))
  );

  const skipped = [];
  const matches = [];
  let added = 0;

  flat.forEach((aiMeal, i) => {
    const date = dates[aiMeal.dayIndex];
    if (!date) return; // dayIndex week se bahar

    // pehla candidate jo abhi tak use nahi hua
    const pick = candidateLists[i].find((c) => !used.has(c.id));
    if (!pick) {
      skipped.push(aiMeal.dish);
      return;
    }

    used.add(pick.id);
    if (S.addToPlan(toKey(date), pick)) added++;
    matches.push({ ai: aiMeal, recipe: pick, date: toKey(date) });
  });

  return { added, skipped, matches };
}
