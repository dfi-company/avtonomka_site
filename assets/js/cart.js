/**
 * cart.js — кошик покупця (localStorage) + floating-кнопка, дровер і оформлення
 * замовлення. Підключений глобально (через main.js include на всіх сторінках).
 *
 * Кнопки додавання в кошик — звичайні <button data-add-to-cart data-id=".."
 * data-title=".." data-price=".." data-sku=".."> у статичній розмітці карток
 * товару й сторінки товару (не домальовуються JS), щоб кнопка була видна
 * будь-якому боту одразу в HTML.
 *
 * Оформлення надсилає весь кошик у той самий Google Apps Script, що приймає
 * заявки з assets/js/order-form.js (scripts/order_form_apps_script.gs).
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'avtonomka_cart';

  /* Має збігатися з ORDER_FORM_ENDPOINT в assets/js/order-form.js —
     це той самий Apps Script Web App. */
  const ORDER_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyesUPSxsGaf3gacpV8GQ5vlH8t7R3zHlD3eWSnsi6Kjrk8tUbunrxrMmxhfRTd4oueEA/exec';

  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    renderDrawerItems();
  }

  function addItem(item) {
    if (!item || !item.id) return;
    const items = readCart();
    const existing = items.find(i => i.id === item.id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({
        id: item.id,
        title: item.title || '',
        price: parseFloat(item.price) || 0,
        currency: item.currency || 'UAH',
        sku: item.sku || '',
        qty: 1
      });
    }
    writeCart(items);
    flashFab();
  }

  function removeItem(id) {
    writeCart(readCart().filter(i => i.id !== id));
  }

  function setQty(id, qty) {
    qty = Math.max(1, Math.floor(qty) || 1);
    const items = readCart();
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.qty = qty;
    writeCart(items);
  }

  function clearCart() {
    writeCart([]);
  }

  function getCount() {
    return readCart().reduce((sum, i) => sum + i.qty, 0);
  }

  function getTotal() {
    return readCart().reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function formatPrice(num, currency) {
    return Math.round(num).toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + (currency || 'UAH');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================================
     UI: floating button + drawer + checkout modal
     ============================================================ */

  const UI_HTML = `
    <button type="button" id="cart-fab" class="cart-fab hidden" aria-label="Кошик">
      🛒<span id="cart-fab-count" class="cart-fab__count hidden">0</span>
    </button>

    <div id="cart-drawer-overlay" class="cart-drawer-overlay hidden">
      <div class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
        <button type="button" class="cart-drawer-close" aria-label="Закрити">&times;</button>
        <h3 id="cart-drawer-title">Кошик</h3>

        <div id="cart-drawer-items" class="cart-drawer-items"></div>
        <p id="cart-drawer-empty" class="cart-drawer-empty hidden">Кошик порожній</p>

        <div id="cart-drawer-footer" class="cart-drawer-footer hidden">
          <div class="cart-drawer-total">Разом: <strong id="cart-drawer-total">0 UAH</strong></div>
          <button type="button" class="btn btn-primary btn-block" id="cart-drawer-checkout">Оформити замовлення</button>
        </div>

        <form id="cart-checkout-form" class="hidden">
          <div class="form-group">
            <label for="cart-checkout-name">Ім'я *</label>
            <input type="text" id="cart-checkout-name" name="name" required autocomplete="name">
          </div>
          <div class="form-group">
            <label for="cart-checkout-phone">Телефон *</label>
            <input type="tel" id="cart-checkout-phone" name="phone" required autocomplete="tel" placeholder="+380 XX XXX XX XX">
          </div>
          <div class="form-group">
            <label for="cart-checkout-comment">Коментар</label>
            <textarea id="cart-checkout-comment" name="comment" rows="2" placeholder="Побажання щодо доставки тощо (необов'язково)"></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="cart-checkout-submit">Надіслати замовлення</button>
          <button type="button" class="btn btn-outline btn-block" id="cart-checkout-back">← Назад до кошика</button>
        </form>

        <div id="cart-checkout-success" class="order-form-state hidden">
          ✓ Дякуємо! Замовлення надіслано, ми зв'яжемось з вами найближчим часом.
        </div>
        <div id="cart-checkout-error" class="order-form-state order-form-state--error hidden">
          Не вдалося надіслати замовлення. Спробуйте пізніше або напишіть нам у
          <a href="https://telegram.me/avtonomka_od" target="_blank" rel="noopener">Telegram</a>.
        </div>
      </div>
    </div>`;

  let fab, fabCount, overlay, itemsWrap, emptyBlock, footerBlock, totalEl,
      checkoutForm, checkoutSubmit, successBlock, errorBlock;

  function buildUi() {
    document.body.insertAdjacentHTML('beforeend', UI_HTML);

    fab           = document.getElementById('cart-fab');
    fabCount      = document.getElementById('cart-fab-count');
    overlay       = document.getElementById('cart-drawer-overlay');
    itemsWrap     = document.getElementById('cart-drawer-items');
    emptyBlock    = document.getElementById('cart-drawer-empty');
    footerBlock   = document.getElementById('cart-drawer-footer');
    totalEl       = document.getElementById('cart-drawer-total');
    checkoutForm  = document.getElementById('cart-checkout-form');
    checkoutSubmit = document.getElementById('cart-checkout-submit');
    successBlock  = document.getElementById('cart-checkout-success');
    errorBlock    = document.getElementById('cart-checkout-error');

    fab.addEventListener('click', openDrawer);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDrawer();
    });
    overlay.querySelector('.cart-drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeDrawer();
    });

    document.getElementById('cart-drawer-checkout').addEventListener('click', showCheckoutForm);
    document.getElementById('cart-checkout-back').addEventListener('click', showCart);
    checkoutForm.addEventListener('submit', onCheckoutSubmit);

    itemsWrap.addEventListener('click', function (e) {
      const removeBtn = e.target.closest('[data-cart-remove]');
      if (removeBtn) {
        removeItem(removeBtn.getAttribute('data-cart-remove'));
        return;
      }
      const stepBtn = e.target.closest('[data-cart-step]');
      if (stepBtn) {
        const id = stepBtn.getAttribute('data-cart-id');
        const item = readCart().find(i => i.id === id);
        if (!item) return;
        const delta = parseInt(stepBtn.getAttribute('data-cart-step'), 10);
        setQty(id, item.qty + delta);
      }
    });

    itemsWrap.addEventListener('change', function (e) {
      const input = e.target.closest('[data-cart-qty-input]');
      if (!input) return;
      setQty(input.getAttribute('data-cart-qty-input'), parseInt(input.value, 10));
    });
  }

  function renderDrawerItems() {
    if (!itemsWrap) return;
    const items = readCart();

    if (items.length === 0) {
      itemsWrap.innerHTML = '';
      emptyBlock.classList.remove('hidden');
      footerBlock.classList.add('hidden');
      return;
    }

    emptyBlock.classList.add('hidden');
    footerBlock.classList.remove('hidden');

    itemsWrap.innerHTML = items.map(item => `
      <div class="cart-item">
        <div class="cart-item__info">
          <div class="cart-item__title">${escapeHtml(item.title)}</div>
          ${item.sku ? `<div class="cart-item__sku">Арт. ${escapeHtml(item.sku)}</div>` : ''}
          <div class="cart-item__price">${formatPrice(item.price, item.currency)}</div>
        </div>
        <div class="cart-item__controls">
          <div class="cart-item__qty">
            <button type="button" data-cart-step="-1" data-cart-id="${escapeHtml(item.id)}" aria-label="Зменшити">−</button>
            <input type="number" min="1" value="${item.qty}" data-cart-qty-input="${escapeHtml(item.id)}" aria-label="Кількість">
            <button type="button" data-cart-step="1" data-cart-id="${escapeHtml(item.id)}" aria-label="Збільшити">+</button>
          </div>
          <button type="button" class="cart-item__remove" data-cart-remove="${escapeHtml(item.id)}" aria-label="Видалити">Видалити</button>
        </div>
      </div>`).join('');

    totalEl.textContent = formatPrice(getTotal(), items[0].currency);
  }

  function updateBadge() {
    if (!fab) return;
    const count = getCount();
    fab.classList.toggle('hidden', count === 0);
    fabCount.textContent = String(count);
    fabCount.classList.toggle('hidden', count === 0);
  }

  function flashFab() {
    if (!fab) return;
    fab.classList.add('cart-fab--flash');
    setTimeout(function () { fab.classList.remove('cart-fab--flash'); }, 350);
  }

  function showCart() {
    checkoutForm.classList.add('hidden');
    itemsWrap.classList.remove('hidden');
    footerBlock.classList.toggle('hidden', readCart().length === 0);
    if (readCart().length === 0) emptyBlock.classList.remove('hidden');
    successBlock.classList.add('hidden');
    errorBlock.classList.add('hidden');
  }

  function showCheckoutForm() {
    if (readCart().length === 0) return;
    itemsWrap.classList.add('hidden');
    footerBlock.classList.add('hidden');
    emptyBlock.classList.add('hidden');
    checkoutForm.classList.remove('hidden');
    checkoutForm.reset();
    checkoutSubmit.disabled = false;
    checkoutSubmit.textContent = 'Надіслати замовлення';
    document.getElementById('cart-checkout-name')?.focus();
  }

  function openDrawer() {
    if (!overlay) buildUi();
    renderDrawerItems();
    showCart();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function onCheckoutSubmit(e) {
    e.preventDefault();

    const items = readCart();
    if (items.length === 0) return;

    if (!ORDER_FORM_ENDPOINT) {
      console.warn('cart.js: ORDER_FORM_ENDPOINT не задано.');
      showCheckoutError();
      return;
    }

    checkoutSubmit.disabled = true;
    checkoutSubmit.textContent = 'Надсилання…';

    const data = new URLSearchParams({
      name:    checkoutForm.name.value.trim(),
      phone:   checkoutForm.phone.value.trim(),
      comment: checkoutForm.comment.value.trim(),
      items:   JSON.stringify(items.map(i => ({
        title: i.title, sku: i.sku, qty: i.qty, price: i.price, currency: i.currency
      })))
    });

    fetch(ORDER_FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data })
      .then(function () {
        checkoutForm.classList.add('hidden');
        successBlock.classList.remove('hidden');
        clearCart();
      })
      .catch(function (err) {
        console.error('cart.js: помилка надсилання', err);
        showCheckoutError();
      });
  }

  function showCheckoutError() {
    checkoutSubmit.disabled = false;
    checkoutSubmit.textContent = 'Надіслати замовлення';
    errorBlock.classList.remove('hidden');
  }

  function wireAddButtons() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-add-to-cart]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      if (!id) return;
      addItem({
        id: id,
        title: btn.getAttribute('data-title') || '',
        price: btn.getAttribute('data-price') || '0',
        currency: btn.getAttribute('data-currency') || 'UAH',
        sku: btn.getAttribute('data-sku') || ''
      });
      openDrawer();
    });
  }

  window.Cart = {
    add: addItem,
    remove: removeItem,
    setQty: setQty,
    clear: clearCart,
    getAll: readCart,
    getCount: getCount,
    getTotal: getTotal,
    open: openDrawer,
    close: closeDrawer
  };

  function init() {
    buildUi();
    updateBadge();
    wireAddButtons();
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        updateBadge();
        renderDrawerItems();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
