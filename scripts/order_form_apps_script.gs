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
 * Результат: кожна заявка з сайту додається новим рядком на аркуш "Заявки"
 * цієї ж таблиці: Дата/час | Ім'я | Телефон | Товар | Коментар.
 */

const SHEET_NAME = 'Заявки';

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Дата/час', "Ім'я", 'Телефон', 'Товар', 'Коментар']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const params = (e && e.parameter) || {};
    const timestamp = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');

    sheet.appendRow([
      timestamp,
      params.name    || '',
      params.phone   || '',
      params.product || '',
      params.comment || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
