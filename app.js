const ROUTES = {
  "/": { page: "home", title: "Ubay Tools — каталог инструментов" },
  "/catalog": { page: "catalog", title: "Каталог — Ubay Tools" },
  "/login": { page: "login", title: "Вход — Ubay Tools", guestOnly: true },
  "/register": { page: "register", title: "Регистрация — Ubay Tools", guestOnly: true },
  "/admin": { page: "admin", title: "Админ-панель — Ubay Tools", adminOnly: true },
};

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

const state = {
  products: [],
  user: null,
  page: "",
  category: "",
  search: "",
  editingId: null,
  imageData: "",
  admin: { users: [], tab: "users", userSearch: "", productSearch: "" },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const productDialog = $("#product-dialog");
const detailDialog = $("#detail-dialog");
let toastTimer;

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function hydrateIcons(root = document) {
  $$("i[data-icon]", root).forEach((element) => {
    element.outerHTML = icon(element.dataset.icon);
  });
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

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function initials(text) {
  return (String(text || "").trim().charAt(0) || "U").toUpperCase();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось выполнить запрос.");
  return data;
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function canManage(product) {
  return Boolean(state.user && (state.user.is_admin || state.user.id === product.owner_id));
}

function findProduct(id) {
  return state.products.find((product) => product.id === Number(id));
}

function categoryCounts() {
  const counts = new Map();
  state.products.forEach((product) => {
    const category = product.category?.trim();
    if (category) counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts].sort(([left], [right]) => left.localeCompare(right, "ru"));
}

/* ---------- Навигация ---------- */

function currentPath() {
  return location.pathname.replace(/\/+$/, "") || "/";
}

function safeNext(value) {
  return value && ROUTES[value] && !ROUTES[value].guestOnly ? value : null;
}

function navigate(path, { replace = false } = {}) {
  if (path !== location.pathname + location.search) {
    history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
  route();
}

function route() {
  const path = currentPath();
  const config = ROUTES[path];
  const params = new URLSearchParams(location.search);
  closeMenu();
  if (config?.guestOnly && state.user) {
    navigate(safeNext(params.get("next")) || "/catalog", { replace: true });
    return;
  }
  if (config?.adminOnly && !state.user) {
    navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    return;
  }
  const page = config?.page || "notfound";
  if (page === "catalog") {
    state.category = params.get("category") || "";
    state.search = params.get("q") || "";
    $("#search-input").value = state.search;
  }
  if (page === "login" || page === "register") {
    $$(".form-error").forEach((element) => { element.textContent = ""; });
  }
  const changed = state.page !== page;
  state.page = page;
  $$("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  $$("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = config?.title || "Страница не найдена — Ubay Tools";
  if (changed) window.scrollTo({ top: 0, behavior: "instant" });
  renderPage();
}

function renderPage() {
  if (state.page === "home") renderHome();
  if (state.page === "catalog") renderCatalog();
  if (state.page === "admin") loadAdmin();
}

function closeMenu() {
  $("#site-header").classList.remove("is-menu-open");
  $("#menu-button").setAttribute("aria-expanded", "false");
}

function requireLogin() {
  navigate(`/login?next=${encodeURIComponent(currentPath())}`);
}

/* ---------- Аккаунт ---------- */

function renderAccount() {
  const user = state.user;
  $$("[data-show]").forEach((element) => {
    const rule = element.dataset.show;
    element.hidden = rule === "guest" ? Boolean(user) : rule === "user" ? !user : !user?.is_admin;
  });
  if (!user) return;
  $("#user-name").textContent = user.name;
  $("#user-role").textContent = user.is_admin ? "Администратор" : "Пользователь";
  $("#user-avatar").textContent = initials(user.name);
}

async function refreshProducts() {
  const catalog = await api("/api/products");
  state.products = catalog.products;
  renderPage();
}

/* ---------- Карточки ---------- */

function placeholder(product, large = false) {
  return `<div class="placeholder${large ? " detail-image" : ""}">${icon("wrench")}<b>${escapeHtml(product.model || "UBAY TOOLS")}</b><small>НЕТ ФОТО</small></div>`;
}

function productCard(product) {
  const media = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : placeholder(product);
  const facts = (product.specs || []).slice(0, 2)
    .map((spec) => `<li><span>${escapeHtml(spec.name)}</span><b>${escapeHtml(spec.value)}</b></li>`).join("");
  return `<article class="product-card" data-product-id="${product.id}">
    <button class="product-media" type="button" data-product-action="detail" aria-label="Подробнее: ${escapeHtml(product.name)}">${media}${product.category ? `<span class="product-chip">${escapeHtml(product.category)}</span>` : ""}</button>
    ${canManage(product) ? `<button class="card-edit" type="button" data-product-action="edit" aria-label="Редактировать товар" title="Редактировать">${icon("pencil")}</button>` : ""}
    <div class="product-body">
      <p class="product-model">${escapeHtml(product.model || "Модель не указана")}</p>
      <h3 class="product-title"><button type="button" data-product-action="detail">${escapeHtml(product.name)}</button></h3>
      ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>` : ""}
      ${facts ? `<ul class="product-facts">${facts}</ul>` : ""}
      <div class="product-footer"><span class="owner">${escapeHtml(product.owner_name || "Ubay Tools")}</span><button class="link-button" type="button" data-product-action="detail">Подробнее ${icon("arrow")}</button></div>
    </div>
  </article>`;
}

/* ---------- Главная ---------- */

function renderHome() {
  const products = state.products;
  const categories = categoryCounts();
  $("#stat-products").textContent = products.length;
  $("#stat-categories").textContent = categories.length;
  $("#stat-photos").textContent = products.filter((product) => product.image).length;
  $("#float-count").textContent = products.length;

  const latest = products[0];
  $("#hero-showcase").innerHTML = latest
    ? `<div class="showcase-media">${latest.image ? `<img src="${escapeHtml(latest.image)}" alt="">` : placeholder(latest)}</div>
       <div class="showcase-body"><span class="showcase-tag">Новинка</span><b>${escapeHtml(latest.name)}</b><small>${escapeHtml(latest.model || latest.category || "Ubay Tools")}</small></div>`
    : `<div class="showcase-media"><div class="placeholder">${icon("wrench")}<b>UBAY TOOLS</b><small>КАТАЛОГ ГОТОВ К НАПОЛНЕНИЮ</small></div></div>
       <div class="showcase-body"><span class="showcase-tag">Скоро</span><b>Здесь появятся товары</b><small>Добавьте первый товар в каталог</small></div>`;

  $("#home-categories-section").hidden = categories.length === 0;
  $("#home-categories").innerHTML = categories.slice(0, 8).map(([name, count]) => `
    <a class="category-tile" href="/catalog?category=${encodeURIComponent(name)}" data-link>
      <span class="tile-icon">${escapeHtml(initials(name))}</span>
      <b>${escapeHtml(name)}</b>
      <small>${count} ${plural(count, ["товар", "товара", "товаров"])}</small>
      <span class="tile-arrow">${icon("arrow")}</span>
    </a>`).join("");

  $("#home-latest").innerHTML = products.slice(0, 4).map(productCard).join("");
  $("#home-latest").hidden = products.length === 0;
  $("#home-latest-empty").hidden = products.length > 0;
}

/* ---------- Каталог ---------- */

function visibleProducts() {
  const query = state.search.toLocaleLowerCase("ru").trim();
  const products = state.products.filter((product) => {
    const matchesCategory = !state.category || product.category === state.category;
    const content = [product.name, product.model, product.category, product.description, ...(product.specs || []).flatMap((spec) => [spec.name, spec.value])].join(" ").toLocaleLowerCase("ru");
    return matchesCategory && (!query || content.includes(query));
  });
  if ($("#sort-select").value === "name") products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return products;
}

function syncCatalogUrl() {
  const params = new URLSearchParams();
  if (state.category) params.set("category", state.category);
  if (state.search.trim()) params.set("q", state.search.trim());
  const query = params.toString();
  history.replaceState({}, "", `/catalog${query ? `?${query}` : ""}`);
}

function renderCatalog() {
  const total = state.products.length;
  const products = visibleProducts();
  const categories = categoryCounts();
  $("#product-count").textContent = total;
  $("#catalog-status").textContent = total
    ? `Показано ${products.length} из ${total} ${plural(total, ["товара", "товаров", "товаров"])}`
    : "Товары добавляются владельцами";
  $("#category-list").innerHTML = `<button class="category-button ${state.category ? "" : "is-active"}" type="button" data-category="">Все товары <span>${total}</span></button>${categories.map(([name, count]) => `<button class="category-button ${state.category === name ? "is-active" : ""}" type="button" data-category="${escapeHtml(name)}">${escapeHtml(name)} <span>${count}</span></button>`).join("")}`;
  $("#product-grid").innerHTML = products.map(productCard).join("");
  $("#product-grid").hidden = products.length === 0;
  $("#empty-state").hidden = total > 0;
  $("#no-results").hidden = total === 0 || products.length > 0;
  $("#empty-add-button").hidden = !state.user;
}

/* ---------- Админ-панель ---------- */

async function loadAdmin() {
  const allowed = Boolean(state.user?.is_admin);
  $("#admin-denied").hidden = allowed;
  $("#admin-content").hidden = !allowed;
  if (!allowed) return;
  renderAdmin();
  try {
    const data = await api("/api/admin/users");
    state.admin.users = data.users;
    renderAdmin();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderAdmin() {
  const { users, tab } = state.admin;
  $("#admin-stat-users").textContent = users.length;
  $("#admin-stat-admins").textContent = users.filter((user) => user.is_admin).length;
  $("#admin-stat-products").textContent = state.products.length;
  $("#admin-stat-categories").textContent = categoryCounts().length;
  $("#tab-count-users").textContent = users.length;
  $("#tab-count-products").textContent = state.products.length;
  $$("[data-tab]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.tab === tab)));
  $$("[data-tab-panel]").forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tab; });

  const userQuery = state.admin.userSearch.toLocaleLowerCase("ru").trim();
  const filteredUsers = users.filter((user) => !userQuery || `${user.name} ${user.email}`.toLocaleLowerCase("ru").includes(userQuery));
  $("#admin-users").innerHTML = filteredUsers.length ? filteredUsers.map((user) => {
    const isSelf = user.id === state.user.id;
    return `<tr data-user-id="${user.id}">
      <td><div class="cell-main"><span class="avatar avatar-sm">${escapeHtml(initials(user.name))}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email)}</small></div></div></td>
      <td>${user.is_admin ? `<span class="badge badge-admin">${icon("shield")}Администратор</span>` : `<span class="badge badge-user">Пользователь</span>`}</td>
      <td class="num">${user.product_count}</td>
      <td class="muted">${formatDate(user.created_at)}</td>
      <td class="actions">${isSelf ? `<span class="self-note">Это вы</span>` : `<button class="button button-sm button-ghost" type="button" data-user-action="role">${user.is_admin ? "Снять права" : "Сделать админом"}</button><button class="button button-sm button-danger" type="button" data-user-action="delete">Удалить</button>`}</td>
    </tr>`;
  }).join("") : `<tr><td class="table-empty" colspan="5">${users.length ? "Пользователи не найдены." : "Загрузка..."}</td></tr>`;

  const productQuery = state.admin.productSearch.toLocaleLowerCase("ru").trim();
  const filteredProducts = state.products.filter((product) => !productQuery || [product.name, product.model, product.category, product.owner_name].join(" ").toLocaleLowerCase("ru").includes(productQuery));
  $("#admin-products").innerHTML = filteredProducts.length ? filteredProducts.map((product) => `
    <tr data-product-id="${product.id}">
      <td><div class="cell-main"><span class="thumb">${product.image ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy">` : escapeHtml(initials(product.name))}</span><div><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.model || "Модель не указана")}</small></div></div></td>
      <td>${product.category ? escapeHtml(product.category) : `<span class="muted">—</span>`}</td>
      <td>${escapeHtml(product.owner_name || "—")}</td>
      <td class="muted">${formatDate(product.updated_at)}</td>
      <td class="actions"><button class="button button-sm button-ghost" type="button" data-product-action="detail">Открыть</button><button class="button button-sm button-ghost" type="button" data-product-action="edit">Изменить</button><button class="button button-sm button-danger" type="button" data-product-action="delete">Удалить</button></td>
    </tr>`).join("") : `<tr><td class="table-empty" colspan="5">${state.products.length ? "Товары не найдены." : "В каталоге пока нет товаров."}</td></tr>`;
}

async function toggleUserRole(user) {
  const makeAdmin = !user.is_admin;
  const question = makeAdmin
    ? `Назначить «${user.name}» администратором? Он сможет управлять всеми товарами и пользователями.`
    : `Снять права администратора с «${user.name}»?`;
  if (!confirm(question)) return;
  try {
    await api(`/api/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ is_admin: makeAdmin }) });
    showToast(makeAdmin ? "Права администратора выданы." : "Права администратора сняты.");
    await loadAdmin();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteUser(user) {
  const products = user.product_count
    ? ` Вместе с ним будут удалены ${user.product_count} ${plural(user.product_count, ["товар", "товара", "товаров"])}.`
    : "";
  if (!confirm(`Удалить пользователя «${user.name}»?${products} Это действие нельзя отменить.`)) return;
  try {
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    showToast("Пользователь удалён.");
    await refreshProducts();
  } catch (error) {
    showToast(error.message, true);
  }
}

/* ---------- Товар: просмотр, редактор, удаление ---------- */

function openDetails(product) {
  const image = product.image
    ? `<img class="detail-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">`
    : placeholder(product, true);
  const specs = (product.specs || []).map((spec) => `<div class="detail-spec"><dt>${escapeHtml(spec.name)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join("");
  $("#detail-content").innerHTML = `<button class="dialog-close" type="button" data-close-dialog aria-label="Закрыть">${icon("close")}</button>
    <div class="detail-layout" data-product-id="${product.id}">
      ${image}
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(product.category || "Ubay Tools")}</p>
        <p class="detail-model">${escapeHtml(product.model || "Модель не указана")}</p>
        <h2>${escapeHtml(product.name)}</h2>
        ${product.description ? `<p class="detail-description">${escapeHtml(product.description)}</p>` : ""}
        ${specs ? `<dl class="detail-specs">${specs}</dl>` : `<p class="detail-empty-specs">Технические характеристики не указаны.</p>`}
        <p class="detail-owner">Добавил(а): ${escapeHtml(product.owner_name || "Ubay Tools")} · ${formatDate(product.updated_at)}</p>
        ${canManage(product) ? `<div class="dialog-actions detail-actions"><button class="button button-danger" type="button" data-product-action="delete">Удалить</button><button class="button button-primary" type="button" data-product-action="edit">${icon("pencil")}Редактировать</button></div>` : ""}
      </div>
    </div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function addSpecRow(name = "", value = "") {
  const row = document.createElement("div");
  row.className = "spec-row";
  row.innerHTML = `<input class="spec-name" maxlength="60" aria-label="Название характеристики" placeholder="Например, Мощность" value="${escapeHtml(name)}"><input class="spec-value" maxlength="160" aria-label="Значение характеристики" placeholder="Значение" value="${escapeHtml(value)}"><button class="spec-remove" type="button" aria-label="Удалить характеристику">×</button>`;
  row.querySelector(".spec-remove").addEventListener("click", () => row.remove());
  $("#spec-list").append(row);
}

function resetImagePreview() {
  $("#image-preview").hidden = true;
  $("#image-preview").removeAttribute("src");
  $("#image-placeholder").hidden = false;
  $("#remove-image-button").hidden = true;
  $("#product-image-input").value = "";
}

function setImagePreview(source) {
  $("#image-preview").src = source;
  $("#image-preview").hidden = false;
  $("#image-placeholder").hidden = true;
  $("#remove-image-button").hidden = false;
}

function openProductEditor(product = null) {
  if (!state.user) {
    requireLogin();
    return;
  }
  if (detailDialog.open) detailDialog.close();
  state.editingId = product?.id ?? null;
  state.imageData = "";
  $("#product-form").dataset.removeImage = "false";
  $("#product-dialog-title").textContent = product ? "Редактировать товар" : "Новый товар";
  $("#product-name").value = product?.name || "";
  $("#product-model").value = product?.model || "";
  $("#product-category").value = product?.category || "";
  $("#product-description").value = product?.description || "";
  $("#category-options").innerHTML = categoryCounts().map(([name]) => `<option value="${escapeHtml(name)}"></option>`).join("");
  $("#spec-list").replaceChildren();
  (product?.specs || []).forEach((spec) => addSpecRow(spec.name, spec.value));
  if (!product) addSpecRow();
  $("#product-error").textContent = "";
  resetImagePreview();
  if (product?.image) setImagePreview(product.image);
  productDialog.showModal();
}

async function removeProduct(product) {
  if (!confirm(`Удалить товар «${product.name}»?`)) return;
  try {
    await api(`/api/products/${product.id}`, { method: "DELETE" });
    if (detailDialog.open) detailDialog.close();
    showToast("Товар удалён.");
    await refreshProducts();
  } catch (error) {
    showToast(error.message, true);
  }
}

/* ---------- Обработчики ---------- */

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !link.target) {
    const url = new URL(link.href);
    if (url.origin === location.origin) {
      event.preventDefault();
      navigate(url.pathname + url.search);
      return;
    }
  }

  if (event.target.closest("[data-add-product]")) {
    openProductEditor();
    return;
  }

  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    closeButton.closest("dialog")?.close();
    return;
  }

  const productTrigger = event.target.closest("[data-product-action]");
  if (productTrigger) {
    const product = findProduct(productTrigger.closest("[data-product-id]")?.dataset.productId);
    if (!product) return;
    const action = productTrigger.dataset.productAction;
    if (action === "detail") openDetails(product);
    if (action === "edit") openProductEditor(product);
    if (action === "delete") removeProduct(product);
    return;
  }

  const userTrigger = event.target.closest("[data-user-action]");
  if (userTrigger) {
    const userId = Number(userTrigger.closest("[data-user-id]")?.dataset.userId);
    const user = state.admin.users.find((item) => item.id === userId);
    if (!user) return;
    if (userTrigger.dataset.userAction === "role") toggleUserRole(user);
    if (userTrigger.dataset.userAction === "delete") deleteUser(user);
  }
});

