# 🍲 Recipe & Meal Planner — JavaScript Revision Project

Vanilla JS (no framework, no build step). API: [TheMealDB](https://www.themealdb.com/api.php) — free, koi key nahi.

## Chalane ka tareeqa

```bash
npm install
npm start
# → http://localhost:8787
```

Bas. `server.js` khud hi site serve karta hai **aur** AI ka proxy bhi hai — ek hi
origin, isliye CORS ka koi jhanjhat nahi.

> Live Server bhi chal jayega, lekin us par **AI panel kaam nahi karega** (`/api/meal-plan`
> sirf Node server par hai). AI ke liye `npm start` hi use karo.

### .env

```
GROQ_API_KEY=gsk_...          # https://console.groq.com/keys se
GROQ_MODEL=openai/gpt-oss-120b
PORT=8787
```

`.env` `.gitignore` me hai — kabhi commit mat karna. Key kisi ko bhej di ho to
console se **rotate** kar do.

## File map — har file ka ek kaam

| File | Kaam | Yahan seekhne wale concepts |
|---|---|---|
| `index.html` | Structure, 4 views (tabs) | semantic HTML, `data-*`, `hidden` |
| `css/style.css` | Look | CSS variables, grid, dark mode |
| `js/storage.js` | localStorage wrapper | JSON.parse/stringify, try/catch |
| `js/api.js` | Saare network calls | fetch, async/await, Promise.all, AbortController, Map cache |
| `js/recipe.js` | API data → clean object, servings math | map/filter/reduce, regex, fractions |
| `js/nutrition.js` | Approx nutrition | object lookup, reduce, unit conversion |
| `js/dates.js` | Week calculations | Date object, Intl, immutability |
| `js/state.js` | Single source of truth | closures, spread, pub-sub, auto-persist |
| `js/shopping.js` | Plan → shopping list | Map grouping, Set, aggregation |
| `js/ui.js` | Sirf DOM banata hai | template literals, fragments, XSS escaping |
| `js/app.js` | Events → state → re-render | delegation, debounce, drag & drop |
| `js/ai.js` | AI plan → real recipes se match | fetch POST, Promise.all, fallback chain, Set dedupe |
| `lib/meal-plan.js` | AI plan ka asli logic (shared) | pure functions, custom Error, validation |
| `server.js` | Local dev server | Node ESM, express, static serve |
| `api/meal-plan.js` | Vercel serverless function | file-based routing, req/res |

**Golden rule:** data flow hamesha **api → state → ui**. UI kabhi seedha fetch nahi karti, aur state kabhi DOM ko nahi chhuti.

---

## Khud banane ka order (step by step)

Agar tum zero se likhna chahti ho, is order me karo — har step ke baad app chalti rehni chahiye:

1. **HTML + CSS** — sirf Search tab, khaali grid.
2. **`api.js` → searchByName** — console.log par results. `fetch` + `await` samajh lo.
3. **`ui.js` → recipeCard + renderGrid** — results screen par lao.
4. **`recipe.js` → extractIngredients** — modal me ingredients dikhao. (`strIngredient1..20` wala trick)
5. **`storage.js` + favorites** — refresh ke baad bhi ❤️ rahe.
6. **`dates.js` + planner grid** — 7 din, Monday start.
7. **Drag & drop** — card ko din par drop karo.
8. **`shopping.js`** — plan ke ingredients jama karo.
9. **Servings calculator + nutrition** — sabse mazedaar math.

---

## Concept-by-concept — code kahan dekhna hai

### 1. `async/await` + error handling — `api.js`
```js
async function request(path, params = {}, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Network error ${res.status}`);  // fetch 404 par reject NAHI hota!
  return res.json();
}
```
**Yaad rakho:** `fetch` sirf network fail hone par reject karta hai. 404/500 ke liye khud `res.ok` check karna parta hai.

### 2. `Promise.all` — parallel vs serial — `app.js → runSearch()`
```js
const [byName, byIng, byCat] = await Promise.all([...]);  // 3 requests ek saath
```
Agar tum `await a(); await b(); await c();` likhti to 3 guna time lagta.
`Promise.allSettled` (`api.js → getMealsByIds`) tab use karo jab ek fail hone par baaki bhi na maren.

### 3. `AbortController` — race condition ka ilaaj — `app.js`
Tez typing par purani request baad me aa kar nayi ka result overwrite kar sakti hai. Isliye:
```js
searchController?.abort();
searchController = new AbortController();
```
Aur catch me `if (err.name === 'AbortError') return;`

### 4. Array methods — `recipe.js`, `shopping.js`
- `Array.from({length: 20}, (_, i) => i + 1)` → 1..20 ka array (loop ke bagair)
- `.map().filter()` → strIngredient1..20 ko clean list me
- `.reduce()` → nutrition ka total (`nutrition.js`)
- `.flatMap()` → hafte ke saare din ke meals ek flat array me (`state.js`)
- `new Set()` → duplicate ids hatana, aur filters ka intersection
- `new Map()` → shopping list me same ingredient ko group karna

### 5. Dates — `dates.js`
```js
const d = new Date(date);   // ⚠️ hamesha copy banao — Date mutable hai
d.setDate(d.getDate() + n); // month/year khud handle ho jata hai
```
`toKey()` "2026-09-07" banata hai — `toISOString()` mat use karna, wo UTC me convert karta hai aur din badal sakta hai.

### 6. localStorage — `storage.js` + `state.js`
Sirf **strings** store hoti hain → `JSON.stringify` / `JSON.parse`.
Har mutation function (`toggleFavorite`, `addToPlan`) ke aakhir me `save()` — isliye kabhi "save karna bhool gaye" wala bug nahi hota.

### 7. Dynamic DOM — `ui.js`
- `element.replaceChildren()` → `innerHTML = ''` se behtar (listeners leak nahi hote)
- `DocumentFragment` → 20 cards ek reflow me
- `escapeHtml()` → API ka text kabhi seedha `innerHTML` me mat daalo (**XSS**)
- `dataset` → `data-id` se JS me `el.dataset.id`

### 8. Event delegation — `app.js → wireGrid()`
Har card par listener nahi — **parent** par ek listener, phir `e.target.closest('.card')`.
Naye cards render hone par bhi kaam karte hain, aur memory bachti hai.

### 9. Drag & Drop — `app.js` section 7
```js
dragstart → e.dataTransfer.setData('application/json', JSON.stringify(payload))
dragover  → e.preventDefault()   // ⭐ ye bhool gayi to drop kabhi fire nahi hoga
drop      → JSON.parse(e.dataTransfer.getData('application/json'))
```
`from` field batati hai ke ye naya card hai ya planner ke andar shift ho raha hai.

### 10. Debounce — `app.js`
```js
function debounce(fn, ms = 450) {
  let t;                                   // closure — timer yaad rehta hai
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
```
Har keystroke par API call nahi jayegi — sirf rukne ke 450ms baad.

---

## 🤖 AI Meal Plan Generator

Planner tab → **✨ AI Meal Plan** → Open. Likho *"high protein, no beef, quick weeknight meals"*
→ poora hafta bhar jata hai.

### Ye kaam kaise karta hai (3 steps)

```
Browser  ──POST /api/meal-plan──▶  server.js  ──▶  Groq (AI)
                                       │
                                       ▼  { dish, queries[], mainIngredient, why }
Browser  ◀────────────── JSON plan ────┘
   │
   └──▶ TheMealDB search  ──▶  asli recipe (id + photo)  ──▶  planner me daal do
```

**Sabse ahem baat:** AI ko recipe IDs nahi pata. Agar hum usse id maangte to wo
**bana deta** (hallucination) aur app crash hoti. Isliye AI sirf *dish ka naam +
search queries* deta hai, aur asli matching hum `js/ai.js` me karte hain.

### 1. Proxy pattern — API key browser me kabhi nahi (`server.js`)

Agar key frontend JS me hoti to koi bhi DevTools khol kar chura leta. Isliye:
browser sirf **apne** server ko call karta hai, aur server (jahan `.env` hai)
Groq se baat karta hai.

### 2. Structured output — JSON jo kabhi toot-ta nahi (`server.js` → `PLAN_SCHEMA`)

```js
response_format: {
  type: 'json_schema',
  json_schema: { name: 'meal_plan', strict: true, schema: PLAN_SCHEMA },
}
```

`strict: true` model ko **majboor** karta hai ke bilkul isi shape me JSON de.
Isliye `JSON.parse()` kabhi fail nahi hoti — "AI se JSON maangna aur phir regex se
nikalna" wala purana dard khatam. Schema me har field ki `description` likho —
model wahi padh kar samajhta hai ke `queries` me kya daalna hai.

### 3. Fallback ladder — matching (`js/ai.js` → `findCandidates`)

Har dish ke liye queries **order me** try hoti hain, best pehle:

```
"Chicken Teriyaki"  ❌  →  "Teriyaki Chicken"  ✅  → Teriyaki Chicken Casserole
"Shrimp Paella"     ❌  →  "Seafood Paella"    ❌  →  "shrimp"  ✅  → Shrimp Chow Fun
"Dal Tadka"         ❌  →  "Lentil Dal"        ❌  →  "lentils" ✅  → Tahini Lentils
```

Sab fail ho jayen to `filter.php?i=<mainIngredient>`. Isi liye AI se hum 3 queries
maangte hain jismein aakhri **broad** ho — taake match hamesha mile.

### 4. Parallel + serial ka farq (`js/ai.js` → `applyPlan`)

```js
const candidateLists = await Promise.all(flat.map(findCandidates)); // PARALLEL
flat.forEach((aiMeal, i) => { ... used.add(pick.id) });             // SERIAL
```

Searching **parallel** hai (21 meals ~2 second me). Lekin *picking* **serial** hai —
kyunki dedupe ke liye pata hona chahiye ke abhi tak kaunsi recipes le chuke hain.
Ye samajhna zaroori hai: **jab har step pichle step ka result chahta ho tabhi serial karo.**

## 🚀 Vercel par deploy

Live: https://meal-planner-tau-roan.vercel.app

### Vercel par server kaise chalta hai (aur kyun "Cannot GET /" aata hai)

Vercel **long-running server nahi chalata**. `app.listen()` waha kabhi nahi chalta.
Wo do cheezein karta hai:

```
repo ki baaki files   →  static hosting se serve  (index.html, css/, js/)
api/ folder ki files  →  serverless functions     (request aaye to chale, phir band)
```

File ka naam hi URL banta hai: `api/meal-plan.js` → `/api/meal-plan`.

Agar tum poora express server deploy karne ki koshish karo to Vercel usse chalata
nahi, aur `/` par **"Cannot GET /"** aata hai — ye express ka apna 404 message hai,
matlab express to zinda hai par static files uske bundle me hain hi nahi.

### Isi liye logic `lib/` me hai

```
lib/meal-plan.js   ← asli kaam (Groq call, schema, validation)
   ↑          ↑
server.js   api/meal-plan.js
(local)     (Vercel)
```

Ek hi logic, do transports. `lib/` me na express hai na `req`/`res` — sirf pure
functions. Yehi **separation of concerns** hai, aur isi wajah se dono jagah
behaviour bilkul same rehta hai.

### Env variable set karna zaroori hai

`.env` gitignored hai, isliye Vercel tak apne aap nahi pahunchti. Manually daalni parti hai:

**Vercel Dashboard → Project → Settings → Environment Variables**

| Name | Value |
|---|---|
| `GROQ_API_KEY` | `gsk_...` (apni key) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |

Save karke **Deployments → … → Redeploy** karna parta hai — env vars sirf naye
build me aati hain, purana deployment khud update nahi hota.

## Khud try karne wale challenges

1. **Servings ko planner me save karo** — abhi servings sirf modal me hai; use plan ke saath store karo aur shopping list us hisaab se banao.
2. **Meal type slots** — har din me Breakfast / Lunch / Dinner alag rows.
3. **Search history** — pichhli 5 searches localStorage me, chips ki tarah dikhao.
4. **Offline detection** — `window.addEventListener('offline', …)` se banner dikhao.
5. **Export plan** — hafte ka plan `.json` file me download karo (`Blob` + `URL.createObjectURL`).
6. **Pagination / infinite scroll** — `IntersectionObserver` se.
7. **Nutrition graph** — hafte ki daily calories ka bar chart pure CSS se.
8. **AI: streaming** — `stream: true` bhejo aur plan ko line-by-line aata hua dikhao (`ReadableStream` + `TextDecoder`).
9. **AI: shopping list samajhdar banao** — list ko aisle ke hisaab se group karwao (produce / dairy / meat).
10. **AI: "isko vegetarian banao"** — recipe modal me ek button, jo ingredients bhej kar substitutions maange.

---

## Common galtiyan (jo tumhe zaroor milengi 😄)

| Galti | Nateeja | Fix |
|---|---|---|
| `dragover` par `preventDefault()` na karna | drop kabhi fire nahi hota | `e.preventDefault()` |
| API `null` deta hai jab kuch na mile | `.map is not a function` | `data.meals ?? []` |
| `toISOString()` se date key | timezone se din shift | manual `YYYY-MM-DD` |
| Date ko seedha mutate karna | purani value bhi badal jati hai | `new Date(d)` copy |
| `innerHTML +=` loop me | slow + listeners toot-te hain | fragment + `appendChild` |
| localStorage me object daalna | `[object Object]` | `JSON.stringify` |
| AI se recipe ID maangna | fake IDs, app crash | AI se naam lo, ID apne database se |
| API key frontend JS me | koi bhi DevTools se chura le | server proxy + `.env` |
| AI se "JSON dena" sirf prompt me kehna | kabhi kabhi toota JSON | `response_format` + `strict: true` |
| Vercel par express server deploy karna | `Cannot GET /` | static root + `api/` serverless functions |
| Vercel par env var set na karna | AI 500 deta hai | Settings → Environment Variables → **Redeploy** |
