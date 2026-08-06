/* product.js — сторінка окремого товару (self-contained) */

/* ---- Local helpers ---- */
function cleanDescription(html) {
  if (!html) return '';
  return html
    .replace(/lt;\/[a-z][a-z0-9]*/gi, '')
    .replace(/lt;[a-z][^>]*>/gi, '')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Strip HTML tables (for EN description) */
function stripTables(html) {
  if (!html) return html;
  return html.replace(/<table[\s\S]*?<\/table>/gi, '');
}

function formatPrice(raw) {
  if (!raw) return '';
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  const currency = raw.replace(/[\d.\s]+/, '').trim() || 'UAH';
  return num.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + currency;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function t(key) {
  return window.I18n ? window.I18n.t(key) : key;
}

const _SLUG_TO_CATEGORY = {
  'hybridni-invertory':   'Автономна енергетика > Гибридні інвертори',
  'akumulyatory':         'Автономна енергетика > Акумулятори для гібридних інверторів',
  'komplekty':            'Автономна енергетика > Комплекти автономного енергоживлення',
  'kabeli':               'Автономна енергетика > Силові та сонячні кабелі',
  'dzherela-zhyvlennya':  'Обладнання > Джерела безперебійного живлення',
};
const _CATEGORY_TO_SLUG = {};
Object.keys(_SLUG_TO_CATEGORY).forEach(function(slug) {
  _CATEGORY_TO_SLUG[_SLUG_TO_CATEGORY[slug]] = slug;
});

function categoryLabel(productType) {
  if (!productType) return '';
  var slug = _CATEGORY_TO_SLUG[productType];
  if (slug && window.I18n) {
    var label = window.I18n.t('categories.' + slug);
    if (label && label !== 'categories.' + slug) return label;
  }
  return productType.split('>').pop().trim();
}

/* ---- Base path: root product.html vs. /product/<id>.html ---- */
function getBase() {
  return window.location.pathname.includes('/product/') ? '../' : '';
}
const BASE = getBase();

/* ---- Product id: ?id= (legacy) or /product/<id>.html (static pages) ---- */
function getProductId() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('id')) return params.get('id');
  const m = window.location.pathname.match(/\/product\/([^/]+)\.html$/);
  return m ? m[1] : null;
}

/* ---- Legacy ?id= link → canonical /product/<id>.html (avoids duplicate content) ---- */
function redirectLegacyIfNeeded() {
  const legacyId = new URLSearchParams(window.location.search).get('id');
  if (!legacyId || window.location.pathname.includes('/product/')) return false;

  const target = BASE + 'product/' + encodeURIComponent(legacyId) + '.html';
  const absoluteTarget = window.location.origin + '/product/' + encodeURIComponent(legacyId) + '.html';

  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = absoluteTarget;

  window.location.replace(target);
  return true;
}

/* ---- Init ---- */
function init() {
  if (redirectLegacyIfNeeded()) return;

  const id = getProductId();
  if (!id) { showNotFound(); return; }

  fetch(BASE + 'products.json')
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function(data) {
      const products = Array.isArray(data) ? data : (data.products || []);
      const product  = products.find(p => String(p.id) === String(id));
      if (!product) { showNotFound(); return; }
      render(product);
    })
    .catch(function(e) {
      showError();
      console.error('product.js:', e);
    });
}

