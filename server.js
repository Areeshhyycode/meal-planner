/* =========================================================================
   server.js  →  Chhota Node backend
   Do kaam karta hai:
     1. Poori site serve karta hai (index.html, css, js)  → ek hi origin, CORS ka jhanjhat nahi
     2. /api/meal-plan  → Groq (AI) ko call karta hai

   ⭐ API key sirf YAHAN hai (.env se). Browser ko kabhi nahi jaati.
      Isi ko "proxy pattern" kehte hain — frontend apne server se baat karta hai,
      server secret rakh kar aage baat karta hai.

   Concepts: ES modules in Node, express, middleware, req/res, env vars,
             fetch server-side, AbortSignal.timeout, input validation.
   ========================================================================= */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // ESM me __dirname nahi hota
const PORT = process.env.PORT ?? 8787;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

const app = express();
app.use(express.json({ limit: '32kb' })); // JSON body parse karne wala middleware
app.use(express.static(HERE));            // index.html, css/, js/ serve karo

/* -------------------------------------------------------------------------
   AI ka output shape — "structured output".
   Ye schema model ko FORCE karta hai ke bilkul isi shape me JSON de.
   strict:true ka matlab: har property `required` me honi chahiye aur
   additionalProperties:false. Isliye JSON.parse kabhi fail nahi hoti.
   ------------------------------------------------------------------------- */
const PLAN_SCHEMA = {
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

const SYSTEM_PROMPT = `You are a practical weekly meal planner.

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

/* ------------------------------- API route ------------------------------- */
app.post('/api/meal-plan', async (req, res) => {
  if (!GROQ_KEY) {
    return res.status(500).json({
      error: 'GROQ_API_KEY set nahi hai. .env file banao aur `npm start` se chalao.',
    });
  }

  // ---- Input validation: client par kabhi bharosa mat karo ----
  const days = clamp(Number(req.body?.days) || 7, 1, 7);
  const mealsPerDay = clamp(Number(req.body?.mealsPerDay) || 1, 1, 3);
  const servings = clamp(Number(req.body?.servings) || 2, 1, 12);
  const wish = String(req.body?.prompt ?? '').slice(0, 800).trim();

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

  try {
    const groqRes = await fetch(GROQ_URL, {
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
      signal: AbortSignal.timeout(90_000), // 90s se zyada lage to chhod do
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text();
      console.error('[groq]', groqRes.status, detail.slice(0, 400));
      return res
        .status(502)
        .json({ error: `AI service error (${groqRes.status}). Thodi der baad try karo.` });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI ne khaali jawab diya');

    const plan = JSON.parse(content); // strict schema ki wajah se ye safe hai
    res.json({ plan, usage: data.usage ?? null, model: data.model ?? MODEL });
  } catch (err) {
    console.error('[meal-plan]', err);
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'AI ne bohot time liya. Din kam karke try karo.' : 'Plan generate nahi ho saka.',
    });
  }
});

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

app.listen(PORT, () => {
  console.log(`\n  🍲 Meal Planner  →  http://localhost:${PORT}`);
  console.log(`  AI model: ${MODEL}`);
  console.log(GROQ_KEY ? '  ✅ GROQ_API_KEY loaded\n' : '  ⚠️  GROQ_API_KEY missing — AI tab kaam nahi karega\n');
});
