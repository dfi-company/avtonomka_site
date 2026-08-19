/**
 * One-time (re-runnable) migration: pull product images off the external
 * dfi2.com.ua host and serve them from this site instead.
 *
 * Why: products.json's image_link/additional_images currently point at
 * https://dfi2.com.ua/images/<file> for most products. That's a dependency
 * on someone else's server staying up and someone else's hotlink policy —
 * and it's what generate_static_pages.js embeds into og:image and the
 * Product JSON-LD "image" array. This script downloads each dfi2.com.ua
 * image to assets/images/products/<file> (same filename dfi2 used, which
 * already encodes "<product id>_<n>.jpg" — no separate id lookup needed)
 * and rewrites products.json to point at the local copy.
 *
 * Idempotent: a URL whose local file already exists is skipped (not
 * re-downloaded), and a URL that's already local (not dfi2.com.ua) is left
 * untouched. Safe to re-run after adding new products.
 *
 * A failed download (dfi2.com.ua down, 404, timeout) does NOT stop the
 * migration and does NOT touch that product's URL in products.json — it's
 * left pointing at dfi2.com.ua so the site keeps showing an image, and the
 * URL is reported in the failure list at the end for manual follow-up.
 *
 * Run: node scripts/migrate_product_images.js
 * Then: node scripts/generate_static_pages.js   (to bake the new local
 * paths into product/<id>.html, og:image, JSON-LD, and the catalog grids —
 * no changes needed in that script, it already resolves relative image
 * paths against SITE_URL exactly like it does for the images that were
 * migrated to assets/images/komp/ previously).
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const ROOT       = path.join(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'assets', 'images', 'products');
const SOURCE_HOST = 'dfi2.com.ua';

function loadProducts() {
  let raw = fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function isSourceUrl(url) {
  return typeof url === 'string' && url.includes(SOURCE_HOST);
}

function localPathFor(url) {
  const file = url.split('/').pop().split('?')[0];
  return `assets/images/products/${file}`;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const cleanup = (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    };
    const req = https.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return cleanup(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', cleanup);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function migrateImages(urls) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const urlMap = {};   // old dfi2 URL -> new local relative path
  const failed = [];   // { url, error }

  for (const url of urls) {
    const localRel  = localPathFor(url);
    const localFull = path.join(ROOT, localRel);

    if (fs.existsSync(localFull)) {
      urlMap[url] = localRel;
      continue;
    }
    try {
      await download(url, localFull);
      urlMap[url] = localRel;
    } catch (e) {
      failed.push({ url, error: e.message });
    }
  }
  return { urlMap, failed };
}

function rewriteProducts(products, urlMap) {
  let changed = 0;
  products.forEach(p => {
    if (isSourceUrl(p.image_link) && urlMap[p.image_link]) {
      p.image_link = urlMap[p.image_link];
      changed++;
    }
    if (Array.isArray(p.additional_images)) {
      p.additional_images = p.additional_images.map(u => {
        if (isSourceUrl(u) && urlMap[u]) { changed++; return urlMap[u]; }
        return u;
      });
    }
  });
  return changed;
}

async function main() {
  const products = loadProducts();

  const uniqueSourceUrls = new Set();
  products.forEach(p => {
    if (isSourceUrl(p.image_link)) uniqueSourceUrls.add(p.image_link);
    (p.additional_images || []).forEach(u => { if (isSourceUrl(u)) uniqueSourceUrls.add(u); });
  });

  console.log(`migrate_product_images: ${uniqueSourceUrls.size} unique ${SOURCE_HOST} image(s) to migrate`);

  const { urlMap, failed } = await migrateImages([...uniqueSourceUrls]);
  const changed = rewriteProducts(products, urlMap);

  fs.writeFileSync(
    path.join(ROOT, 'products.json'),
    JSON.stringify(products, null, 2) + '\n',
    'utf8'
  );

  console.log(`migrate_product_images: downloaded ${Object.keys(urlMap).length}/${uniqueSourceUrls.size} image(s), ` +
    `updated ${changed} field(s) in products.json`);

  if (failed.length) {
    console.log(`\nFailed downloads (left pointing at ${SOURCE_HOST}, review manually):`);
    failed.forEach(f => console.log(`  ${f.url}  —  ${f.error}`));
  }
}

main().catch(e => {
  console.error('migrate_product_images: fatal error:', e);
  process.exit(1);
});
