/* articles.js — public articles page */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const locale = window.I18n ? window.I18n.dateLocale : 'uk-UA';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function t(key) {
  return window.I18n ? window.I18n.t(key) : key;
}

function renderCard(article) {
  const dateStr = formatDate(article.date);
  const imgHtml = article.photo
    ? `<div class="article-card__img"><img src="${escHtml(article.photo)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '<div class="article-card__img article-card__img--placeholder"></div>';
  return `
  <article class="article-card" data-id="${escHtml(article.id)}" tabindex="0" role="button" aria-label="${escHtml(article.title)}">
    ${imgHtml}
    <div class="article-card__body">
      ${dateStr ? `<div class="article-card__date">${escHtml(dateStr)}</div>` : ''}
      <h2 class="article-card__title">${escHtml(article.title || '')}</h2>
      ${article.summary ? `<p class="article-card__summary">${escHtml(article.summary)}</p>` : ''}
    </div>
    <div class="article-card__footer">
      <span class="article-card__link">${t('articles.read_more')}</span>
    </div>
  </article>`;
}

function renderFull(article) {
  const dateStr = formatDate(article.date);
  const imgHtml = article.photo
    ? `<div class="article-full__img"><img src="${escHtml(article.photo)}" alt="${escHtml(article.title || '')}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';
  const bodyHtml = (article.body || '')
    .split(/\n\n+/)
    .map(para => para.trim())
    .filter(Boolean)
    .map(para => `<p>${escHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `
  <div class="article-full">
    <button class="article-full__back" id="btn-back">${t('articles.back')}</button>
    ${imgHtml}
    <div class="article-full__content">
      ${dateStr ? `<div class="article-full__date">${escHtml(dateStr)}</div>` : ''}
      <h1 class="article-full__title">${escHtml(article.title || '')}</h1>
      ${article.summary ? `<p class="article-full__lead">${escHtml(article.summary)}</p>` : ''}
      <div class="article-full__body">${bodyHtml}</div>
    </div>
  </div>`;
}

let allArticles = [];

function openArticle(id) {
  const article = allArticles.find(a => a.id === id);
  if (!article) return;

  const detailEl = document.getElementById('article-detail');
  const listEl   = document.getElementById('articles-list');

  detailEl.innerHTML = renderFull(article);
  document.getElementById('btn-back').addEventListener('click', closeArticle);

  listEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  history.pushState({ articleId: id }, '', '#' + id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeArticle() {
  const detailEl = document.getElementById('article-detail');
  const listEl   = document.getElementById('articles-list');

  detailEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  history.pushState('', document.title, window.location.pathname);
  window.scrollTo({ top: 0 });
}

window.addEventListener('popstate', () => {
  const hash = window.location.hash.slice(1);
  if (hash && allArticles.find(a => a.id === hash)) {
    openArticle(hash);
  } else {
    const detailEl = document.getElementById('article-detail');
    const listEl   = document.getElementById('articles-list');
    if (detailEl && listEl) {
      detailEl.classList.add('hidden');
      listEl.classList.remove('hidden');
    }
  }
});

async function init() {
  const grid = document.getElementById('articles-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${t('articles.loading')}</span></div>`;

  try {
    const resp = await fetch('data/articles.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    allArticles = await resp.json();

    if (!Array.isArray(allArticles) || allArticles.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <img src="assets/images/sticker.webp" alt="" loading="lazy">
          <h3>${t('articles.empty_title')}</h3>
          <p>${t('articles.empty_text')}</p>
        </div>`;
      return;
    }

    grid.innerHTML = allArticles.map(renderCard).join('');

    grid.addEventListener('click', e => {
      const card = e.target.closest('.article-card');
      if (card) openArticle(card.dataset.id);
    });
    grid.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.article-card');
        if (card) openArticle(card.dataset.id);
      }
    });

    const hash = window.location.hash.slice(1);
    if (hash && allArticles.find(a => a.id === hash)) openArticle(hash);

  } catch (e) {
    grid.innerHTML = `
      <div class="empty-state">
        <img src="assets/images/sticker.webp" alt="" loading="lazy">
        <h3>${t('articles.error_title')}</h3>
        <p>${t('articles.error_text')}</p>
      </div>`;
    console.error(e);
  }
}

/* ---- Start: wait for i18n ---- */
if (window.I18n) {
  init();
} else {
  document.addEventListener('i18n:ready', init);
}
