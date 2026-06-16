/* catalog.js — завантаження та рендер товарів (self-contained) */

/* ---- Slug ↔ category mapping (для чистих URL) ---- */
const SLUG_TO_CATEGORY = {
  'hybridni-invertory':   'Автономна енергетика > Гибридні інвертори',
  'akumulyatory':         'Автономна енергетика > Акумулятори для гібридних інверторів',
  'komplekty':            'Автономна енергетика > Комплекти автономного енергоживлення',
  'kabeli':               'Автономна енергетика > Силові та сонячні кабелі',
  'dzherela-zhyvlennya':  'Обладнання > Джерела безперебійного живлення',
};

const ITEMS_PER_PAGE = 24;

let allProducts = [];
let filtered    = [];
let currentPage = 1;

/* ---- Local helpers ---- */
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(raw) {
  if (!raw) return '';
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  const currency = raw.replace(/[\d.\s]+/, '').trim() || 'UAH';
  return num.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + currency;
}

/* ---- t() shortcut — waits for I18n or falls back ---- */
function t(key, vars) {
  if (window.I18n) return window.I18n.t(key, vars);
  return key;
}

/* ---- Base paths (override via window.PRODUCTS_URL / PRODUCT_BASE_URL / ASSETS_BASE) ---- */
const _productsUrl   = (typeof PRODUCTS_URL    !== 'undefined' && PRODUCTS_URL)    || 'products.json';
const _productBase   = (typeof PRODUCT_BASE_URL !== 'undefined' && PRODUCT_BASE_URL) || 'product.html';
const _assetsBase    = (typeof ASSETS_BASE      !== 'undefined' && ASSETS_BASE)     || '';

/* ---- DOM refs ---- */
const grid        = document.getElementById('products-grid');
const counter     = document.getElementById('catalog-counter');
const pagination  = document.getElementById('pagination');
const searchInput = document.getElementById('filter-search');
const catSelect   = document.getElementById('filter-category');
const sortSelect  = document.getElementById('filter-sort');

/* ---- Init — wait for i18n then load ---- */
function init() {
  if (!grid) return;
  showLoading();

  fetch(_productsUrl)
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function(data) {
      allProducts = Array.isArray(data) ? data : (data.products || []);
      populateCategories();
      const rawCat = (typeof PRESET_CATEGORY !== 'undefined' && PRESET_CATEGORY)
        || new URLSearchParams(window.location.search).get('cat')
        || '';
      if (rawCat && catSelect) {
        catSelect.value = SLUG_TO_CATEGORY[rawCat] || rawCat;
      }
      applyFilters();
    })
    .catch(function(e) {
      showError();
      console.error('Помилка завантаження products.json:', e);
    });
}

/* ---- Populate category dropdown ---- */
function populateCategories() {
  if (!catSelect) return;
  const types = [...new Set(allProducts.map(p => p.product_type).filter(Boolean))].sort();
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.split('>').pop().trim();
    catSelect.appendChild(opt);
  });
}

/* ---- Filter + sort ---- */
function applyFilters() {
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const cat   = catSelect ? catSelect.value : '';
  const availEl = document.querySelector('input[name="availability"]:checked');
  const avail = availEl ? availEl.value : 'all';
  const sort  = sortSelect ? sortSelect.value : 'name_asc';

  filtered = allProducts.filter(p => {
    const title = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
    if (query && !title.toLowerCase().includes(query)) return false;
    if (cat && p.product_type !== cat) return false;
    if (avail === 'in_stock' && p.availability !== 'in_stock') return false;
    return true;
  });

  filtered.sort((a, b) => {
    const pa = parseFloat(a.price) || 0;
    const pb = parseFloat(b.price) || 0;
    if (sort === 'price_asc')  return pa - pb;
    if (sort === 'price_desc') return pb - pa;
    const ta = window.I18n ? window.I18n.productTitle(a) : (a.title || '');
    const tb = window.I18n ? window.I18n.productTitle(b) : (b.title || '');
    if (sort === 'name_asc')   return ta.localeCompare(tb);
    if (sort === 'name_desc')  return tb.localeCompare(ta);
    return 0;
  });

  currentPage = 1;
  render();
}