/* ---- Render product ---- */
function render(p) {
  const displayTitle = window.I18n ? window.I18n.productTitle(p) : (p.title || '');
  var brandSuffix = (window.I18n && window.I18n.lang === 'en') ? 'Avtonomka' : 'Автономка';
  document.title = displayTitle + ' — ' + brandSuffix;

  /* breadcrumb */
  const bcName = document.getElementById('bc-name');
  if (bcName) bcName.textContent = displayTitle;

  /* ---- Gallery ---- */
  const resolveImg = (src) => /^https?:\/\//.test(src) ? src : BASE + src;
  const images   = [p.image_link, ...(p.additional_images || [])].filter(Boolean).map(resolveImg);
  const mainImg  = document.getElementById('gallery-main-img');
  const thumbsWrap = document.getElementById('gallery-thumbs');

  if (mainImg && images.length > 0) {
    mainImg.src = images[0];
    mainImg.alt = displayTitle;
  }

  if (thumbsWrap && images.length > 1) {
    const photoAlt = t('product.photo_alt');
    thumbsWrap.innerHTML = images.map((src, i) => `
      <div class="gallery-thumb ${i === 0 ? 'active' : ''}" data-src="${escHtml(src)}">
        <img src="${escHtml(src)}" alt="${photoAlt} ${i + 1}" loading="lazy"
             onerror="this.src='${BASE}assets/images/zaglushka.png'">
      </div>`).join('');

    thumbsWrap.querySelectorAll('.gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        if (!mainImg) return;
        mainImg.style.opacity = '0';
        setTimeout(() => {
          mainImg.src = thumb.dataset.src;
          mainImg.style.opacity = '1';
        }, 180);
        thumbsWrap.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  } else if (thumbsWrap) {
    thumbsWrap.style.display = 'none';
  }

  /* ---- Title ---- */
  const titleEl = document.getElementById('product-title');
  if (titleEl) titleEl.textContent = displayTitle;

  /* ---- Availability ---- */
  const availEl = document.getElementById('product-availability');
  if (availEl) {
    const inStock = p.availability === 'in_stock';
    availEl.textContent = inStock ? t('product.in_stock') : t('product.out_of_stock');
    availEl.className   = 'badge ' + (inStock ? 'badge-green' : 'badge-grey');
  }

  /* ---- Price ---- */
  const priceEl = document.getElementById('product-price');
  if (priceEl) priceEl.textContent = formatPrice(p.price || '') || '—';

  /* ---- Meta ---- */
  const mpnEl = document.getElementById('product-mpn');
  const catEl = document.getElementById('product-cat');
  if (mpnEl) mpnEl.textContent = p.mpn || '—';
  if (catEl) catEl.textContent = categoryLabel(p.product_type) || '—';

  /* ---- Description ---- */
  const descEl    = document.getElementById('product-desc');
  const descBlock = document.querySelector('.product-info__desc');
  const lang      = window.I18n ? window.I18n.lang : 'uk';

  if (descEl) {
    if (lang === 'en') {
      const enDesc = window.I18n ? window.I18n.productDesc(p) : '';
      const hasEnDesc = enDesc && enDesc !== (p.description || '');
      if (hasEnDesc) {
        descEl.textContent = enDesc;
      } else {
        /* No English translation — hide the whole description block */
        if (descBlock) descBlock.style.display = 'none';
      }
    } else {
      const clean = cleanDescription(p.description || '');
      descEl.textContent = clean || t('product.no_desc');
    }
  }

  /* ---- Specs table — hide in EN ---- */
  const specsEl = document.getElementById('product-specs');
  if (specsEl) {
    if (p.specs && lang === 'uk') {
      specsEl.innerHTML = p.specs;
    } else {
      specsEl.remove();
    }
  }

  /* ---- Embed video ---- */
  const embedEl = document.getElementById('product-embed');
  if (embedEl) {
    if (p.embed) {
      embedEl.innerHTML = `<iframe src="${p.embed}" width="100%" height="400" allow="autoplay" allowfullscreen style="border:none;border-radius:8px;display:block;margin-top:16px"></iframe>`;
    } else {
      embedEl.remove();
    }
  }

  /* ---- Add to cart button ---- */
  const cartBtn = document.getElementById('btn-add-cart');
  if (cartBtn) {
    const priceNum = parseFloat(p.price);
    cartBtn.setAttribute('data-id', p.id);
    cartBtn.setAttribute('data-title', displayTitle);
    cartBtn.setAttribute('data-price', isNaN(priceNum) ? '0' : priceNum.toFixed(2));
    cartBtn.setAttribute('data-currency', String(p.price || '').replace(/[\d.\s]+/, '').trim() || 'UAH');
    cartBtn.setAttribute('data-sku', p.mpn || '');
  }

  /* ---- Datasheet button ---- */
  const datasheetWrap = document.getElementById('product-datasheet-wrap');
  const datasheetBtn  = document.getElementById('btn-datasheet');
  if (datasheetWrap && datasheetBtn) {
    if (p.link) {
      datasheetBtn.href = p.link;
      datasheetWrap.classList.remove('hidden');
    } else {
      datasheetWrap.remove();
    }
  }

  /* ---- Show content ---- */
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('product-content')?.classList.remove('hidden');
}

/* ---- State helpers ---- */
function showNotFound() {
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('not-found-state')?.classList.remove('hidden');
}

function showError() {
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('error-state')?.classList.remove('hidden');
}

/* ---- Start: wait for i18n ---- */
if (window.I18n) {
  init();
} else {
  document.addEventListener('i18n:ready', init);
}
