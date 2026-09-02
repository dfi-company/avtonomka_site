/* comments.js - коментарі клієнтів під товаром (Supabase).
 *
 * Будує весь блок коментарів (заголовок, список, форма) і вставляє його
 * одразу після .product-layout - як на product.html, так і на
 * пре-рендерених product/<slug>/<id>.html сторінках (обидва підключають
 * цей файл, жодних додаткових правок HTML не потрібно).
 *
 * ⚠ НАЛАШТУВАННЯ (виконати вручну, один раз):
 * 1. Створи проєкт на supabase.com (безкоштовний план вистачає).
 * 2. У SQL Editor виконай scripts/supabase/comments_schema.sql.
 * 3. Settings → API → скопіюй "Project URL" та "anon public" ключ,
 *    встав їх нижче замість SUPABASE_URL / SUPABASE_ANON_KEY.
 *    ⚠ Ті самі значення встав і в admin.html (SUPABASE_URL/SUPABASE_ANON_KEY
 *    у розділі "Comments moderation").
 * anon-ключ безпечно тримати у клієнтському коді - доступ до даних
 * обмежує не секретність ключа, а RLS-політики в comments_schema.sql
 * (анонім може вставити лише неопублікований коментар і читати лише
 * вже схвалені; бачити/схвалювати все може тільки автентифікований
 * адмін - див. admin.html).
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

  function t(key) {
    return window.I18n ? window.I18n.t(key) : key;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getProductId() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) return params.get('id');
    const m = window.location.pathname.match(/\/product\/(?:[^/]+\/)?([^/]+)\.html$/);
    return m ? m[1] : null;
  }

  function formatDate(dateStr) {
    const locale = window.I18n ? window.I18n.dateLocale : 'uk-UA';
    return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderComment(c) {
    return `
    <article class="product-comment">
      <div class="product-comment__head">
        <span class="product-comment__author">${escHtml(c.author_name)}</span>
        <span class="product-comment__date">${escHtml(formatDate(c.created_at))}</span>
      </div>
      <p class="product-comment__text">${escHtml(c.text)}</p>
    </article>`;
  }

  function sectionHtml() {
    return `
    <section class="product-comments" id="product-comments">
      <h2 class="product-comments__title">${escHtml(t('comments.title'))}</h2>
      <div id="comments-list" class="product-comments__list"></div>

      <form id="comment-form" class="comment-form">
        <div class="form-group">
          <label for="comment-name">${escHtml(t('comments.name_label'))}</label>
          <input type="text" id="comment-name" class="form-input" required maxlength="80" autocomplete="name">
        </div>
        <div class="form-group">
          <label for="comment-text">${escHtml(t('comments.text_label'))}</label>
          <textarea id="comment-text" class="form-input" rows="3" required maxlength="2000"></textarea>
        </div>
        <div class="comment-form__hp" aria-hidden="true">
          <label for="comment-website">Website</label>
          <input type="text" id="comment-website" name="website" tabindex="-1" autocomplete="off">
        </div>
        <button type="submit" class="btn btn-primary" id="comment-submit">${escHtml(t('comments.submit'))}</button>
        <p id="comment-msg" class="comment-form__msg" role="status"></p>
      </form>
    </section>`;
  }

  let client = null;
  function getClient() {
    if (client) return client;
    if (!window.supabase || SUPABASE_URL.includes('YOUR-PROJECT')) return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  async function loadComments(productId, listEl) {
    const sb = getClient();
    if (!sb) { listEl.innerHTML = ''; return; }

    const { data, error } = await sb
      .from('comments')
      .select('author_name, text, created_at')
      .eq('product_id', productId)
      .eq('approved', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('comments.js: не вдалося завантажити коментарі', error);
      listEl.innerHTML = '';
      return;
    }

    if (!data.length) {
      listEl.innerHTML = `<p class="product-comments__empty">${escHtml(t('comments.empty'))}</p>`;
      return;
    }

    listEl.innerHTML = data.map(renderComment).join('');
  }

  function wireForm(productId, form, listEl) {
    const nameEl = document.getElementById('comment-name');
    const textEl = document.getElementById('comment-text');
    const hpEl = document.getElementById('comment-website');
    const submitBtn = document.getElementById('comment-submit');
    const msgEl = document.getElementById('comment-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.textContent = '';
      msgEl.className = 'comment-form__msg';

      if (hpEl.value.trim()) return; // бот заповнив приховане поле - мовчки ігноруємо

      const author_name = nameEl.value.trim();
      const text = textEl.value.trim();
      if (!author_name || !text) return;

      const sb = getClient();
      if (!sb) {
        msgEl.textContent = t('comments.error');
        msgEl.className = 'comment-form__msg comment-form__msg--error';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t('comments.sending');

      const { error } = await sb.from('comments').insert({
        product_id: productId,
        author_name,
        text,
        approved: false,
      });

      submitBtn.disabled = false;
      submitBtn.textContent = t('comments.submit');

      if (error) {
        console.warn('comments.js: не вдалося надіслати коментар', error);
        msgEl.textContent = t('comments.error');
        msgEl.className = 'comment-form__msg comment-form__msg--error';
        return;
      }

      form.reset();
      msgEl.textContent = t('comments.sent');
      msgEl.className = 'comment-form__msg comment-form__msg--success';
    });
  }

  function init() {
    const content = document.getElementById('product-content');
    const layout = content ? content.querySelector('.product-layout') : null;
    if (!content || !layout) return;

    const productId = getProductId();
    if (!productId) return;

    if (!document.getElementById('product-comments')) {
      layout.insertAdjacentHTML('afterend', sectionHtml());
    }

    const listEl = document.getElementById('comments-list');
    const form = document.getElementById('comment-form');
    loadComments(productId, listEl);
    wireForm(productId, form, listEl);
  }

  if (window.I18n) {
    init();
  } else {
    document.addEventListener('i18n:ready', init);
  }
})();
