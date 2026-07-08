/* main.js — загальна логіка */

/* ---- Active nav link ---- */
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(link => {
    const href = link.getAttribute('href').split('/').pop();
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
      const dropdown = link.closest('.dropdown-menu');
      if (dropdown) {
        const toggle = dropdown.previousElementSibling;
        if (toggle && toggle.classList.contains('dropdown-toggle')) toggle.classList.add('active');
      }
    }
  });
})();

/* ---- Mobile burger ---- */
(function () {
  const burger = document.querySelector('.burger');
  const nav    = document.querySelector('.main-nav');
  if (!burger || !nav) return;

  burger.addEventListener('click', () => {
    const open = burger.classList.toggle('open');
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    if (!open) closeAllDropdowns();
  });

  document.addEventListener('click', e => {
    if (!burger.contains(e.target) && !nav.contains(e.target)) {
      burger.classList.remove('open');
      nav.classList.remove('open');
      closeAllDropdowns();
    }
  });
})();

/* ---- Nav dropdown ("Інформація") — hover on desktop (CSS), click/tap here ---- */
function closeAllDropdowns(except) {
  document.querySelectorAll('.main-nav .has-dropdown.open').forEach(el => {
    if (el === except) return;
    el.classList.remove('open');
    const toggle = el.querySelector(':scope > .dropdown-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

(function () {
  document.querySelectorAll('.main-nav .has-dropdown > .dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      const parent = toggle.closest('.has-dropdown');
      const willOpen = !parent.classList.contains('open');
      closeAllDropdowns(willOpen ? parent : null);
      parent.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.has-dropdown')) closeAllDropdowns();
  });
})();

/* ---- Format price "11505 UAH" → "11 505 UAH" ---- */
function formatPrice(raw) {
  if (!raw) return '';
  const m = raw.match(/([\d.]+)\s*(.*)/);
  if (!m) return raw;
  const num = parseFloat(m[1]);
  const currency = m[2] || '';
  return num.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + currency;
}

/* ---- Strip HTML tags ---- */
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/* ---- Truncate string ---- */
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
}

/* ---- Build Telegram order link ---- */
function tgOrderLink(title) {
  const text = encodeURIComponent('Хочу замовити: ' + title);
  return 'https://t.me/avtonomka_od?text=' + text;
}

/* ---- Expose helpers globally ---- */
window.AvtonomkaUtils = { formatPrice, stripHtml, truncate, tgOrderLink };
