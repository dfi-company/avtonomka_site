/**
 * checkout.js — сторінка оформлення замовлення (checkout.html).
 *
 * Показує вміст кошика (assets/js/cart.js, той самий localStorage), збирає
 * контакти й дані доставки Новою Поштою та надсилає все одним запитом у
 * Google Apps Script (scripts/order_form_apps_script.gs) — той самий
 * бекенд, що приймає заявки з order-form.js.
 */

(function () {
  'use strict';

  /* Має збігатися з ORDER_FORM_ENDPOINT в assets/js/order-form.js та cart.js —
     це той самий Apps Script Web App. */
  const ORDER_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyesUPSxsGaf3gacpV8GQ5vlH8t7R3zHlD3eWSnsi6Kjrk8tUbunrxrMmxhfRTd4oueEA/exec';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(num, currency) {
    return Math.round(num).toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ' + (currency || 'UAH');
  }

  let layout, emptyBlock, itemsWrap, totalEl, form, submitBtn, successBlock, errorBlock;

  function renderItems() {
    const items = window.Cart.getAll();

    if (items.length === 0) {
      layout.classList.add('hidden');
      emptyBlock.classList.remove('hidden');
      return;
    }

    layout.classList.remove('hidden');
    emptyBlock.classList.add('hidden');

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

    totalEl.textContent = formatPrice(window.Cart.getTotal(), items[0].currency);
  }

  function wireItemsWrap() {
    itemsWrap.addEventListener('click', function (e) {
      const removeBtn = e.target.closest('[data-cart-remove]');
      if (removeBtn) {
        window.Cart.remove(removeBtn.getAttribute('data-cart-remove'));
        renderItems();
        return;
      }
      const stepBtn = e.target.closest('[data-cart-step]');
      if (stepBtn) {
        const id = stepBtn.getAttribute('data-cart-id');
        const item = window.Cart.getAll().find(i => i.id === id);
        if (!item) return;
        const delta = parseInt(stepBtn.getAttribute('data-cart-step'), 10);
        window.Cart.setQty(id, item.qty + delta);
        renderItems();
      }
    });

    itemsWrap.addEventListener('change', function (e) {
      const input = e.target.closest('[data-cart-qty-input]');
      if (!input) return;
      window.Cart.setQty(input.getAttribute('data-cart-qty-input'), parseInt(input.value, 10));
      renderItems();
    });
  }

  function showError() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Підтвердити замовлення';
    errorBlock.classList.remove('hidden');
  }

  function onSubmit(e) {
    e.preventDefault();

    const items = window.Cart.getAll();
    if (items.length === 0) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Надсилання…';
    errorBlock.classList.add('hidden');

    const data = new URLSearchParams({
      name:     form.name.value.trim(),
      phone:    form.phone.value.trim(),
      city:     form.city.value.trim(),
      npBranch: form.npBranch.value.trim(),
      comment:  form.comment.value.trim(),
      items:    JSON.stringify(items.map(i => ({
        title: i.title, sku: i.sku, qty: i.qty, price: i.price, currency: i.currency
      })))
    });

    fetch(ORDER_FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data })
      .then(function () {
        layout.classList.add('hidden');
        successBlock.classList.remove('hidden');
        window.Cart.clear();
      })
      .catch(function (err) {
        console.error('checkout.js: помилка надсилання', err);
        showError();
      });
  }

  function init() {
    layout       = document.getElementById('checkout-layout');
    emptyBlock   = document.getElementById('checkout-empty');
    itemsWrap    = document.getElementById('checkout-items');
    totalEl      = document.getElementById('checkout-total');
    form         = document.getElementById('checkout-form');
    submitBtn    = document.getElementById('checkout-submit');
    successBlock = document.getElementById('checkout-success');
    errorBlock   = document.getElementById('checkout-error');

    if (!window.Cart) return;

    renderItems();
    wireItemsWrap();
    form.addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
