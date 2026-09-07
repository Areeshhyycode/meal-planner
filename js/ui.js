/* =========================================================================
   ui.js  →  Sirf DOM banata hai. Yahan koi fetch / business logic nahi.
   Concepts: template literals, createElement vs innerHTML, dataset,
             XSS-safe escaping, document fragments, drag attributes.
   ========================================================================= */

import { isFavorite } from './state.js';
import { dayName, shortDate, isToday, toKey } from './dates.js';
import { scaleIngredients } from './recipe.js';
import { estimateNutrition } from './nutrition.js';
import { formatQty } from './shopping.js';

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** API se aaya text kabhi seedha innerHTML me mat daalo. */
export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---------------- Recipe card ---------------- */
export function recipeCard(meal) {
  const fav = isFavorite(meal.id);
  const el = document.createElement('article');
  el.className = 'card';
  el.draggable = true;                 // drag & drop enable
  el.dataset.id = meal.id;             // data-* attributes = DOM me chhota state
  el.dataset.name = meal.name;
  el.dataset.thumb = meal.thumb;

  el.innerHTML = `
    <img src="${escapeHtml(meal.thumb)}/preview" alt="${escapeHtml(meal.name)}" loading="lazy">
    <div class="card-body">
      <h3>${escapeHtml(meal.name)}</h3>
      <p class="meta">${escapeHtml([meal.category, meal.area].filter(Boolean).join(' · ') || 'Recipe')}</p>
      <div class="card-actions">
        <button class="view-btn" data-action="view">View</button>
        <button class="fav-btn ghost ${fav ? 'is-fav' : ''}" data-action="fav">${fav ? '❤️' : '🤍'}</button>
        <button class="plan-btn ghost" data-action="plan">+ Plan</button>
      </div>
    </div>`;
  return el;
}

export function renderGrid(container, meals) {
  container.replaceChildren();                 // purana saaf (innerHTML='' se behtar)
  const frag = document.createDocumentFragment(); // ek hi reflow
  meals.forEach((m) => frag.appendChild(recipeCard(m)));
  container.appendChild(frag);
}

export function renderSkeletons(container, n = 8) {
  container.replaceChildren();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    container.appendChild(s);
  }
}

/* ---------------- Weekly planner ---------------- */
export function renderPlanner(container, days, plan) {
  container.replaceChildren();
  const frag = document.createDocumentFragment();

  days.forEach((date) => {
    const key = toKey(date);
    const meals = plan[key] ?? [];

    const col = document.createElement('div');
    col.className = `day${isToday(date) ? ' is-today' : ''}`;
    col.dataset.date = key;

    col.innerHTML = `
      <div class="day-head">
        <span class="day-name">${dayName(date)}</span>
        <span class="day-date">${shortDate(date)}</span>
      </div>
      ${meals.map((m) => `
        <div class="meal" draggable="true" data-id="${m.id}" data-date="${key}">
          <img src="${escapeHtml(m.thumb)}/preview" alt="">
          <span title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
          <button data-action="remove" title="Remove">✕</button>
        </div>`).join('')}
      ${meals.length === 0 ? '<p class="day-empty">Drop a recipe here</p>' : ''}`;

    frag.appendChild(col);
  });

  container.appendChild(frag);
}

export function renderWeekSummary(el, meals) {
  if (meals.length === 0) {
    el.innerHTML = '<b>0 meals planned.</b> Search tab se recipes drag karo.';
    return;
  }
  const unique = new Set(meals.map((m) => m.id)).size;
  el.innerHTML = `<b>${meals.length} meals</b> planned this week (${unique} unique recipes).
    Shopping list banane ke liye 🛒 tab par jao.`;
}

/* ---------------- Shopping list ---------------- */
export function renderShopping(ul, items) {
  ul.replaceChildren();
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = `shop-item${item.bought ? ' bought' : ''}`;
    li.dataset.key = item.key;
    li.innerHTML = `
      <input type="checkbox" ${item.bought ? 'checked' : ''}>
      <span>${escapeHtml(item.name)}</span>
      <span class="qty">${escapeHtml(formatQty(item))}</span>
      <span class="from">${escapeHtml(item.sources.slice(0, 2).join(', '))}</span>`;
    ul.appendChild(li);
  });
}

/* ---------------- Recipe modal (servings + nutrition) ---------------- */
export function renderRecipeModal(body, recipe, servings) {
  const factor = servings / recipe.baseServings;
  const scaled = scaleIngredients(recipe.ingredients, factor);
  const n = estimateNutrition(recipe.ingredients, servings);
  const fav = isFavorite(recipe.id);

  body.innerHTML = `
    <div class="recipe-hero">
      <img src="${escapeHtml(recipe.thumb)}" alt="${escapeHtml(recipe.name)}">
      <div style="flex:1; min-width:220px">
        <h2 style="margin:.2rem 0">${escapeHtml(recipe.name)}</h2>
        <p>
          ${recipe.category ? `<span class="pill">${escapeHtml(recipe.category)}</span>` : ''}
          ${recipe.area ? `<span class="pill">${escapeHtml(recipe.area)}</span>` : ''}
          ${recipe.tags.map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('')}
        </p>

        <div class="servings">
          <button data-servings="-1">−</button>
          <b>${servings}</b> servings
          <button data-servings="+1">+</button>
        </div>

        <div class="card-actions" style="max-width:320px">
          <button data-action="fav" class="ghost ${fav ? 'is-fav' : ''}">${fav ? '❤️ Saved' : '🤍 Save'}</button>
          <button data-action="plan-today">+ Plan today</button>
          ${recipe.youtube ? `<a href="${escapeHtml(recipe.youtube)}" target="_blank" rel="noopener"
             style="flex:1"><button class="ghost" style="width:100%">▶ Video</button></a>` : ''}
        </div>
      </div>
    </div>

    <div class="nutri">
      <div><b>${n.kcal}</b><small>kcal / serving</small></div>
      <div><b>${n.protein} g</b><small>protein</small></div>
      <div><b>${n.carbs} g</b><small>carbs</small></div>
      <div><b>${n.fat} g</b><small>fat</small></div>
    </div>
    <p class="hint">≈ estimate — ${n.coverage}% ingredients matched our nutrition table.</p>

    <h3>Ingredients</h3>
    <table class="ing">
      ${scaled.map((i) => `
        <tr><td>${escapeHtml(i.scaled)}</td><td>${escapeHtml(i.name)}</td></tr>`).join('')}
    </table>

    <h3>Instructions</h3>
    <p class="steps">${escapeHtml(recipe.instructions)}</p>`;
}

/* ---------------- Toast ---------------- */
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
