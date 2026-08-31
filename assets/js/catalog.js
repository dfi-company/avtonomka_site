/* catalog.js - завантаження та рендер товарів (self-contained) */

/* ---- Slug ↔ category mapping (для чистих URL) ---- */
const SLUG_TO_CATEGORY = {
  'hybridni-invertory':   'Автономна енергетика > Гибридні інвертори',
  'akumulyatory':         'Автономна енергетика > Акумулятори для гібридних інверторів',
  'komplekty':            'Автономна енергетика > Комплекти автономного енергоживлення',
  'kabeli':               'Автономна енергетика > Силові та сонячні кабелі',
  'dzherela-zhyvlennya':  'Обладнання > Джерела безперебійного живлення',
};

const CATEGORY_TO_SLUG = {};
Object.keys(SLUG_TO_CATEGORY).forEach(function(slug) {
  CATEGORY_TO_SLUG[SLUG_TO_CATEGORY[slug]] = slug;
});

/* ---- Facet filters (power / brand / monobrand) — which categories get which,
   per product owner's request. "brand" on komplekty matches either half of
   the kit (inverter or battery); "monobrand" is an extra checkbox meaning
   both halves are the same brand. ---- */
const FACET_CONFIG = {
  'hybridni-invertory': { power: true, brand: true },
  'komplekty':          { power: true, brand: true, monobrand: true },
  'akumulyatory':       { brand: true },
};
const KNOWN_BRANDS = ['DAH Solar', 'Deye', 'Dyness', 'Felicity', 'Must'];

function extractBrand(title) {
  if (!title) return null;
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp('\\b' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(title)) return b;
  }
  return null;
}

/* Power rating in kW, parsed from the title - mirrors miniapp/index.html's
   extractKw() so the two stay consistent. (?!h) keeps "16kWh" (battery
   capacity) from being misread as power. */
function extractKw(title) {
  if (!title) return null;
  let m = title.match(/(\d+(?:[.,]\d+)?)\s*(?:кВт|kw)(?!h)/i);
  if (m) return m[1].replace(',', '.');
  m = title.match(/(\d+)\s*Вт\b/);
  if (m) return String(Number(m[1]) / 1000);
  m = title.match(/SUN-(\d+)K-/i);
  if (m) return m[1];
  m = title.match(/PV\d+-(\d{2})\d{2}/i); // MUST "PVxx-XXYY": XX/10 = кВт
  if (m) return String(Number(m[1]) / 10);
  return null;
}

/* "Комплект автономного енергоживлення: <inverter> + <battery>" -> the brand
   of each half. */
function kitBrands(title) {
  const body = (title || '').replace(/^Комплект автономного енергоживлення:\s*/i, '');
  const parts = body.split(/\s*\+\s*/);
  if (parts.length !== 2) return [];
  return [extractBrand(parts[0]), extractBrand(parts[1])].filter(Boolean);
}

function isMonobrand(title) {
  const brands = kitBrands(title);
  return brands.length === 2 && brands[0] === brands[1];
}

/* Brand(s) a product should match against for the brand facet -
   both halves for a kit, just the one brand for everything else. */
function productBrands(p, slug) {
  const title = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
  if (slug === 'komplekty') return kitBrands(title);
  const b = extractBrand(title);
  return b ? [b] : [];
}

function categoryLabel(productType) {
  if (!productType) return '';
  var slug = CATEGORY_TO_SLUG[productType];
  if (slug && window.I18n) {
    var label = window.I18n.t('categories.' + slug);
    if (label && label !== 'categories.' + slug) return label;
  }
  return productType.split('>').pop().trim();
}

const ITEMS_PER_PAGE = 24;

let allProducts      = [];
let filtered         = [];
let currentPage      = 1;
let selectedCategory = '';
let selectedPowers   = new Set();
let selectedBrands   = new Set();
let monobrandOnly    = false;

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

/* ---- t() shortcut - waits for I18n or falls back ---- */
function t(key, vars) {
  if (window.I18n) return window.I18n.t(key, vars);
  return key;
}

/* ---- Base paths (override via window.PRODUCTS_URL / PRODUCT_BASE_URL / ASSETS_BASE) ---- */
const _productsUrl   = (typeof PRODUCTS_URL    !== 'undefined' && PRODUCTS_URL)    || 'products.json';
const _productBase   = (typeof PRODUCT_BASE_URL !== 'undefined' && PRODUCT_BASE_URL) || 'product/';
const _assetsBase    = (typeof ASSETS_BASE      !== 'undefined' && ASSETS_BASE)     || '';

