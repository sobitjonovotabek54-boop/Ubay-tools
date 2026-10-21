const PAGE_SIZE = 24;

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
};

const state = {
  products: [],
  categories: [],
  sections: [],
  categoryMap: {},
  sectionId: 0,
  category: "",
  search: "",
  catFilter: "",
  activeSectionTab: 0,
  shown: PAGE_SIZE,
  expandedSections: new Set([1]),
};

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
  return (product.specs || []).find((spec) => spec.name === "Артикул")?.value || "";
}

function categoryImage(catName) {
  return state.categoryMap[catName]?.image || "";
}

/* ---------- Карточки товаров ---------- */

function placeholder(product, extraClass = "") {
  return `<div class="placeholder ${extraClass}">${icon("wrench")}<b>${escapeHtml(product.model || product.category || "UBAY TOOLS")}</b><small>UBAY TOOLS</small></div>`;
}

function productImage(product) {
  const imgSrc = product.image || categoryImage(product.category);
  if (imgSrc) {
    return `<div class="product-cover">
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.name)}" loading="lazy">
    </div>`;
  }
  return placeholder(product);
}

function productCard(product) {
  const facts = (product.specs || []).filter((spec) => spec.name !== "Артикул").slice(0, 2)
    .map((spec) => `<li><span>${escapeHtml(spec.name)}</span><b>${escapeHtml(spec.value)}</b></li>`).join("");
  const code = article(product);
  return `<article class="product-card" data-id="${product.id}">
    <button class="product-media" type="button" data-detail aria-label="Подробнее: ${escapeHtml(product.name)}">
      ${productImage(product)}
      <span class="product-chip">${escapeHtml(product.category)}</span>
    </button>
    <div class="product-body">
      <p class="product-model">${escapeHtml(product.model || "Модель не указана")}${code ? ` · <span class="product-article">арт. ${escapeHtml(code)}</span>` : ""}</p>
      <h3 class="product-title"><button type="button" data-detail>${escapeHtml(product.name)}</button></h3>
      ${facts ? `<ul class="product-facts">${facts}</ul>` : ""}
      <div class="product-footer">
        <a class="owner" href="${escapeHtml(product.url)}" target="_blank" rel="noopener">Фото в Telegram</a>
        <button class="link-button" type="button" data-detail>Подробнее ${icon("arrow")}</button>
      </div>
    </div>
  </article>`;
}

/* ---------- Блок категорий по разделам ---------- */

function renderSectionTabs() {
  const container = $("#section-tabs");
  if (!container) return;
  const totalProds = state.products.length;

  let tabsHtml = `<button class="section-tab ${state.activeSectionTab === 0 ? "is-active" : ""}" type="button" data-section-tab="0">
    <span>Все разделы</span>
    <span class="tab-badge">${totalProds}</span>
  </button>`;

  state.sections.forEach((sec) => {
    tabsHtml += `<button class="section-tab ${state.activeSectionTab === sec.id ? "is-active" : ""}" type="button" data-section-tab="${sec.id}">
      <span><b>${sec.id}.</b> ${escapeHtml(sec.title)}</span>
      <span class="tab-badge">${sec.product_count}</span>
    </button>`;
  });

  container.innerHTML = tabsHtml;
}

function renderCategoryTile(category) {
  const imgHtml = category.image
    ? `<img src="${escapeHtml(category.image)}" alt="${escapeHtml(category.name)}" loading="lazy">`
    : `<span class="tile-icon">${escapeHtml(category.name.charAt(0).toUpperCase())}</span>`;

  return `
    <button class="category-tile" type="button" data-category="${escapeHtml(category.name)}">
      <span class="tile-cover">${imgHtml}</span>
      <span class="tile-text">
        <b title="${escapeHtml(category.name)}">${escapeHtml(category.name)}</b>
        <small>${category.count} ${plural(category.count, ["товар", "товара", "товаров"])}</small>
      </span>
      <span class="tile-arrow">${icon("arrow")}</span>
    </button>`;
}

