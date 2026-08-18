/**
 * Generates static, crawlable HTML for Google Merchant Center compliance.
 *
 * Problem: product.html is one shared template for all products (?id=X) and
 * catalog.html / catalog/*.html render their product grids entirely via
 * client-side JS from products.json. view-source on any of these pages shows
 * only "Завантаження…" — no price/title/availability without executing JS.
 *
 * This script (run at build time, same place as generate_merchant_feed.js):
 *   1. Generates one static file per product at product/<id>.html with the
 *      real title/price/availability/description already in the HTML, plus
 *      a schema.org Product/Offer JSON-LD block.
 *   2. Prerenders the first page (default sort, no filters — exactly what
 *      catalog.js shows on first load) of product cards into catalog.html
 *      and each catalog/<slug>.html, wrapped in <!-- SSR:START/END -->
 *      markers so re-runs are idempotent.
 *
 * product.html itself (the old ?id=X template) is left completely untouched
 * and keeps working exactly as before — nothing links to it going forward,
 * but old bookmarks/indexed URLs won't break.
 *
 * Run: node scripts/generate_static_pages.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT           = path.join(__dirname, '..');
const SITE_URL        = 'https://avtonomka.com.ua';
const BRAND           = 'Автономка';
const ITEMS_PER_PAGE  = 24;

const SLUG_TO_CATEGORY = {
  'hybridni-invertory':   'Автономна енергетика > Гибридні інвертори',
  'akumulyatory':         'Автономна енергетика > Акумулятори для гібридних інверторів',
  'komplekty':            'Автономна енергетика > Комплекти автономного енергоживлення',
  'kabeli':               'Автономна енергетика > Силові та сонячні кабелі',
  'dzherela-zhyvlennya':  'Обладнання > Джерела безперебійного живлення',
};
const CATEGORY_LABEL_UK = {
  'hybridni-invertory':   'Гібридні інвертори',
  'akumulyatory':         'Акумулятори для гібридних інверторів',
  'komplekty':            'Комплекти автономного енергоживлення',
  'kabeli':               'Силові та сонячні кабелі',
  'dzherela-zhyvlennya':  'Джерела безперебійного живлення',
};
const CATEGORY_TO_SLUG = {};
Object.keys(SLUG_TO_CATEGORY).forEach(slug => { CATEGORY_TO_SLUG[SLUG_TO_CATEGORY[slug]] = slug; });

/* ============================================================
   Shared helpers — mirror assets/js/catalog.js and product.js
   exactly, so prerendered HTML never disagrees with the JS render.
   ============================================================ */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
}

function formatPrice(raw) {
  if (!raw) return '';
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  const currency = raw.replace(/[\d.\s]+/, '').trim() || 'UAH';
  return num.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + currency;
}

function priceCurrency(raw) {
  if (!raw) return 'UAH';
  return raw.replace(/[\d.\s]+/, '').trim() || 'UAH';
}

/* Verbatim copy of product.js:cleanDescription() */
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

function categoryLabel(productType) {
  if (!productType) return '';
  const slug = CATEGORY_TO_SLUG[productType];
  if (slug && CATEGORY_LABEL_UK[slug]) return CATEGORY_LABEL_UK[slug];
  return productType.split('>').pop().trim();
}

function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${SITE_URL}/${url.replace(/^\//, '')}`;
}

function productUrl(id) {
  return `${SITE_URL}/product/${encodeURIComponent(id)}.html`;
}

function loadProducts() {
  let raw = fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.products || []);
}

/* ============================================================
   Per-product static page: product/<id>.html
   ============================================================ */

function buildJsonLd(p) {
  const images = [p.image_link, ...(p.additional_images || [])].filter(Boolean).map(absoluteUrl);
  const num = parseFloat(p.price);
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: p.title,
    image: images,
    description: cleanDescription(p.description) || p.title,
    sku: p.id,
    ...(p.mpn ? { mpn: p.mpn } : {}),
    brand: { '@type': 'Brand', name: BRAND },
    offers: {
      '@type': 'Offer',
      url: productUrl(p.id),
      priceCurrency: priceCurrency(p.price),
      price: isNaN(num) ? undefined : num.toFixed(2),
      availability: p.availability === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: p.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'UA',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 14,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
      },
    },
  };
  // Prevent "</script>" inside data from closing the tag early.
  return JSON.stringify(ld, null, 2).replace(/<\//g, '<\\/');
}

/* Rewrite root-relative href/src to ../ (page now lives one level deep, in /product/) */
function rewriteRelativePaths(html) {
  return html.replace(/(href|src)="([^"]*)"/g, (match, attr, url) => {
    if (!url || /^(https?:|mailto:|tel:|#|\.\.\/|\/)/.test(url)) return match;
    return `${attr}="../${url}"`;
  });
}