/* ---- DOM refs ---- */
const grid        = document.getElementById('products-grid');
const counter     = document.getElementById('catalog-counter');
const pagination  = document.getElementById('pagination');
const searchInput = document.getElementById('filter-search');
const catMenu     = document.getElementById('filter-category-menu');
const facetsPanel = document.getElementById('filter-facets');
const sortSelect  = document.getElementById('filter-sort');

/* ---- Init - wait for i18n then load ---- */
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
      const rawCat = (typeof PRESET_CATEGORY !== 'undefined' && PRESET_CATEGORY)
        || new URLSearchParams(window.location.search).get('cat')
        || '';
      selectedCategory = rawCat ? (SLUG_TO_CATEGORY[rawCat] || rawCat) : '';
      populateCategories();
      renderFacets();
      applyFilters();
    })
    .catch(function(e) {
      showError();
      console.error('Помилка завантаження products.json:', e);
    });
}

/* Switch category: reset any facet selections (they're category-specific),
   rebuild the facet panel for the new category, then re-filter. */
function selectCategory(type) {
  selectedCategory = type;
  selectedPowers   = new Set();
  selectedBrands   = new Set();
  monobrandOnly    = false;
  setActiveMenuState();
  renderFacets();
  applyFilters();
}

/* ---- Populate always-open category menu ---- */
function populateCategories() {
  if (!catMenu) return;
  const types = [...new Set(allProducts.map(p => p.product_type).filter(Boolean))].sort();

  const allBtn = catMenu.querySelector('.category-menu__item[data-cat=""]');
  if (allBtn && !allBtn.querySelector('.category-menu__count')) {
    const countSpan = document.createElement('span');
    countSpan.className = 'category-menu__count';
    countSpan.textContent = allProducts.length;
    allBtn.appendChild(countSpan);
  }

  types.forEach(function(type) {
    const count = allProducts.filter(p => p.product_type === type).length;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-menu__item';
    btn.dataset.cat = type;
    btn.innerHTML = `<span>${escapeHtml(categoryLabel(type))}</span><span class="category-menu__count">${count}</span>`;
    btn.addEventListener('click', () => selectCategory(type));
    li.appendChild(btn);

    catMenu.appendChild(li);
  });

  setActiveMenuState();
}

/* ---- Sync .is-active class in the category menu with current selection ---- */
function setActiveMenuState() {
  if (!catMenu) return;
  catMenu.querySelectorAll('.category-menu__item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.cat === selectedCategory);
  });
}

/* ---- Facet panel (power / brand / monobrand checkboxes) for the active category ---- */
function renderFacets() {
  if (!facetsPanel) return;
  const slug   = CATEGORY_TO_SLUG[selectedCategory];
  const facets = slug && FACET_CONFIG[slug];

  if (!facets) {
    facetsPanel.innerHTML = '';
    facetsPanel.hidden = true;
    return;
  }

  const inCategory = allProducts.filter(p => p.product_type === selectedCategory);
  let html = '';

  if (facets.power) {
    const counts = {};
    inCategory.forEach(p => {
      const title = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
      const kw = extractKw(title);
      if (kw !== null) counts[kw] = (counts[kw] || 0) + 1;
    });
    const values = Object.keys(counts).sort((a, b) => parseFloat(a) - parseFloat(b));
    if (values.length) {
      html += `<div class="facet-group"><div class="facet-group__title">${escapeHtml(t('catalog.facet_power'))}</div>`;
      values.forEach(v => {
        html += `<label class="facet-checkbox"><input type="checkbox" data-facet="power" value="${escapeHtml(v)}" ${selectedPowers.has(v) ? 'checked' : ''}><span>${escapeHtml(v)} ${escapeHtml(t('catalog.facet_power_unit'))}</span><span class="facet-checkbox__count">${counts[v]}</span></label>`;
      });
      html += `</div>`;
    }
  }

  if (facets.brand) {
    const counts = {};
    inCategory.forEach(p => {
      productBrands(p, slug).forEach(b => { counts[b] = (counts[b] || 0) + 1; });
    });
    const values = Object.keys(counts).sort();
    if (values.length) {
      html += `<div class="facet-group"><div class="facet-group__title">${escapeHtml(t('catalog.facet_brand'))}</div>`;
      values.forEach(v => {
        html += `<label class="facet-checkbox"><input type="checkbox" data-facet="brand" value="${escapeHtml(v)}" ${selectedBrands.has(v) ? 'checked' : ''}><span>${escapeHtml(v)}</span><span class="facet-checkbox__count">${counts[v]}</span></label>`;
      });
      if (facets.monobrand) {
        const monoCount = inCategory.filter(p => {
          const title = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
          return isMonobrand(title);
        }).length;
        html += `<label class="facet-checkbox facet-checkbox--mono"><input type="checkbox" data-facet="monobrand" ${monobrandOnly ? 'checked' : ''}><span>${escapeHtml(t('catalog.facet_monobrand'))}</span><span class="facet-checkbox__count">${monoCount}</span></label>`;
      }
      html += `</div>`;
    }
  }

  facetsPanel.innerHTML = html;
  facetsPanel.hidden = !html;

  facetsPanel.querySelectorAll('input[data-facet="power"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedPowers.add(cb.value); else selectedPowers.delete(cb.value);
      applyFilters();
    });
  });
  facetsPanel.querySelectorAll('input[data-facet="brand"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedBrands.add(cb.value); else selectedBrands.delete(cb.value);
      applyFilters();
    });
  });
  facetsPanel.querySelectorAll('input[data-facet="monobrand"]').forEach(cb => {
    cb.addEventListener('change', () => {
      monobrandOnly = cb.checked;
      applyFilters();
    });
  });
}

