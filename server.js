/* =========================================================================
   server.js  →  LOCAL development server (npm start)

   Do kaam karta hai:
     1. Poori site serve karta hai (index.html, css, js)  → ek hi origin, CORS ka jhanjhat nahi
     2. /api/meal-plan  → AI plan banata hai

   ⚠️ Ye file Vercel par NAHI chalti. Vercel long-running server nahi chalata —
      waha `api/meal-plan.js` (serverless function) chalti hai aur static files
      Vercel khud serve karta hai. Dono jagah ka asli logic ek hi hai:
      `lib/meal-plan.js`. Isi ko code reuse kehte hain — logic ek jagah,
      transport (express ya serverless) alag alag.

   Concepts: ES modules in Node, express, middleware, req/res, env vars.
   ========================================================================= */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMealPlan } from './lib/meal-plan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // ESM me __dirname nahi hota
const PORT = process.env.PORT ?? 8787;

const app = express();
app.use(express.json({ limit: '32kb' })); // JSON body parse karne wala middleware
app.use(express.static(HERE));            // index.html, css/, js/ serve karo

app.post('/api/meal-plan', async (req, res) => {
  try {
    const result = await generateMealPlan(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error('[meal-plan]', err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Plan generate nahi ho saka.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  🍲 Meal Planner  →  http://localhost:${PORT}`);
  console.log(`  AI model: ${process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'}`);
  console.log(
    process.env.GROQ_API_KEY
      ? '  ✅ GROQ_API_KEY loaded\n'
      : '  ⚠️  GROQ_API_KEY missing — AI panel kaam nahi karega\n'
  );
});
