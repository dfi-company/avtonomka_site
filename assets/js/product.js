/* product.js - сторінка окремого товару (self-contained) */

/* ---- Lightbox (click-to-zoom product photo) ---- */
function openLightbox(src, alt) {
  let overlay = document.getElementById('photo-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'photo-lightbox';
    overlay.className = 'photo-lightbox';
    overlay.innerHTML = '<span class="photo-lightbox__close" aria-label="Закрити">&times;</span><div class="photo-lightbox__scroll"><img class="photo-lightbox__img"></div>';
    const scroll = overlay.querySelector('.photo-lightbox__scroll');
    const img = overlay.querySelector('.photo-lightbox__img');

    const closeBox = () => { overlay.classList.remove('is-open'); img.classList.remove('is-zoomed'); };
    overlay.addEventListener('click', closeBox);
    overlay.querySelector('.photo-lightbox__close').addEventListener('click', (e) => { e.stopPropagation(); closeBox(); });
    scroll.addEventListener('click', (e) => e.stopPropagation());

    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (img.classList.contains('is-zoomed')) {
        img.classList.remove('is-zoomed');
        scroll.scrollLeft = 0;
        scroll.scrollTop = 0;
      } else {
        const rect = img.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;
        img.classList.add('is-zoomed');
        requestAnimationFrame(() => {
          scroll.scrollLeft = relX * img.offsetWidth - scroll.clientWidth / 2;
          scroll.scrollTop = relY * img.offsetHeight - scroll.clientHeight / 2;
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBox();
    });
  }
  const img = overlay.querySelector('.photo-lightbox__img');
  img.classList.remove('is-zoomed');
  img.src = src;
  img.alt = alt || '';
  overlay.classList.add('is-open');
}

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
    .replace(/&mdash;/g, '-')
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

/* ---- Base path: root product.html vs. /product/<slug>/<id>.html (2 levels deep) ---- */
function getBase() {
  const path = window.location.pathname;
  const depth = path.split('/').length - 2;
  return depth >= 1 && path.includes('/product/') ? '../'.repeat(depth) : '';
}
const BASE = getBase();

/* ---- Product id: ?id= (legacy), /product/<id>.html (old stub) or
   /product/<slug>/<id>.html (static pages) — id is always the last segment ---- */
function getProductId() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('id')) return params.get('id');
  const m = window.location.pathname.match(/\/product\/(?:[^/]+\/)?([^/]+)\.html$/);
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
  document.title = displayTitle + ' - ' + brandSuffix;

  /* breadcrumb */
  const bcName = document.getElementById('bc-name');
  if (bcName) bcName.textContent = displayTitle;

  /* ---- Gallery ---- */
  const resolveImg = (src) => /^https?:\/\//.test(src) ? src : BASE + src;
  const images   = [p.image_link].filter(Boolean).map(resolveImg);
  const mainImg  = document.getElementById('gallery-main-img');
  const thumbsWrap = document.getElementById('gallery-thumbs');

  if (mainImg && images.length > 0) {
    mainImg.src = images[0];
    mainImg.alt = displayTitle;
    const galleryMain = mainImg.closest('.gallery-main');
    if (galleryMain) {
      galleryMain.addEventListener('click', () => openLightbox(images[0], displayTitle));
    }
  }

  if (thumbsWrap) {
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
  if (priceEl) priceEl.textContent = formatPrice(p.price || '') || '-';

  /* ---- Meta ---- */
  const mpnEl = document.getElementById('product-mpn');
  const catEl = document.getElementById('product-cat');
  if (mpnEl) mpnEl.textContent = p.mpn || '-';
  if (catEl) catEl.textContent = categoryLabel(p.product_type) || '-';

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
        /* No English translation - hide the whole description block */
        if (descBlock) descBlock.style.display = 'none';
      }
    } else {
      const clean = cleanDescription(p.description || '');
      descEl.textContent = clean || t('product.no_desc');
    }
  }

  /* ---- Specs table - hide in EN ---- */
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

  /* ---- Datasheet button(s) ---- */
  const datasheetWrap = document.getElementById('product-datasheet-wrap');
  const datasheetBtn  = document.getElementById('btn-datasheet');
  if (datasheetWrap && datasheetBtn) {
    if (p.link) {
      datasheetBtn.href = resolveImg(p.link);
      datasheetWrap.classList.remove('hidden');
    } else {
      datasheetWrap.remove();
    }
  }

  const datasheetWrap2 = document.getElementById('product-datasheet-wrap-2');
  const datasheetBtn2  = document.getElementById('btn-datasheet-2');
  if (datasheetWrap2 && datasheetBtn2) {
    if (p.link2) {
      datasheetBtn2.href = resolveImg(p.link2);
      datasheetWrap2.classList.remove('hidden');
    } else {
      datasheetWrap2.remove();
    }
  }

  /* ---- Show content: only one state may exist in the DOM at a time ---- */
  document.getElementById('loading-state')?.remove();
  document.getElementById('not-found-state')?.remove();
  document.getElementById('error-state')?.remove();
  document.getElementById('product-content')?.classList.remove('hidden');
}

/* ---- State helpers: each removes the other three states from the DOM ---- */
function showNotFound() {
  document.getElementById('loading-state')?.remove();
  document.getElementById('error-state')?.remove();
  document.getElementById('product-content')?.remove();
  document.getElementById('not-found-state')?.classList.remove('hidden');
}

function showError() {
  document.getElementById('loading-state')?.remove();
  document.getElementById('not-found-state')?.remove();
  document.getElementById('product-content')?.remove();
  document.getElementById('error-state')?.classList.remove('hidden');
}

/* ---- Start: wait for i18n ---- */
if (window.I18n) {
  init();
} else {
  document.addEventListener('i18n:ready', init);
}