function generateProductPage(p, template) {
  const title       = p.title || '';
  const priceStr    = formatPrice(p.price || '');
  const inStock     = p.availability === 'in_stock';
  const badgeClass  = inStock ? 'badge-green' : 'badge-grey';
  const badgeText   = inStock ? '✓ В наявності' : 'Немає в наявності';
  const image       = absoluteUrl(p.image_link);
  const metaDesc    = truncate(cleanDescription(p.description) || title, 160);
  const descText    = escapeHtml(cleanDescription(p.description) || '');
  const catLabel    = categoryLabel(p.product_type);
  const mpn         = p.mpn || '—';
  const canonical   = productUrl(p.id);
  const jsonLd      = buildJsonLd(p);

  let html = template;

  html = html.replace(
    '<title>Товар — Автономка</title>',
    `<title>${escapeHtml(title)} — Автономка</title>`
  );
  html = html.replace(
    '<meta name="description" content="Детальна інформація про товар в магазині Автономка.">',
    `<meta name="description" content="${escapeHtml(metaDesc)}">`
  );
  html = html.replace(
    '<meta property="og:title" content="Автономка — товар">',
    `<meta property="og:title" content="${escapeHtml(title)} — Автономка">`
  );
  html = html.replace(
    '<meta property="og:image" content="assets/images/sticker.webp">',
    `<meta property="og:image" content="${escapeHtml(image)}">`
  );
  html = html.replace(
    '<link rel="canonical" href="https://avtonomka.com.ua/product.html">',
    `<link rel="canonical" href="${escapeHtml(canonical)}">`
  );
  html = html.replace(
    '</head>',
    `  <script type="application/ld+json">\n${jsonLd}\n  </script>\n</head>`
  );
  html = html.replace(
    '<span id="bc-name" data-i18n="product.breadcrumb_item">Товар</span>',
    `<span id="bc-name">${escapeHtml(title)}</span>`
  );
  html = html.replace(
    '<div id="loading-state" class="loading-state">',
    '<div id="loading-state" class="loading-state hidden">'
  );
  html = html.replace(
    '<div id="product-content" class="hidden">',
    '<div id="product-content">'
  );
  html = html.replace(
    '<img id="gallery-main-img" src="" alt="">',
    `<img id="gallery-main-img" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">`
  );
  html = html.replace(
    '<span id="product-availability" class="badge"></span>',
    `<span id="product-availability" class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>`
  );
  html = html.replace(
    '<h1 id="product-title" class="product-title"></h1>',
    `<h1 id="product-title" class="product-title">${escapeHtml(title)}</h1>`
  );
  html = html.replace(
    '<div id="product-price" class="product-price"></div>',
    `<div id="product-price" class="product-price">${escapeHtml(priceStr)}</div>`
  );
  html = html.replace(
    '<button type="button" id="btn-add-cart" class="btn btn-cart" data-add-to-cart data-id="" data-title="" data-price="" data-sku="">',
    `<button type="button" id="btn-add-cart" class="btn btn-cart" data-add-to-cart data-id="${escapeHtml(p.id)}" data-title="${escapeHtml(title)}" data-price="${isNaN(parseFloat(p.price)) ? '0' : parseFloat(p.price).toFixed(2)}" data-currency="${escapeHtml(priceCurrency(p.price))}" data-sku="${escapeHtml(p.mpn || '')}">`
  );
  html = html.replace(
    '<span class="product-meta-row__value" id="product-mpn">—</span>',
    `<span class="product-meta-row__value" id="product-mpn">${escapeHtml(mpn)}</span>`
  );
  html = html.replace(
    '<span class="product-meta-row__value" id="product-cat">—</span>',
    `<span class="product-meta-row__value" id="product-cat">${escapeHtml(catLabel || '—')}</span>`
  );
  html = html.replace(
    '<div id="product-desc" class="product-desc"></div>',
    `<div id="product-desc" class="product-desc">${descText}</div>`
  );

  return rewriteRelativePaths(html);
}

function generateAllProductPages(products) {
  const template = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
  const outDir   = path.join(ROOT, 'product');
  fs.mkdirSync(outDir, { recursive: true });

  const validIds = new Set(products.map(p => String(p.id)));

  products.forEach(p => {
    const html = generateProductPage(p, template);
    fs.writeFileSync(path.join(outDir, `${p.id}.html`), html, 'utf8');
  });

  /* Remove pages for products that dropped out of products.json entirely
     (discontinued) — otherwise they'd sit at their old URL forever with
     stale price/availability, which is exactly the risk this whole
     exercise is meant to avoid. */
  let removed = 0;
  fs.readdirSync(outDir).forEach(file => {
    if (!file.endsWith('.html')) return;
    const id = file.slice(0, -'.html'.length);
    if (!validIds.has(id)) {
      fs.unlinkSync(path.join(outDir, file));
      removed++;
    }
  });

  console.log(`generate_static_pages: wrote ${products.length} files to /product/` +
    (removed ? `, removed ${removed} stale file(s) for discontinued products` : ''));
}