[productDialog, detailDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

window.addEventListener("popstate", route);

$("#menu-button").addEventListener("click", () => {
  const open = $("#site-header").classList.toggle("is-menu-open");
  $("#menu-button").setAttribute("aria-expanded", String(open));
});

$("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    state.user = null;
    state.admin.users = [];
    renderAccount();
    showToast("Вы вышли из аккаунта.");
    if (state.page === "admin") navigate("/", { replace: true });
    else renderPage();
  } catch (error) {
    showToast(error.message, true);
  }
});

$("#hero-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = $("#hero-search-input").value.trim();
  navigate(`/catalog${query ? `?q=${encodeURIComponent(query)}` : ""}`);
});

$("#category-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  syncCatalogUrl();
  renderCatalog();
});

$("#search-input").addEventListener("input", (event) => {
  state.search = event.target.value;
  syncCatalogUrl();
  renderCatalog();
});

$("#sort-select").addEventListener("change", renderCatalog);

$("#reset-filters").addEventListener("click", () => {
  state.category = "";
  state.search = "";
  $("#search-input").value = "";
  syncCatalogUrl();
  renderCatalog();
});

$$("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.admin.tab = button.dataset.tab;
    renderAdmin();
  });
});

$("#admin-user-search").addEventListener("input", (event) => {
  state.admin.userSearch = event.target.value;
  renderAdmin();
});