/* ---- Filter + sort ---- */
function applyFilters() {
  const query  = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const cat    = selectedCategory;
  const slug   = CATEGORY_TO_SLUG[cat];
  const facets = slug && FACET_CONFIG[slug];
  const availEl = document.querySelector('input[name="availability"]:checked');
  const avail = availEl ? availEl.value : 'all';
  const sort  = sortSelect ? sortSelect.value : 'name_asc';

  filtered = allProducts.filter(p => {
    const title = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
    if (query && !title.toLowerCase().includes(query)) return false;
    if (cat && p.product_type !== cat) return false;
    if (facets) {
      if (facets.power && selectedPowers.size) {
        const kw = extractKw(title);
        if (kw === null || !selectedPowers.has(kw)) return false;
      }
      if (facets.brand && selectedBrands.size) {
        const brands = productBrands(p, slug);
        if (!brands.some(b => selectedBrands.has(b))) return false;
      }
      if (facets.monobrand && monobrandOnly && !isMonobrand(title)) return false;
    }
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
  const img      = p.image_link ? (/^https?:\/\//.test(p.image_link) ? p.image_link : _assetsBase + p.image_link) : (_assetsBase + 'assets/images/zaglushka.png');
  const zagl     = _assetsBase + 'assets/images/zaglushka.png';
  const href     = `${_productBase}${encodeURIComponent(p.slug || p.id)}/${encodeURIComponent(p.id)}.html`;

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
      <button type="button" class="btn btn-cart btn-block" data-add-to-cart
              data-id="${escapeHtml(p.id)}" data-title="${escapeHtml(displayTitle)}"
              data-price="${isNaN(parseFloat(p.price)) ? '0' : parseFloat(p.price).toFixed(2)}"
              data-currency="${escapeHtml(String(p.price || '').replace(/[\d.\s]+/, '').trim() || 'UAH')}"
              data-sku="${escapeHtml(p.mpn || '')}">
        🛒 ${t('catalog.add_to_cart')}
      </button>
      <a href="${_assetsBase}return-policy.html#return" class="product-card__return-link">${t('catalog.return_policy')}</a>
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
if (sortSelect)  sortSelect.addEventListener('change', applyFilters);

document.querySelector('.category-menu__item[data-cat=""]')?.addEventListener('click', () => selectCategory(''));

document.querySelectorAll('input[name="availability"]').forEach(r =>
  r.addEventListener('change', applyFilters)
);

document.getElementById('filter-reset')?.addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  if (sortSelect)  sortSelect.value  = 'name_asc';
  const allRadio = document.querySelector('input[name="availability"][value="all"]');
  if (allRadio) allRadio.checked = true;
  selectCategory('');
});

/* ---- Start: wait for i18n, then init ---- */
if (window.I18n) {
  init();
} else {
  document.addEventListener('i18n:ready', init);
}
