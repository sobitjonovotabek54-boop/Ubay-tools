const PAGE_SIZE = 24;

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
};

const state = { products: [], categories: [], category: "", search: "", shown: PAGE_SIZE };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const detailDialog = $("#detail-dialog");

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function plural(count, forms) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function article(product) {
  return product.specs.find((spec) => spec.name === "Артикул")?.value || "";
}

/* ---------- Карточки ---------- */

function placeholder(product, extraClass = "") {
  return `<div class="placeholder ${extraClass}">${icon("wrench")}<b>${escapeHtml(product.model || product.category || "UBAY TOOLS")}</b><small>ФОТО В TELEGRAM</small></div>`;
}

function productCard(product) {
  const facts = product.specs.filter((spec) => spec.name !== "Артикул").slice(0, 2)
    .map((spec) => `<li><span>${escapeHtml(spec.name)}</span><b>${escapeHtml(spec.value)}</b></li>`).join("");
  const code = article(product);
  return `<article class="product-card" data-id="${product.id}">
    <button class="product-media" type="button" data-detail aria-label="Подробнее: ${escapeHtml(product.name)}">${placeholder(product)}<span class="product-chip">${escapeHtml(product.category)}</span></button>
    <div class="product-body">
      <p class="product-model">${escapeHtml(product.model || "Модель не указана")}${code ? ` · <span class="product-article">арт. ${escapeHtml(code)}</span>` : ""}</p>
      <h3 class="product-title"><button type="button" data-detail>${escapeHtml(product.name)}</button></h3>
      ${facts ? `<ul class="product-facts">${facts}</ul>` : ""}
      <div class="product-footer"><a class="owner" href="${escapeHtml(product.url)}" target="_blank" rel="noopener">Фото в Telegram</a><button class="link-button" type="button" data-detail>Подробнее ${icon("arrow")}</button></div>
    </div>
  </article>`;
}

/* ---------- Категории ---------- */

function renderCategoryTiles() {
  const tiles = $("#category-tiles");
  tiles.innerHTML = state.categories.map((category) => `
    <button class="category-tile" type="button" data-category="${escapeHtml(category.name)}">
      <span class="tile-cover">${category.image ? `<img src="${escapeHtml(category.image)}" alt="" loading="lazy">` : `<span class="tile-icon">${escapeHtml(category.name.charAt(0).toUpperCase())}</span>`}</span>
      <span class="tile-text"><b>${escapeHtml(category.name)}</b><small>${category.count} ${plural(category.count, ["товар", "товара", "товаров"])}</small></span>
      <span class="tile-arrow">${icon("arrow")}</span>
    </button>`).join("");
  const collapsible = state.categories.length > 12;
  tiles.classList.toggle("is-collapsed", collapsible);
  if (collapsible && !$("#tiles-more")) {
    tiles.insertAdjacentHTML("afterend", `<div class="tiles-more"><button id="tiles-more" class="button button-ghost" type="button">Показать все категории (${state.categories.length})</button></div>`);
    $("#tiles-more").addEventListener("click", (event) => {
      const collapsed = tiles.classList.toggle("is-collapsed");
      event.currentTarget.textContent = collapsed ? `Показать все категории (${state.categories.length})` : "Свернуть";
    });
  }
}

function renderCategoryList() {
  const total = state.products.length;
  $("#category-list").innerHTML = `<button class="category-button ${state.category ? "" : "is-active"}" type="button" data-filter="">Все товары <span>${total}</span></button>${state.categories.map((category) => `<button class="category-button ${state.category === category.name ? "is-active" : ""}" type="button" data-filter="${escapeHtml(category.name)}">${escapeHtml(category.name)} <span>${category.count}</span></button>`).join("")}`;
}

/* ---------- Каталог ---------- */

function searchText(product) {
  if (!product._search) {
    product._search = [product.name, product.model, product.category, product.description, ...product.specs.flatMap((spec) => [spec.name, spec.value])]
      .join(" ").toLocaleLowerCase("ru");
  }
  return product._search;
}

function visibleProducts() {
  const words = state.search.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const products = state.products.filter((product) => (!state.category || product.category === state.category)
    && words.every((word) => searchText(product).includes(word)));
  if ($("#sort-select").value === "name") products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return products;
}