function renderCategoryTiles() {
  const container = $("#category-tiles");
  if (!container) return;

  renderSectionTabs();

  const sectionsToRender = state.activeSectionTab === 0
    ? state.sections
    : state.sections.filter((s) => s.id === state.activeSectionTab);

  let html = "";
  sectionsToRender.forEach((sec) => {
    const secCategories = state.categories.filter((c) => c.section_id === sec.id);
    if (!secCategories.length) return;

    html += `
      <div class="section-group" id="section-group-${sec.id}">
        <div class="section-group-head">
          <h3 class="section-group-title">
            <span class="section-num">${sec.id}</span>
            <span>${escapeHtml(sec.title)}</span>
          </h3>
          <span class="section-group-count">${secCategories.length} ${plural(secCategories.length, ["категория", "категории", "категорий"])} · ${sec.product_count} ${plural(sec.product_count, ["товар", "товара", "товаров"])}</span>
        </div>
        <div class="category-tiles">
          ${secCategories.map(renderCategoryTile).join("")}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ---------- Боковой список категорий (фильтр) ---------- */

function renderCategoryList() {
  const total = state.products.length;
  const filterQuery = (state.catFilter || "").toLowerCase().trim();

  let html = `<button class="category-button ${!state.category && !state.sectionId ? "is-active" : ""}" type="button" data-filter="" data-section-filter="0">
    <span><b>Все товары</b></span>
    <span class="count-pill">${total}</span>
  </button>`;

  state.sections.forEach((sec) => {
    const secCats = state.categories.filter((c) => c.section_id === sec.id);
    const visibleCats = filterQuery
      ? secCats.filter((c) => c.name.toLowerCase().includes(filterQuery))
      : secCats;

    if (filterQuery && visibleCats.length === 0) return;

    const isCurrentSection = state.sectionId === sec.id || secCats.some((c) => c.name === state.category);
    const isOpen = isCurrentSection || Boolean(filterQuery) || state.expandedSections.has(sec.id);

    html += `
      <div class="filter-section-group ${isOpen ? "is-open" : ""}" data-section-group="${sec.id}">
        <div class="filter-section-head">
          <button class="filter-section-title ${state.sectionId === sec.id && !state.category ? "is-active" : ""}" type="button" data-section-filter="${sec.id}">
            <span class="sec-num">${sec.id}.</span>
            <span class="sec-name">${escapeHtml(sec.title)}</span>
            <span class="count-pill">${sec.product_count}</span>
          </button>
          <button class="filter-section-toggle" type="button" data-section-toggle="${sec.id}" aria-label="Развернуть/свернуть">
            ${icon("chevron")}
          </button>
        </div>
        <div class="filter-subcategories" ${isOpen ? "" : "hidden"}>
          ${visibleCats.map((cat) => `
            <button class="category-button sub-category-button ${state.category === cat.name ? "is-active" : ""}" type="button" data-filter="${escapeHtml(cat.name)}">
              <span class="cat-bullet">•</span>
              <span class="cat-label">${escapeHtml(cat.name)}</span>
              <span class="count-pill">${cat.count}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  });

  $("#category-list").innerHTML = html;
}

/* ---------- Каталог: фильтрация и поиск ---------- */

function searchText(product) {
  if (!product._search) {
    product._search = [
      product.name,
      product.model,
      product.category,
      product.section_title,
      product.description,
      ...(product.specs || []).flatMap((spec) => [spec.name, spec.value]),
    ].join(" ").toLocaleLowerCase("ru");
  }
  return product._search;
}

function visibleProducts() {
  const words = state.search.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const products = state.products.filter((product) => {
    if (state.category && product.category !== state.category) return false;
    if (!state.category && state.sectionId && product.section_id !== state.sectionId) return false;
    if (words.length > 0 && !words.every((word) => searchText(product).includes(word))) return false;
    return true;
  });

  const sort = $("#sort-select").value;
  if (sort === "name") {
    products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  } else {
    // Default: ordered by client sections, then subcategory order, then product id
    products.sort((a, b) => {
      const secA = a.section_id || 999;
      const secB = b.section_id || 999;
      if (secA !== secB) return secA - secB;
      if (a.category !== b.category) {
        const catA = state.categoryMap[a.category]?.order || 999;
        const catB = state.categoryMap[b.category]?.order || 999;
        return catA - catB;
      }
      return b.id - a.id;
    });
  }
  return products;
}

function renderCatalog() {
  const products = visibleProducts();
  const total = state.products.length;
  $("#product-count").textContent = total;

  let statusText = "";
  if (state.category) {
    statusText = `Найдено ${products.length} ${plural(products.length, ["товар", "товара", "товаров"])} в категории «${state.category}»`;
  } else if (state.sectionId) {
    const sec = state.sections.find((s) => s.id === state.sectionId);
    statusText = `Раздел «${sec ? sec.title : ""}»: ${products.length} ${plural(products.length, ["товар", "товара", "товаров"])}`;
  } else if (state.search) {
    statusText = `Найдено ${products.length} ${plural(products.length, ["товар", "товара", "товаров"])} по запросу «${state.search}»`;
  } else {
    statusText = `${total} ${plural(total, ["товар", "товара", "товаров"])} в 10 разделах каталога (${state.categories.length} категорий)`;
  }
  $("#catalog-status").textContent = statusText;

  $("#product-grid").innerHTML = products.slice(0, state.shown).map(productCard).join("");
  $("#product-grid").hidden = products.length === 0;
  $("#no-results").hidden = products.length > 0;
  const rest = products.length - state.shown;
  $("#load-more").hidden = rest <= 0;
  $("#load-more").textContent = `Показать ещё (${Math.max(rest, 0)})`;

  renderCategoryList();
}

function setFilter({ category = state.category, sectionId = state.sectionId, search = state.search, scroll = false } = {}) {
  state.category = category;
  state.sectionId = category ? 0 : sectionId;
  state.search = search;
  state.shown = PAGE_SIZE;
  $("#search-input").value = search;

  if (category) {
    const cat = state.categoryMap[category];
    if (cat && cat.section_id) {
      state.expandedSections.add(cat.section_id);
    }
  } else if (sectionId) {
    state.expandedSections.add(sectionId);
  }

  renderCatalog();
  if (scroll) {
    const catalogEl = $("#catalog");
    if (catalogEl) catalogEl.scrollIntoView({ behavior: "smooth" });
  }
}

/* ---------- Карточка товара (модалка) ---------- */

function openDetails(product) {
  const specs = (product.specs || []).map((spec) => `<div class="detail-spec"><dt>${escapeHtml(spec.name)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join("");
  const imgSrc = product.image || categoryImage(product.category);
  const secTitle = product.section_title || state.categoryMap[product.category]?.section_title || "";

  $("#detail-content").innerHTML = `
    <button class="dialog-close" type="button" data-close-dialog aria-label="Закрыть">${icon("close")}</button>
    <div class="detail-layout">
      <div class="detail-media-wrap">
        ${imgSrc ? `<img class="detail-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.name)}">` : placeholder(product, "detail-image")}
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(secTitle ? `${secTitle} · ` : "")}${escapeHtml(product.category)}</p>
        <p class="detail-model">${escapeHtml(product.model || "Модель не указана")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        ${product.description ? `<p class="detail-description">${escapeHtml(product.description)}</p>` : ""}
        ${specs ? `<dl class="detail-specs">${specs}</dl>` : `<p class="detail-empty-specs">Технические характеристики не указаны.</p>`}
        <div class="detail-links">
          <a class="button button-telegram" href="${escapeHtml(product.url)}" target="_blank" rel="noopener">${icon("send")}Фото и описание в Telegram</a>
        </div>
      </div>
    </div>`;

  if (!detailDialog.open) detailDialog.showModal();
}

/* ---------- Обработчики событий ---------- */

document.addEventListener("click", (event) => {
  // Клик по вкладке раздела над категориями
  const tab = event.target.closest("[data-section-tab]");
  if (tab) {
    state.activeSectionTab = Number(tab.dataset.sectionTab);
    renderCategoryTiles();
    return;
  }

  // Клик по плитке категории
  const tile = event.target.closest("[data-category]");
  if (tile) {
    setFilter({ category: tile.dataset.category, sectionId: 0, search: "", scroll: true });
    return;
  }

  // Клик по разделу в боковом фильтре
  const secFilter = event.target.closest("[data-section-filter]");
  if (secFilter) {
    const secId = Number(secFilter.dataset.sectionFilter);
    setFilter({ category: "", sectionId: secId, search: "" });
    return;
  }

  // Кнопка разворачивания раздела
  const toggle = event.target.closest("[data-section-toggle]");
  if (toggle) {
    const secId = Number(toggle.dataset.sectionToggle);
    if (state.expandedSections.has(secId)) {
      state.expandedSections.delete(secId);
    } else {
      state.expandedSections.add(secId);
    }
    renderCategoryList();
    return;
  }

  // Клик по подкатегории в боковом фильтре
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    setFilter({ category: filter.dataset.filter, sectionId: 0 });
    return;
  }

  // Открытие подробностей товара
  const detail = event.target.closest("[data-detail]");
  if (detail) {
    const card = detail.closest("[data-id]");
    if (card) {
      const product = state.products.find((item) => item.id === Number(card.dataset.id));
      if (product) openDetails(product);
    }
    return;
  }

  // Закрытие диалога
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
  setFilter({ category: "", sectionId: 0, search: $("#hero-search-input").value.trim(), scroll: true });
});

let searchTimer;
$("#search-input").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter({ search: event.target.value }), 150);
});

const catFilterInput = $("#cat-filter-input");
if (catFilterInput) {
  let catFilterTimer;
  catFilterInput.addEventListener("input", (event) => {
    clearTimeout(catFilterTimer);
    catFilterTimer = setTimeout(() => {
      state.catFilter = event.target.value;
      renderCategoryList();
    }, 150);
  });
}

$("#sort-select").addEventListener("change", () => renderCatalog());

$("#reset-filters").addEventListener("click", () => {
  if (catFilterInput) catFilterInput.value = "";
  state.catFilter = "";
  setFilter({ category: "", sectionId: 0, search: "" });
});

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

/* ---------- Инициализация ---------- */

async function init() {
  $$("i[data-icon]").forEach((element) => {
    element.outerHTML = icon(element.dataset.icon);
  });
  $("#year").textContent = new Date().getFullYear();

  try {
    const response = await fetch("data/products.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    state.products = data.products || [];
    state.categories = data.categories || [];
    state.sections = data.sections || [];
    state.categoryMap = Object.fromEntries(state.categories.map((c) => [c.name, c]));

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
  $("#stat-specs").textContent = state.products.filter((product) => (product.specs || []).length >= 2).length;

  renderCategoryTiles();
  renderCatalog();
}

init();