/* ---- Render current page ---- */
function render() {
  const total = filtered.length;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end   = Math.min(start + ITEMS_PER_PAGE, total);
  const page  = filtered.slice(start, end);

  if (counter) {
    counter.textContent = total === 0
      ? t('catalog.counter_none')
      : t('catalog.counter', { start: start + 1, end: end, total: total });
  }

  grid.innerHTML = '';

  if (page.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <img src="${_assetsBase}assets/images/sticker.webp" alt="" loading="lazy">
        <h3>${t('catalog.empty_title')}</h3>
        <p>${t('catalog.empty_text')}</p>
      </div>`;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  page.forEach(p => grid.insertAdjacentHTML('beforeend', renderCard(p)));
  renderPagination(total);
}

/* ---- Card HTML ---- */
function renderCard(p) {
  const inStock  = p.availability === 'in_stock';
  const badge    = inStock
    ? `<span class="badge badge-green">${t('catalog.in_stock')}</span>`
    : `<span class="badge badge-grey">${t('catalog.out_of_stock')}</span>`;
  const priceStr = formatPrice(p.price || '');
  const displayTitle = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
  const title    = truncate(displayTitle, 80);
  const cat      = (p.product_type || '').split('>').pop().trim();
  const img      = p.image_link || (_assetsBase + 'assets/images/zaglushka.png');
  const zagl     = _assetsBase + 'assets/images/zaglushka.png';
  const href     = `${_productBase}?id=${encodeURIComponent(p.id)}`;

  return `
  <div class="product-card">
    <a href="${href}" class="product-card__img-wrap" aria-label="${escapeHtml(title)}">
      <img src="${escapeHtml(img)}"
           alt="${escapeHtml(displayTitle)}"
           loading="lazy"
           onerror="this.src='${zagl}'">
      <div class="product-card__availability">${badge}</div>
    </a>
    <div class="product-card__body">
      ${cat ? `<div class="product-card__category">${escapeHtml(cat)}</div>` : ''}
      <a href="${href}" class="product-card__title">${escapeHtml(title)}</a>
      <div class="product-card__price-row">
        <span class="product-card__price">${escapeHtml(priceStr)}</span>
        ${p.mpn ? `<span class="product-card__sku">${t('catalog.article')} ${escapeHtml(p.mpn)}</span>` : ''}
      </div>
    </div>
    <div class="product-card__footer">
      <a href="${href}" class="btn btn-block">
        ${t('catalog.details')}
      </a>
    </div>
  </div>`;
}

/* ---- Pagination ---- */
function renderPagination(total) {
  if (!pagination) return;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  if (pages <= 1) { pagination.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&#8592;</button>`;

  buildPageRange(currentPage, pages).forEach(p => {
    if (p === '...') {
      html += `<span style="padding:0 6px;color:var(--color-muted)">…</span>`;
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  });

  html += `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''} data-page="${currentPage + 1}">&#8594;</button>`;
  pagination.innerHTML = html;

  pagination.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = +btn.dataset.page;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = [1];
  if (current > 3) range.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
  if (current < total - 2) range.push('...');
  range.push(total);
  return range;
}

/* ---- Loading / Error states ---- */
function showLoading() {
  grid.innerHTML = `
    <div class="loading-state" style="grid-column:1/-1">
      <div class="spinner"></div>
      <span>${t('catalog.loading_text')}</span>
    </div>`;
}

function showError() {
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <img src="${_assetsBase}assets/images/sticker.webp" alt="" loading="lazy">
      <h3>${t('catalog.error_title')}</h3>
      <p>${t('catalog.error_text')}</p>
    </div>`;
}

/* ---- Event listeners ---- */
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 250));
if (catSelect)   catSelect.addEventListener('change', applyFilters);
if (sortSelect)  sortSelect.addEventListener('change', applyFilters);

document.querySelectorAll('input[name="availability"]').forEach(r =>
  r.addEventListener('change', applyFilters)
);

document.getElementById('filter-reset')?.addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  if (catSelect)   catSelect.value   = '';
  if (sortSelect)  sortSelect.value  = 'name_asc';
  const allRadio = document.querySelector('input[name="availability"][value="all"]');
  if (allRadio) allRadio.checked = true;
  applyFilters();
});

/* ---- Start: wait for i18n, then init ---- */
if (window.I18n) {
  init();
} else {
  document.addEventListener('i18n:ready', init);
}