/* ============================================================
   Catalog listing prerender — first page, default sort (name_asc),
   no filters. Exactly what catalog.js renders on first load, so
   the JS re-render on top is a no-op visually.
   ============================================================ */

function renderCard(p, base) {
  const inStock  = p.availability === 'in_stock';
  const badge    = inStock
    ? '<span class="badge badge-green">✓ В наявності</span>'
    : '<span class="badge badge-grey">Немає</span>';
  const priceStr = formatPrice(p.price || '');
  const title    = truncate(p.title || '', 80);
  const cat      = categoryLabel(p.product_type);
  const img      = p.image_link ? (/^https?:\/\//.test(p.image_link) ? p.image_link : base + p.image_link) : (base + 'assets/images/zaglushka.png');
  const zagl     = base + 'assets/images/zaglushka.png';
  const href     = `${base}product/${encodeURIComponent(p.id)}.html`;

  return `
  <div class="product-card">
    <a href="${href}" class="product-card__img-wrap" aria-label="${escapeHtml(title)}">
      <img src="${escapeHtml(img)}"
           alt="${escapeHtml(p.title || '')}"
           loading="lazy"
           onerror="this.src='${zagl}'">
      <div class="product-card__availability">${badge}</div>
    </a>
    <div class="product-card__body">
      ${cat ? `<div class="product-card__category">${escapeHtml(cat)}</div>` : ''}
      <a href="${href}" class="product-card__title">${escapeHtml(title)}</a>
      <div class="product-card__price-row">
        <span class="product-card__price">${escapeHtml(priceStr)}</span>
        ${p.mpn ? `<span class="product-card__sku">Арт. ${escapeHtml(p.mpn)}</span>` : ''}
      </div>
    </div>
    <div class="product-card__footer">
      <a href="${href}" class="btn btn-block">Детальніше →</a>
      <button type="button" class="btn btn-cart btn-block" data-add-to-cart
              data-id="${escapeHtml(p.id)}" data-title="${escapeHtml(p.title || '')}"
              data-price="${isNaN(parseFloat(p.price)) ? '0' : parseFloat(p.price).toFixed(2)}"
              data-currency="${escapeHtml(priceCurrency(p.price))}" data-sku="${escapeHtml(p.mpn || '')}">
        🛒 Додати в кошик
      </button>
      <a href="${base}return-policy.html#return" class="product-card__return-link">Умови повернення</a>
    </div>
  </div>`;
}

function defaultFirstPage(products) {
  const sorted = [...products].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return sorted.slice(0, ITEMS_PER_PAGE);
}

const SSR_START = '<!-- SSR:START -->';
const SSR_END   = '<!-- SSR:END -->';

function injectGrid(filePath, cardsHtml) {
  let html = fs.readFileSync(filePath, 'utf8');
  const block = `${SSR_START}\n${cardsHtml}\n            ${SSR_END}`;
  const markerRe = new RegExp(SSR_START + '[\\s\\S]*?' + SSR_END);

  if (markerRe.test(html)) {
    html = html.replace(markerRe, block);
  } else {
    html = html.replace(
      '<div id="products-grid" class="products-grid"></div>',
      `<div id="products-grid" class="products-grid">${block}</div>`
    );
  }

  fs.writeFileSync(filePath, html, 'utf8');
}

function generateCatalogGrids(products) {
  const rootPage = defaultFirstPage(products);
  injectGrid(
    path.join(ROOT, 'catalog.html'),
    rootPage.map(p => renderCard(p, '')).join('\n')
  );

  Object.keys(SLUG_TO_CATEGORY).forEach(slug => {
    const cat      = SLUG_TO_CATEGORY[slug];
    const filtered = products.filter(p => p.product_type === cat);
    const page     = defaultFirstPage(filtered);
    const file     = path.join(ROOT, 'catalog', `${slug}.html`);
    injectGrid(file, page.map(p => renderCard(p, '../')).join('\n'));
  });

  console.log('generate_static_pages: prerendered catalog.html + 5 catalog/*.html grids');
}

/* ============================================================
   sitemap.xml — regenerate the "Товари" section with the new
   /product/<id>.html URLs (previously stale/partial, old ?id= scheme).
   ============================================================ */

function updateSitemap(products) {
  const file = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');

  const entries = products.map(p => `  <url>
    <loc>${productUrl(p.id)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n');

  const block = `<!-- Товари -->\n${entries}\n\n</urlset>`;
  const sectionRe = /<!-- Товари -->[\s\S]*<\/urlset>/;

  if (sectionRe.test(xml)) {
    xml = xml.replace(sectionRe, block);
  } else {
    xml = xml.replace('</urlset>', `\n  <!-- Товари -->\n${entries}\n\n</urlset>`);
  }

  fs.writeFileSync(file, xml, 'utf8');
  console.log(`generate_static_pages: sitemap.xml now lists ${products.length} product URLs`);
}

/* ============================================================ */

const products = loadProducts();
generateAllProductPages(products);
generateCatalogGrids(products);
updateSitemap(products);
