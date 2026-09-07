/* =========================================================================
   lib/meal-plan.js  →  AI plan banane ka asli logic (shared)

   Ye file DONO jagah use hoti hai:
     • server.js          → local development (npm start)
     • api/meal-plan.js   → Vercel par serverless function

   Isliye yahan koi express / req / res nahi hai — sirf pure logic.
   Yehi "separation of concerns" hai: transport alag, business logic alag.

   Concepts: module reuse, custom Error properties, input validation,
             fetch server-side, AbortSignal.timeout.
   ========================================================================= */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/* -------------------------------------------------------------------------
   AI ka output shape — "structured output".
   strict:true ka matlab: har property `required` me honi chahiye aur
   additionalProperties:false. Isliye JSON.parse kabhi fail nahi hoti.
   ------------------------------------------------------------------------- */
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'notes', 'days'],
  properties: {
    summary: { type: 'string', description: 'Poore plan ka 1-2 line summary.' },
    notes: {
      type: 'array',
      description: 'Chhote tips: prep, leftovers, budget waghera. Max 4.',
      items: { type: 'string' },
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayIndex', 'meals'],
        properties: {
          dayIndex: { type: 'integer', description: '0 = pehla din, 1 = doosra…' },
          meals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['slot', 'dish', 'queries', 'mainIngredient', 'why'],
              properties: {
                slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
                dish: { type: 'string', description: 'Dish ka naam, e.g. "Chicken Handi".' },
                queries: {
                  type: 'array',
                  description:
                    'TheMealDB me is dish ko dhoondne ke liye 2-3 CHHOTI search queries, ' +
                    'best pehle. Sirf dish ke naam ya uske hisse — 1 se 3 words. ' +
                    'e.g. ["Chicken Handi", "Chicken Curry", "Chicken"]. ' +
                    'Ye ingredients ki list ya sawaal NAHI hain.',
                  items: { type: 'string' },
                },
                mainIngredient: {
                  type: 'string',
                  description: 'Ek lafz ka main ingredient, fallback filter ke liye. e.g. "chicken".',
                },
                why: { type: 'string', description: 'Ek chhoti line: ye meal kyun chuna.' },
              },
            },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are a practical weekly meal planner.

The app looks up every dish you suggest in TheMealDB — a free database of well-known
international dishes (British, Italian, Indian, Mexican, Chinese, Thai, American,
Turkish, Moroccan, Japanese, French, Egyptian, Canadian, Croatian, Dutch, Greek,
Irish, Jamaican, Kenyan, Malaysian, Polish, Portuguese, Russian, Spanish, Tunisian,
Ukrainian, Uruguayan, Vietnamese).

Rules:
- Suggest COMMON, classic dishes that such a database would actually contain.
  Do not invent restaurant-style names.
- "queries" must be short SEARCH TERMS (1-3 words), best match first, and the last
  one should be broad (e.g. just "chicken" or "pasta") so a fallback match exists.
- Respect every constraint the user gives (diet, allergies, budget, calories, dislikes).
- Vary proteins and cuisines across the week. Do not repeat the same dish twice.
- "why" stays under 12 words.
Answer only with the JSON the schema describes.`;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Apni Error banao jisme HTTP status bhi ho — caller sirf `err.status` padhe. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Groq se meal plan mangao.
 * @param {{prompt?:string, days?:number, mealsPerDay?:number, servings?:number}} input
 * @returns {Promise<{plan:object, usage:object|null, model:string}>}
 * @throws {HttpError}
 */
export async function generateMealPlan(input = {}) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

  if (!GROQ_KEY) {
    throw new HttpError(
      500,
      'GROQ_API_KEY set nahi hai. Local par .env banao; Vercel par Settings → Environment Variables me daalo.'
    );
  }

  // ---- Input validation: client par kabhi bharosa mat karo ----
  const days = clamp(Number(input.days) || 7, 1, 7);
  const mealsPerDay = clamp(Number(input.mealsPerDay) || 1, 1, 3);
  const servings = clamp(Number(input.servings) || 2, 1, 12);
  const wish = String(input.prompt ?? '').slice(0, 800).trim();

  const userPrompt = [
    `Plan ${days} day(s), ${mealsPerDay} meal(s) per day, for ${servings} people.`,
    `Use dayIndex 0 to ${days - 1}.`,
    mealsPerDay === 1
      ? 'Use only the "dinner" slot.'
      : mealsPerDay === 2
        ? 'Use the "lunch" and "dinner" slots.'
        : 'Use "breakfast", "lunch" and "dinner".',
    wish ? `User request: ${wish}` : 'No special constraints — make it balanced and varied.',
  ].join('\n');

  let groqRes;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`, // ⭐ secret sirf server par
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8, // thoda creative, warna har baar wahi plan
        max_completion_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'meal_plan', strict: true, schema: PLAN_SCHEMA },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      // Vercel Hobby par function ~10s me timeout hoti hai, isliye 45s rakha
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new HttpError(504, 'AI ne bohot time liya. Din kam karke try karo.');
    }
    throw new HttpError(502, 'AI service tak pahunch nahi saka.');
  }

  if (!groqRes.ok) {
    const detail = await groqRes.text();
    console.error('[groq]', groqRes.status, detail.slice(0, 400));
    throw new HttpError(502, `AI service error (${groqRes.status}). Thodi der baad try karo.`);
  }

  const data = await groqRes.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'AI ne khaali jawab diya.');

  return {
    plan: JSON.parse(content), // strict schema ki wajah se ye safe hai
    usage: data.usage ?? null,
    model: data.model ?? MODEL,
  };
}
