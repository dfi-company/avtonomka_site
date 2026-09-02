/**
 * Generates Google Merchant Center XML feed (feed.xml) from products.json
 * Run: node scripts/generate_merchant_feed.js
 */

const fs   = require('fs');
const path = require('path');
const { slugify } = require('./slugify');

const SITE_URL    = 'https://avtonomka.com.ua';
const BRAND       = 'Автономка';
const SHOP_NAME   = 'Автономка';
const SHOP_DESC   = 'Магазин обладнання для автономного живлення';

const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../products.json'), 'utf-8'));

/* Віртуальні товари (public.virtual_products, розділ 9.4 ARCHITECTURE.md) -
   тепер теж ідуть у Merchant Center фід, за явною вимогою власника
   (ціни реальні, з прайсу постачальника - товар можна реально
   підвезти під замовлення). anon-ключ + RLS = сюди підтягуються лише
   active=true. ⚠ Значення мають збігатися з assets/js/catalog.js /
   product.js / scripts/generate_static_pages.js. */
const SUPABASE_URL = 'https://uvndubhmqzqqsrnrxgaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bmR1YmhtcXpxcXNybnJ4Z2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDY4MDIsImV4cCI6MjEwMzkyMjgwMn0.AavrYyhDXBQkjKOMdQ9wAQX6B901dOfUpmtUDwO5Cv8';

async function loadVirtualProducts() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/virtual_products?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    return (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id,
      title: r.title,
      image_link: r.image,
      additional_images: [],
      price: r.price != null ? `${r.price} UAH` : '',
      availability: 'in_stock',
      product_type: r.product_type,
      mpn: r.source_model,
      condition: 'new',
      description: r.description,
      slug: r.slug,
    }));
  } catch (e) {
    console.warn('generate_merchant_feed: could not load virtual_products from Supabase:', e.message);
    return [];
  }
}

function escXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatPrice(raw) {
  const num = parseFloat(raw);
  if (isNaN(num)) return '';
  return num.toFixed(2) + ' UAH';
}

function availability(val) {
  return val === 'in_stock' ? 'in stock' : 'out of stock';
}

function productLink(p) {
  const slug = p.slug || slugify(p.title || '');
  return `${SITE_URL}/product/${slug}/${encodeURIComponent(p.id)}.html`;
}

function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${SITE_URL}/${url.replace(/^\//, '')}`;
}

/* Bilingual SEO keyword phrases (see scripts/generate_seo_keywords.py),
   appended to the feed-only description. Deliberately NOT part of
   p.description itself, which product.js / generate_static_pages.js /
   catalog.js also read for the on-site description — this keeps that
   text keyword-free while still letting the feed carry the extra terms,
   per the user's explicit call after being shown Google's Merchant Center
   policy against keyword stuffing (accepted the risk knowingly). */
function feedDescription(p) {
  const base = p.description || p.title;
  const kw = [p.merchant_keywords_uk, p.merchant_keywords_ru].filter(Boolean).join(' ');
  return kw ? `${base} ${kw}` : base;
}

function buildItem(p) {
  const price = formatPrice(p.price);
  if (!price) return '';

  const additionalImages = (p.additional_images || [])
    .slice(0, 10)
    .map(img => `      <g:additional_image_link>${escXml(absoluteUrl(img))}</g:additional_image_link>`)
    .join('\n');

  return `
    <item>
      <g:id>${escXml(p.id)}</g:id>
      <g:title>${escXml(p.title)}</g:title>
      <g:description>${escXml(feedDescription(p))}</g:description>
      <g:link>${escXml(productLink(p))}</g:link>
      <g:image_link>${escXml(absoluteUrl(p.image_link))}</g:image_link>
${additionalImages ? additionalImages + '\n' : ''}      <g:price>${price}</g:price>
      <g:availability>${availability(p.availability)}</g:availability>
      <g:condition>${escXml(p.condition || 'new')}</g:condition>
      <g:brand>${escXml(BRAND)}</g:brand>
      <g:product_type>${escXml(p.product_type)}</g:product_type>
${p.mpn ? `      <g:mpn>${escXml(p.mpn)}</g:mpn>\n` : ''}    </item>`;
}

(async () => {
  const virtualProducts = await loadVirtualProducts();
  const allProducts = [...products, ...virtualProducts];
  const items = allProducts.map(buildItem).filter(Boolean).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escXml(SHOP_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${escXml(SHOP_DESC)}</description>
${items}
  </channel>
</rss>
`;

  const outPath = path.join(__dirname, '../feed.xml');
  fs.writeFileSync(outPath, xml, 'utf-8');
  console.log(`feed.xml generated: ${products.length} products + ${virtualProducts.length} virtual → ${outPath}`);
})();
