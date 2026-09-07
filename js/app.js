/* =========================================================================
   app.js  →  Controller: events sunta hai, api/state ko bulata hai, ui ko
              re-render karwata hai.  (api → state → ui  ka flow)
   Concepts: event delegation, debounce, AbortController, async/await,
             Set intersection, drag & drop.
   ========================================================================= */

import * as api from './api.js';
import * as S from './state.js';
import * as UI from './ui.js';
import { $, $$, toast } from './ui.js';
import { normalizeMeal } from './recipe.js';
import { weekDays, weekLabel, toKey, addDays, dayName } from './dates.js';
import { buildShoppingList, listAsText } from './shopping.js';
import { requestPlan, applyPlan } from './ai.js';

/* ===================== 1. Tabs ===================== */
function showView(name) {
  $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${name}`));
  if (name === 'favorites') renderFavorites();
  if (name === 'planner') renderPlanner();
  if (name === 'shopping') renderShopping();
}

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) showView(btn.dataset.view);
});

/* ===================== 2. Search + filters ===================== */
let searchController = null; // purani request cancel karne ke liye

/** debounce: user type karta rahe to sirf aakhri call chale */
function debounce(fn, ms = 450) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function runSearch() {
  const query = $('#searchInput').value.trim();
  const ingredient = $('#ingredientInput').value.trim();
  const category = $('#categorySelect').value;
  const area = $('#areaSelect').value;
  const status = $('#searchStatus');
  const grid = $('#resultsGrid');

  if (!query && !ingredient && !category && !area) {
    grid.replaceChildren();
    status.textContent = 'Type something and hit Search 👆';
    return;
  }

  searchController?.abort(); // pichhli request band
  searchController = new AbortController();
  const { signal } = searchController;

  UI.renderSkeletons(grid);
  status.textContent = 'Loading…';

  try {
    // saare filters PARALLEL me chalao — Promise.all
    const [byName, byIng, byCat, byArea] = await Promise.all([
      query ? api.searchByName(query, signal) : null,
      ingredient ? api.filterByIngredient(ingredient, signal) : null,
      category ? api.filterByCategory(category, signal) : null,
      area ? api.filterByArea(area, signal) : null,
    ]);

    const lists = [byName, byIng, byCat, byArea].filter(Boolean);
    // base = pehli list, phir baaki lists ke id-Sets se intersect (AND logic)
    const sets = lists.slice(1).map((l) => new Set(l.map((m) => m.idMeal)));
    let meals = lists[0].filter((m) => sets.every((s) => s.has(m.idMeal)));

    meals = meals.map((m) => ({
      id: m.idMeal,
      name: m.strMeal,
      thumb: m.strMealThumb,
      category: m.strCategory ?? '',
      area: m.strArea ?? '',
    }));

    const sort = $('#sortSelect').value;
    if (sort === 'az') meals.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'za') meals.sort((a, b) => b.name.localeCompare(a.name));

    S.setResults(meals);
    UI.renderGrid(grid, meals);
    status.textContent = meals.length
      ? `${meals.length} recipes mile 🎉`
      : 'Kuch nahi mila. Filters thode kam karo.';
  } catch (err) {
    if (err.name === 'AbortError') return; // cancel hui request → chup raho
    console.error(err);
    grid.replaceChildren();
    status.textContent = `⚠️ ${err.message}. Internet check karo.`;
  }
}

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});
$('#ingredientInput').addEventListener('input', debounce(runSearch));
$('#categorySelect').addEventListener('change', runSearch);
$('#areaSelect').addEventListener('change', runSearch);
$('#sortSelect').addEventListener('change', runSearch);
$('#clearFilters').addEventListener('click', () => {
  ['#searchInput', '#ingredientInput'].forEach((s) => ($(s).value = ''));
  ['#categorySelect', '#areaSelect'].forEach((s) => ($(s).value = ''));
  $('#sortSelect').value = 'none';
  runSearch();
});

$('#randomBtn').addEventListener('click', async () => {
  try {
    const meal = await api.getRandomMeal();
    openRecipe(meal.idMeal);
  } catch {
    toast('Random recipe nahi mili 😅');
  }
});

/** Dropdowns ko API se bharo (page load par ek dafa). */
async function loadFilterOptions() {
  try {
    const [cats, areas] = await Promise.all([api.listCategories(), api.listAreas()]);
    fill($('#categorySelect'), cats);
    fill($('#areaSelect'), areas);
  } catch {
    /* dropdown na bhare to app phir bhi chalti rahe */
  }

  function fill(select, values) {
    values.forEach((v) => select.appendChild(new Option(v, v)));
  }
}

/* ===================== 3. Card actions (event delegation) ===================== */
/* Har card par listener lagane ke bajaye PARENT par ek listener.
   Naye cards apne aap kaam karenge — yahi delegation ka faida hai. */
function wireGrid(gridSelector) {
  $(gridSelector).addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const meal = { id: card.dataset.id, name: card.dataset.name, thumb: card.dataset.thumb };
    const btn = e.target.closest('button');
    const action = btn?.dataset.action;

    if (action === 'fav') {
      const nowFav = S.toggleFavorite(meal);
      btn.classList.toggle('is-fav', nowFav);
      btn.textContent = nowFav ? '❤️' : '🤍';
      toast(nowFav ? 'Favorites me add ho gaya ❤️' : 'Favorites se hata diya');
      if (gridSelector === '#favoritesGrid') renderFavorites();
    } else if (action === 'plan') {
      const added = S.addToPlan(toKey(new Date()), meal);
      toast(added ? `"${meal.name}" aaj ke plan me add 🗓️` : 'Ye already planned hai');
    } else {
      openRecipe(meal.id); // card ya View button
    }
  });
}
wireGrid('#resultsGrid');
wireGrid('#favoritesGrid');

/* ===================== 4. Recipe modal + servings ===================== */
let currentRecipe = null;
let currentServings = 4;

async function openRecipe(id) {
  const modal = $('#modal');
  $('#modalBody').innerHTML = '<p class="status">Loading recipe…</p>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  try {
    const raw = await api.getMealById(id);
    if (!raw) throw new Error('Recipe nahi mili');
    currentRecipe = normalizeMeal(raw);
    currentServings = currentRecipe.baseServings;
    UI.renderRecipeModal($('#modalBody'), currentRecipe, currentServings);
  } catch (err) {
    $('#modalBody').innerHTML = `<p class="status">⚠️ ${UI.escapeHtml(err.message)}</p>`;
  }
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
  currentRecipe = null;
}

$('#modal').addEventListener('click', (e) => {
  if (e.target.dataset.close !== undefined) return closeModal();
  if (!currentRecipe) return;

  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.servings) {
    const delta = Number(btn.dataset.servings);
    currentServings = Math.min(20, Math.max(1, currentServings + delta));
    UI.renderRecipeModal($('#modalBody'), currentRecipe, currentServings);
  } else if (btn.dataset.action === 'fav') {
    S.toggleFavorite(currentRecipe);
    UI.renderRecipeModal($('#modalBody'), currentRecipe, currentServings);
  } else if (btn.dataset.action === 'plan-today') {
    S.addToPlan(toKey(new Date()), currentRecipe);
    toast('Aaj ke plan me add ho gaya 🗓️');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
});

/* ===================== 5. Favorites view ===================== */
function renderFavorites() {
  const list = S.favoriteList();
  $('#favStatus').textContent = list.length
    ? `${list.length} saved recipes`
    : 'Abhi koi favorite nahi. Search karke 🤍 dabao.';
  UI.renderGrid($('#favoritesGrid'), list);
}

/* ===================== 6. Weekly planner ===================== */
function currentWeekKeys() {
  return weekDays(S.getState().weekStart).map(toKey);
}

function renderPlanner() {
  const { weekStart, plan } = S.getState();
  $('#weekLabel').textContent = weekLabel(weekStart);
  UI.renderPlanner($('#plannerGrid'), weekDays(weekStart), plan);
  UI.renderWeekSummary($('#weekSummary'), S.mealsOfWeek(currentWeekKeys()));
}

$('#prevWeek').addEventListener('click', () => {
  S.setWeekStart(addDays(S.getState().weekStart, -7));
  renderPlanner();
});
$('#nextWeek').addEventListener('click', () => {
  S.setWeekStart(addDays(S.getState().weekStart, 7));
  renderPlanner();
});
$('#thisWeek').addEventListener('click', () => {
  S.setWeekStart(new Date());
  renderPlanner();
});
$('#clearWeek').addEventListener('click', () => {
  if (confirm('Is hafte ka poora plan delete karein?')) {
    S.clearWeek(currentWeekKeys());
    renderPlanner();
  }
});

/* remove button planner ke andar */
$('#plannerGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remove"]');
  if (!btn) return;
  const meal = btn.closest('.meal');
  S.removeFromPlan(meal.dataset.date, meal.dataset.id);
  renderPlanner();
});

/* ===================== 7. Drag & Drop ===================== */
/* dragstart → dataTransfer me JSON rakho
   dragover  → preventDefault() (warna drop event fire hi nahi hota!)
   drop      → JSON padho, state update, re-render                        */

document.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('.card');
  const meal = e.target.closest?.('.meal');

  let payload = null;
  if (card) {
    payload = { id: card.dataset.id, name: card.dataset.name, thumb: card.dataset.thumb, from: null };
    card.classList.add('dragging');
  } else if (meal) {
    const thumb = meal.querySelector('img').src.replace('/preview', '');
    payload = {
      id: meal.dataset.id,
      name: meal.querySelector('span').textContent,
      thumb,
      from: meal.dataset.date,
    };
  }
  if (!payload) return;

  e.dataTransfer.setData('application/json', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copyMove';
});

document.addEventListener('dragend', (e) => {
  e.target.closest?.('.card')?.classList.remove('dragging');
});

$('#plannerGrid').addEventListener('dragover', (e) => {
  const day = e.target.closest('.day');
  if (!day) return;
  e.preventDefault(); // ⭐ ye line zaroori hai
  day.classList.add('drop-hover');
});

$('#plannerGrid').addEventListener('dragleave', (e) => {
  e.target.closest('.day')?.classList.remove('drop-hover');
});

$('#plannerGrid').addEventListener('drop', (e) => {
  const day = e.target.closest('.day');
  if (!day) return;
  e.preventDefault();
  day.classList.remove('drop-hover');

  try {
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const target = day.dataset.date;
    if (data.from) S.moveInPlan(data.from, target, data.id); // din badla
    else S.addToPlan(target, data); // naya add
    renderPlanner();
    toast(`"${data.name}" → ${target}`);
  } catch (err) {
    console.error('drop fail', err);
  }
});

/* ===================== 8. Shopping list ===================== */
function renderShopping() {
  const items = S.getState().shopping;
  $('#shopStatus').textContent = items.length
    ? `${items.filter((i) => !i.bought).length} items baaki hain`
    : 'List khaali hai — Build button dabao.';
  UI.renderShopping($('#shoppingList'), items);
}

$('#buildList').addEventListener('click', async () => {
  const meals = S.mealsOfWeek(currentWeekKeys());
  if (meals.length === 0) return toast('Pehle is hafte kuch plan karo 🗓️');

  $('#shopStatus').textContent = 'Ingredients jama kar rahe hain…';
  try {
    const items = await buildShoppingList(meals);
    // purani "bought" ticks bacha lo
    const old = new Map(S.getState().shopping.map((i) => [i.key, i.bought]));
    S.setShopping(items.map((i) => ({ ...i, bought: old.get(i.key) ?? false })));
    renderShopping();
    toast(`${items.length} items list me aa gaye 🛒`);
  } catch (err) {
    $('#shopStatus').textContent = `⚠️ ${err.message}`;
  }
});

$('#shoppingList').addEventListener('click', (e) => {
  const li = e.target.closest('.shop-item');
  if (!li) return;
  S.toggleBought(li.dataset.key);
  renderShopping();
});

$('#clearBought').addEventListener('click', () => {
  S.removeBought();
  renderShopping();
});

$('#copyList').addEventListener('click', async () => {
  const text = listAsText(S.getState().shopping);
  if (!text) return toast('List khaali hai');
  try {
    await navigator.clipboard.writeText(text);
    toast('Copy ho gayi 📋');
  } catch {
    toast('Copy allow nahi hui');
  }
});

/* ===================== 8.5 AI Meal Plan Generator ===================== */
$('#aiToggle').addEventListener('click', () => {
  const body = $('#aiBody');
  body.hidden = !body.hidden;
  $('#aiToggle').textContent = body.hidden ? 'Open' : 'Close';
});

$('#aiGenerate').addEventListener('click', async () => {
  const btn = $('#aiGenerate');
  const status = $('#aiStatus');
  const result = $('#aiResult');

  const payload = {
    prompt: $('#aiPrompt').value.trim(),
    days: Number($('#aiDays').value),
    mealsPerDay: Number($('#aiMeals').value),
    servings: Number($('#aiServings').value),
  };

  btn.disabled = true;                       // double-click se do requests na jaayein
  result.replaceChildren();
  status.textContent = 'AI soch raha hai… (10-30 seconds)';

  try {
    const { plan, model } = await requestPlan(payload);

    if ($('#aiClear').checked) S.clearWeek(currentWeekKeys());

    const { added, skipped, matches } = await applyPlan(
      plan,
      S.getState().weekStart,
      (msg) => { status.textContent = msg; }
    );

    renderPlanner();
    status.textContent = `✅ ${added} meals plan me add ho gaye  ·  model: ${model}`;
    renderAiResult(result, plan, matches, skipped);
    toast(`${added} meals planned ✨`);
  } catch (err) {
    console.error(err);
    status.textContent = `⚠️ ${err.message}`;
  } finally {
    btn.disabled = false;                    // fail ho ya pass — button wapas on
  }
});

function renderAiResult(root, plan, matches, skipped) {
  const esc = UI.escapeHtml;

  const rows = matches
    .map((m) => {
      const d = new Date(`${m.date}T00:00:00`);
      return `
        <div class="ai-row">
          <span class="ai-day">${dayName(d)}</span>
          <img src="${esc(m.recipe.thumb)}/preview" alt="">
          <span>${esc(m.recipe.name)}</span>
          <span class="ai-why">${esc(m.ai.why)}</span>
        </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="ai-summary">
      ${esc(plan.summary)}
      ${plan.notes?.length ? `<ul>${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="ai-plan-list">${rows}</div>
    ${skipped.length
      ? `<p class="ai-skipped">Ye dishes database me nahi mile: ${skipped.map(esc).join(', ')}</p>`
      : ''}`;
}

/* ===================== 9. Boot ===================== */
S.subscribe((what) => {
  if (what === 'favorites') $('#favCount').textContent = S.favoriteList().length;
});

$('#favCount').textContent = S.favoriteList().length;
loadFilterOptions();
renderPlanner();
renderShopping();
renderFavorites();