function renderCatalog() {
  const products = visibleProducts();
  const total = state.products.length;
  $("#product-count").textContent = total;
  $("#catalog-status").textContent = state.category || state.search
    ? `Найдено ${products.length} ${plural(products.length, ["товар", "товара", "товаров"])}${state.category ? ` в категории «${state.category}»` : ""}`
    : `${total} ${plural(total, ["товар", "товара", "товаров"])} в ${state.categories.length} ${plural(state.categories.length, ["категории", "категориях", "категориях"])}`;
  $("#product-grid").innerHTML = products.slice(0, state.shown).map(productCard).join("");
  $("#product-grid").hidden = products.length === 0;
  $("#no-results").hidden = products.length > 0;
  const rest = products.length - state.shown;
  $("#load-more").hidden = rest <= 0;
  $("#load-more").textContent = `Показать ещё (${Math.max(rest, 0)})`;
  renderCategoryList();
}

function setFilter({ category = state.category, search = state.search, scroll = false } = {}) {
  state.category = category;
  state.search = search;
  state.shown = PAGE_SIZE;
  $("#search-input").value = search;
  renderCatalog();
  if (scroll) $("#catalog").scrollIntoView({ behavior: "smooth" });
}

/* ---------- Карточка товара ---------- */

function openDetails(product) {
  const specs = product.specs.map((spec) => `<div class="detail-spec"><dt>${escapeHtml(spec.name)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join("");
  $("#detail-content").innerHTML = `<button class="dialog-close" type="button" data-close-dialog aria-label="Закрыть">${icon("close")}</button>
    <div class="detail-layout">
      ${placeholder(product, "detail-image")}
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <p class="detail-model">${escapeHtml(product.model || "Модель не указана")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        ${product.description ? `<p class="detail-description">${escapeHtml(product.description)}</p>` : ""}
        ${specs ? `<dl class="detail-specs">${specs}</dl>` : `<p class="detail-empty-specs">Технические характеристики не указаны.</p>`}
        <div class="detail-links">
          <a class="button button-telegram" href="${escapeHtml(product.url)}" target="_blank" rel="noopener">${icon("image")}Фото в Telegram</a>
        </div>
      </div>
    </div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

/* ---------- Обработчики ---------- */

document.addEventListener("click", (event) => {
  const tile = event.target.closest("[data-category]");
  if (tile) {
    setFilter({ category: tile.dataset.category, search: "", scroll: true });
    return;
  }
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    setFilter({ category: filter.dataset.filter });
    return;
  }
  const detail = event.target.closest("[data-detail]");
  if (detail) {
    const product = state.products.find((item) => item.id === Number(detail.closest("[data-id]").dataset.id));
    if (product) openDetails(product);
    return;
  }
  if (event.target.closest("[data-close-dialog]")) {
    detailDialog.close();
    return;
  }
  if (event.target.closest("#main-nav a")) closeMenu();
});

detailDialog.addEventListener("click", (event) => {
  if (event.target === detailDialog) detailDialog.close();
});

function closeMenu() {
  $("#site-header").classList.remove("is-menu-open");
  $("#menu-button").setAttribute("aria-expanded", "false");
}

$("#menu-button").addEventListener("click", () => {
  const open = $("#site-header").classList.toggle("is-menu-open");
  $("#menu-button").setAttribute("aria-expanded", String(open));
});

$("#hero-search").addEventListener("submit", (event) => {
  event.preventDefault();
  setFilter({ category: "", search: $("#hero-search-input").value.trim(), scroll: true });
});

let searchTimer;
$("#search-input").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter({ search: event.target.value }), 150);
});

$("#sort-select").addEventListener("change", () => setFilter());
$("#reset-filters").addEventListener("click", () => setFilter({ category: "", search: "" }));
$("#load-more").addEventListener("click", () => {
  state.shown += PAGE_SIZE;
  renderCatalog();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  event.preventDefault();
  $("#search-input").focus();
  $("#catalog").scrollIntoView({ behavior: "smooth" });
});

/* ---------- Запуск ---------- */

async function init() {
  $$("i[data-icon]").forEach((element) => { element.outerHTML = icon(element.dataset.icon); });
  $("#year").textContent = new Date().getFullYear();
  try {
    const response = await fetch("data/products.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    state.products = data.products;
    state.categories = data.categories;
    if (data.updated) {
      $("#updated-note").textContent = `Данные обновлены ${new Date(data.updated).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
    }
  } catch {
    $("#load-error").hidden = false;
    $("#catalog-status").textContent = "Не удалось загрузить каталог";
    return;
  }
  $("#stat-products").textContent = state.products.length;
  $("#stat-categories").textContent = state.categories.length;
  $("#stat-specs").textContent = state.products.filter((product) => product.specs.length >= 2).length;
  renderCategoryTiles();
  renderCatalog();
}

init();
