/**
 * Google Apps Script — прийом заявок з форми замовлення сайту Автономка
 * (без прийому оплати онлайн, лише збір заявки: ім'я, телефон, товар, коментар)
 *
 * ІНСТРУКЦІЯ (виконати вручну, один раз):
 * 1. Створи нову Google Таблицю (sheets.google.com → Порожній файл).
 * 2. У таблиці: Розширення → Apps Script.
 * 3. Видали весь код-заготовку в редакторі та встав замість нього весь цей файл.
 * 4. Збережи проєкт (Ctrl+S / іконка дискети), дай назву, напр. "Avtonomka Order Form".
 * 5. Натисни синю кнопку "Розгорнути" (Deploy) → "Нове розгортання" (New deployment).
 *    - Тип: "Веб-застосунок" (Web app).
 *    - Опис: будь-який, напр. "order form".
 *    - "Виконати від імені" (Execute as): Я (свій акаунт).
 *    - "Хто має доступ" (Who has access): Усі (Anyone) — обов'язково, інакше
 *      сайт не зможе надсилати дані без авторизації Google.
 * 6. Натисни "Розгорнути" (Deploy). Google попросить надати дозволи —
 *    підтверди (Google може показати попередження "Незнайомий застосунок",
 *    це нормально для власного скрипта: "Додатково" → "Перейти до проєкту (небезпечно)" → "Дозволити").
 * 7. Скопіюй URL веб-застосунку — виглядає як:
 *    https://script.google.com/macros/s/XXXXXXXXXXXXXXXXX/exec
 * 8. Встав цей URL у файл assets/js/order-form.js замість рядка:
 *    const ORDER_FORM_ENDPOINT = '';
 * 9. Якщо пізніше зміниш код цього скрипта — потрібно створити НОВЕ
 *    розгортання (Manage deployments → Edit (олівець) → New version → Deploy),
 *    інакше зміни не застосуються до вже виданого URL.
 *
 * Результат: кожна заявка з сайту додається рядком (для кошика — по рядку
 * на товар зі спільним "№ замовлення") на аркуш "Заявки" цієї ж таблиці:
 * Дата/час | Ім'я | Телефон | Товар | Коментар | Кількість | № замовлення |
 * Місто | Відділення/поштомат НП | Спосіб оплати.
 *
 * Місто, відділення НП і спосіб оплати заповнюються лише замовленнями з
 * кошика (checkout.html) — швидка заявка через order-form.js їх не збирає,
 * там ці колонки лишаються порожні.
 *
 * Якщо аркуш уже існує зі старим (5- чи 7-колонковим) заголовком — скрипт сам
 * дописує відсутні колонки при першому ж запиті, без нового розгортання.
 * Але якщо ти оновлюєш цей .gs-код у вже розгорнутому проєкті — потрібне
 * нове розгортання (крок 9 вище), інакше зміни коду не застосуються.
 */

const SHEET_NAME = 'Заявки';
const HEADER = ['Дата/час', "Ім'я", 'Телефон', 'Товар', 'Коментар', 'Кількість', '№ замовлення', 'Місто', 'Відділення/поштомат НП', 'Спосіб оплати'];

function ensureSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADER);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    return sheet;
  }

  /* Аркуш міг бути створений старою версією скрипта (5 колонок без
     "Кількість"/"№ замовлення") — дописуємо відсутні заголовки, не
     чіпаючи вже наявні рядки. */
  const currentCols = sheet.getLastColumn();
  if (currentCols < HEADER.length) {
    sheet.getRange(1, currentCols + 1, 1, HEADER.length - currentCols)
      .setValues([HEADER.slice(currentCols)])
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  }

  return sheet;
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ensureSheet(ss);

    const params = (e && e.parameter) || {};
    const timestamp = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');
    const name          = params.name          || '';
    const phone         = params.phone         || '';
    const comment       = params.comment       || '';
    const city          = params.city          || '';
    const npBranch      = params.npBranch      || '';
    const paymentMethod = params.paymentMethod || '';

    let items = [];
    if (params.items) {
      try { items = JSON.parse(params.items); } catch (parseErr) { items = []; }
    }

    if (Array.isArray(items) && items.length > 0) {
      /* Кошик: один рядок на товар, спільний orderId, щоб бачити,
         які позиції належать одному замовленню. */
      const orderId = Utilities.formatDate(new Date(), 'Europe/Kiev', 'yyyyMMdd-HHmmss');
      items.forEach(function (item) {
        const title = (item && item.title) || '';
        const sku   = (item && item.sku) || '';
        const qty   = (item && item.qty) || 1;
        sheet.appendRow([
          timestamp,
          name,
          phone,
          sku ? (title + ' (Арт. ' + sku + ')') : title,
          comment,
          qty,
          orderId,
          city,
          npBranch,
          paymentMethod
        ]);
      });
    } else {
      /* Стара форма — одне замовлення на 1 товар, без даних доставки. */
      sheet.appendRow([timestamp, name, phone, params.product || '', comment, '', '', '', '', '']);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
