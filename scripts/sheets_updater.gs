/**
 * Google Apps Script — автоматичне оновлення каталогу товарів
 *
 * Як підключити:
 * 1. Відкрий Google Sheets → Розширення → Apps Script
 * 2. Встав цей код замість наявного
 * 3. Збережи (Ctrl+S)
 * 4. Запусти setupDailyTrigger() один раз (кнопка ▶ з обраною функцією)
 * 5. Дай дозвіл на доступ до таблиці та інтернету
 *
 * Після цього таблиця буде оновлюватись щодня о 07:00 автоматично.
 * Також можна натиснути ▶ на updateCatalog() щоб оновити вручну.
 */

const CSV_URL = 'https://raw.githubusercontent.com/mlntn-hash/avtonomka_site/master/catalog_export.csv';
const SHEET_NAME = 'Каталог';

function updateCatalog() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const response = UrlFetchApp.fetch(CSV_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    Logger.log('Помилка завантаження CSV: ' + response.getResponseCode());
    return;
  }

  const csvText = response.getContentText('UTF-8').replace(/^﻿/, '');
  const rows    = Utilities.parseCsv(csvText);
  if (!rows || rows.length < 2) {
    Logger.log('CSV порожній або некоректний');
    return;
  }

  sheet.clearContents();
  sheet.clearFormats();

  const numCols = rows[0].length;
  sheet.getRange(1, 1, rows.length, numCols).setValues(rows);

  // ── Форматування шапки ──
  const header = sheet.getRange(1, 1, 1, numCols);
  header.setFontWeight('bold')
        .setBackground('#1a73e8')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');

  // ── Ширина колонок ──
  const colWidths = [200, 120, 380, 80, 60, 300, 500]; // category,brand,name,price,unit,photo_url,description
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── Заморозити шапку ──
  sheet.setFrozenRows(1);

  // ── Зебра-рядки ──
  for (let i = 2; i <= rows.length; i++) {
    const bg = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
    sheet.getRange(i, 1, 1, numCols).setBackground(bg);
  }

  const updatedAt = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy HH:mm');
  Logger.log(`Оновлено ${rows.length - 1} товарів о ${updatedAt}`);
  SpreadsheetApp.getActiveSpreadsheet().toast(`Каталог оновлено: ${rows.length - 1} товарів`, 'Готово', 5);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updateCatalog')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  Logger.log('Щоденний тригер встановлено о 07:00');
  SpreadsheetApp.getActiveSpreadsheet().toast('Щоденний тригер встановлено о 07:00', 'OK', 5);
}
