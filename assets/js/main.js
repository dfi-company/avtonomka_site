/* main.js - загальна логіка */

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

/* ---- Nav dropdown ("Інформація") - hover on desktop (CSS), click/tap here ---- */
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
  return 'https://telegram.me/avtonomka_od?text=' + text;
}

/* ---- Expose helpers globally ---- */
window.AvtonomkaUtils = { formatPrice, stripHtml, truncate, tgOrderLink };

/* ---- Lightbox (click-to-zoom photo), shared by product.js and category cards ---- */
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

/* ---- Category card magnifier buttons (homepage) ---- */
document.querySelectorAll('.cat-card__zoom').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLightbox(btn.dataset.zoomSrc, btn.dataset.zoomAlt || '');
  });
});
