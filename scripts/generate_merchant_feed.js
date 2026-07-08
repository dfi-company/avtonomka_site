/**
 * Generates Google Merchant Center XML feed (feed.xml) from products.json
 * Run: node scripts/generate_merchant_feed.js
 */

const fs   = require('fs');
const path = require('path');

const SITE_URL    = 'https://avtonomka.com.ua';
const BRAND       = 'Автономка';
const SHOP_NAME   = 'Автономка';
const SHOP_DESC   = 'Магазин обладнання для автономного живлення';

const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../products.json'), 'utf-8'));

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

function productLink(id) {
  return `${SITE_URL}/product/${encodeURIComponent(id)}.html`;
}

function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${SITE_URL}/${url.replace(/^\//, '')}`;
}

const items = products.map(p => {
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
      <g:description>${escXml(p.description || p.title)}</g:description>
      <g:link>${escXml(productLink(p.id))}</g:link>
      <g:image_link>${escXml(absoluteUrl(p.image_link))}</g:image_link>
${additionalImages ? additionalImages + '\n' : ''}      <g:price>${price}</g:price>
      <g:availability>${availability(p.availability)}</g:availability>
      <g:condition>${escXml(p.condition || 'new')}</g:condition>
      <g:brand>${escXml(BRAND)}</g:brand>
      <g:product_type>${escXml(p.product_type)}</g:product_type>
${p.mpn ? `      <g:mpn>${escXml(p.mpn)}</g:mpn>\n` : ''}    </item>`;
}).filter(Boolean).join('');

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
console.log(`feed.xml generated: ${products.length} products → ${outPath}`);