$("#admin-product-search").addEventListener("input", (event) => {
  state.admin.productSearch = event.target.value;
  renderAdmin();
});

function afterAuth(user, message) {
  state.user = user;
  renderAccount();
  showToast(message);
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  navigate(next || (user.is_admin ? "/admin" : "/catalog"), { replace: true });
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#login-error");
  const submit = $("#login-submit");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  error.textContent = "";
  if (!email || !password) {
    error.textContent = "Введите email и пароль.";
    return;
  }
  submit.disabled = true;
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    form.reset();
    afterAuth(result.user, "Вы вошли в аккаунт.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#register-error");
  const submit = $("#register-submit");
  const name = $("#register-name").value.trim();
  const email = $("#register-email").value.trim();
  const password = $("#register-password").value;
  error.textContent = "";
  if (name.length < 2) {
    error.textContent = "Имя должно содержать минимум 2 символа.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.textContent = "Введите корректный email.";
    return;
  }
  if (password.length < 8) {
    error.textContent = "Пароль должен содержать не менее 8 символов.";
    return;
  }
  if (password !== $("#register-password-repeat").value) {
    error.textContent = "Пароли не совпадают.";
    return;
  }
  submit.disabled = true;
  try {
    const result = await api("/api/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
    form.reset();
    afterAuth(result.user, "Аккаунт создан. Добро пожаловать!");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

$("#add-spec-button").addEventListener("click", () => addSpecRow());

$("#product-image-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    $("#product-error").textContent = "Выберите фото в формате JPG, PNG или WebP размером до 5 МБ.";
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.imageData = reader.result;
    setImagePreview(state.imageData);
    $("#product-error").textContent = "";
  };
  reader.readAsDataURL(file);
});

$("#remove-image-button").addEventListener("click", () => {
  state.imageData = "";
  $("#product-form").dataset.removeImage = "true";
  resetImagePreview();
});

$("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#product-name").value.trim();
  if (name.length < 2) {
    $("#product-error").textContent = "Название товара должно содержать от 2 до 120 символов.";
    return;
  }
  const payload = {
    name,
    model: $("#product-model").value.trim(),
    category: $("#product-category").value.trim(),
    description: $("#product-description").value.trim(),
    specs: $$("#spec-list .spec-row").map((row) => ({
      name: row.querySelector(".spec-name").value.trim(),
      value: row.querySelector(".spec-value").value.trim(),
    })).filter((spec) => spec.name && spec.value),
    image: state.imageData,
    remove_image: $("#product-form").dataset.removeImage === "true",
  };
  const editing = Boolean(state.editingId);
  $("#product-error").textContent = "";
  $("#product-save").disabled = true;
  try {
    await api(editing ? `/api/products/${state.editingId}` : "/api/products", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    productDialog.close();
    showToast(editing ? "Товар обновлён." : "Товар добавлен.");
    await refreshProducts();
  } catch (error) {
    $("#product-error").textContent = error.message;
  } finally {
    $("#product-save").disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  const target = state.page === "catalog" ? $("#search-input") : state.page === "home" ? $("#hero-search-input") : null;
  if (!target) return;
  event.preventDefault();
  target.focus();
});

/* ---------- Запуск ---------- */

async function init() {
  hydrateIcons();
  $("#year").textContent = new Date().getFullYear();
  try {
    const [session, catalog] = await Promise.all([api("/api/session"), api("/api/products")]);
    state.user = session.user;
    state.products = catalog.products;
  } catch {
    $("#catalog-status").textContent = "Не удалось подключиться к каталогу";
    showToast("Не удалось подключиться к серверу. Обновите страницу.", true);
  }
  renderAccount();
  route();
}

init();
