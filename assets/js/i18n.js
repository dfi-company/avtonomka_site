/* i18n.js — lightweight translation module */

(function () {
  'use strict';

  /* ---- Detect base path (root vs /catalog/ subfolder) ---- */
  function getBase() {
    const depth = window.location.pathname.split('/').length - 2;
    return depth >= 1 && window.location.pathname.includes('/catalog/') ? '../' : '';
  }

  const BASE = getBase();

  /* ---- Language resolution (URL param → localStorage → default) ---- */
  function getLang() {
    const param = new URLSearchParams(window.location.search).get('lang');
    if (param === 'en' || param === 'uk') {
      localStorage.setItem('lang', param);
      return param;
    }
    return localStorage.getItem('lang') || 'uk';
  }

  const LANG = getLang();

  /* ---- Load translation JSON ---- */
  async function loadTranslations(lang) {
    const url = BASE + 'translations/' + lang + '.json';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Cannot load ' + url);
    return resp.json();
  }

  /* ---- Load product translations (only English needs it) ---- */
  async function loadProductTranslations() {
    if (LANG === 'uk') return {};
    try {
      const url = BASE + 'translations/products.en.json';
      const resp = await fetch(url);
      if (!resp.ok) return {};
      const arr = await resp.json();
      const map = {};
      arr.forEach(function (item) {
        if (item.id) map[String(item.id)] = item;
      });
      return map;
    } catch (e) {
      return {};
    }
  }

  /* ---- Deep get by dot-path: t('catalog.title') ---- */
  function get(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : null;
    }, obj);
  }

  /* ---- Apply translations to DOM via data-i18n attributes ---- */
  function applyDom(strings) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      const val = get(strings, key);
      if (val === null) return;
      /* data-i18n-html="true" → set innerHTML (safe: only our JSON) */
      if (el.getAttribute('data-i18n-html') === 'true') {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    });

    /* data-i18n-placeholder */
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = get(strings, key);
      if (val !== null) el.placeholder = val;
    });

    /* data-i18n-aria-label */
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-aria');
      const val = get(strings, key);
      if (val !== null) el.setAttribute('aria-label', val);
    });
  }

  /* ---- Update <html lang=""> and <title> ---- */
  function applyMeta(strings, page) {
    document.documentElement.lang = LANG === 'en' ? 'en' : 'uk';

    const titleKey = page + '.page_title';
    const val = get(strings, titleKey);
    if (val) document.title = val;
  }

  /* ---- Build language switcher ---- */
  function buildSwitcher() {
    const wrap = document.querySelector('.lang-switcher');
    if (!wrap) return;

    ['uk', 'en'].forEach(function (code) {
      const btn = document.createElement('button');
      btn.className = 'lang-btn' + (LANG === code ? ' active' : '');
      btn.textContent = code.toUpperCase();
      btn.setAttribute('aria-label', code === 'uk' ? 'Українська' : 'English');
      btn.addEventListener('click', function () {
        if (LANG === code) return;
        localStorage.setItem('lang', code);
        /* Preserve current URL, just switch lang param */
        const url = new URL(window.location.href);
        url.searchParams.set('lang', code);
        window.location.href = url.toString();
      });
      wrap.appendChild(btn);
    });
  }

  /* ---- Main init ---- */
  async function init() {
    let strings;
    try {
      strings = await loadTranslations(LANG);
    } catch (e) {
      console.warn('i18n: falling back to uk', e);
      strings = await loadTranslations('uk');
    }

    applyDom(strings);
    buildSwitcher();
    if (LANG === 'en') document.body.classList.add('lang-en');

    /* Expose globals */
    const productTranslations = LANG === 'en' ? await loadProductTranslations() : {};

    window.I18n = {
      lang: LANG,
      t: function (key, vars) {
        let val = get(strings, key);
        if (val === null) return key;
        if (vars) {
          Object.keys(vars).forEach(function (k) {
            val = val.replace('{' + k + '}', vars[k]);
          });
        }
        return val;
      },
      productTitle: function (product) {
        if (LANG === 'en') {
          const pt = productTranslations[String(product.id)];
          if (pt && pt.title_en) return pt.title_en;
        }
        return product.title || '';
      },
      productDesc: function (product) {
        if (LANG === 'en') {
          const pt = productTranslations[String(product.id)];
          if (pt && pt.description_en) return pt.description_en;
        }
        return product.description || '';
      },
      dateLocale: LANG === 'en' ? 'en-GB' : 'uk-UA',
      strings: strings
    };

    /* Dispatch event so other scripts know i18n is ready */
    document.dispatchEvent(new Event('i18n:ready'));
  }

  /* Run as early as possible — before DOMContentLoaded is fine since
     we use querySelectorAll after await (DOM is parsed by then) */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
