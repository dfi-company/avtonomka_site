# Автоматизація сайту Автономка
## Документація: що, коли і як оновлюється

---

## Загальна схема

```
09:00 Київ  →  GitHub Actions (оновлює дані, комітить у репо)
10:00 Київ  →  Сервер (підтягує зміни з репо)
```

Весь процес відбувається **щодня автоматично** без жодних ручних дій.

---

## 1. GitHub Actions — щодня о 09:00 (Київ)

**Де налаштовано:** `.github/workflows/update.yml`

**Розклад:** `0 6 * * *` (06:00 UTC = 09:00 Київ)

### Що відбувається по кроках:

#### Крок 1 — Оновлення товарів (`scripts/fetch_feed.py`)
- Завантажує актуальні ціни та наявність з джерела: `https://dfi2.com.ua/price_xml/avtonomka.txt`
- Зберігає опис, посилання та специфікації товарів, які вже були на сайті
- Для товарів категорії **"Комплекти"** перевіряє наявність локального фото в папці `assets/images/komp/`
  - Є локальне фото → використовує його
  - Немає локального фото → ставить заглушку `assets/images/zaglushka.png` *(зовнішнє посилання НЕ використовується)*
- Результат зберігається у файл `products.json`

#### Крок 2 — Оновлення Telegram-постів (`scripts/fetch_telegram.py`)
- Парсить публічну веб-версію каналу `t.me/s/avtonomka_od`
- Завантажує до **30 останніх постів** (текст, фото, дата, посилання)
- Результат зберігається у файл `data/telegram_posts.json`
- На головній сторінці сайту показується **15 постів**, на сторінці новин — всі

#### Крок 3 — Генерація CSV-каталогу (`scripts/export_to_csv.js`)
- Генерує файл `catalog_export.csv` з усіма товарами
- Використовується для синхронізації з Google Sheets

#### Крок 4 — Генерація фіду для Google Merchant Center (`scripts/generate_merchant_feed.js`)
- На основі оновленого `products.json` генерує XML-файл `feed.xml`
- Формат: RSS 2.0 + Google Shopping (namespace `g:`)
- Усі зображення комплектів мають повний URL: `https://avtonomka.com.ua/assets/images/komp/...`
- Фід доступний за адресою: **`https://avtonomka.com.ua/feed.xml`**

#### Крок 5 — Коміт і пуш у репо
- Якщо дані змінились — створюється автоматичний коміт:
  ```
  chore: update products and posts [2026-06-13 06:00 UTC]
  ```
- Файли що оновлюються: `products.json`, `data/telegram_posts.json`, `catalog_export.csv`, `feed.xml`
- Якщо змін не було — коміт не створюється

---

## 2. Сервер — щодня о 10:00 (Київ)

**Де налаштовано:** cron на сервері (`crontab -l`)

**Розклад:** `0 7 * * *` (07:00 UTC = 10:00 Київ)

**Команда:**
```bash
cd /home/avtonomka.com.ua/public_html && git pull >> /home/avtonomka.com.ua/logs/git-pull.log 2>&1
```

**Що відбувається:**
- Сервер підтягує всі зміни з GitHub-репозиторію
- Сайт автоматично відображає актуальні ціни, наявність, пости і фід

**Лог виконання:** `/home/avtonomka.com.ua/logs/git-pull.log`

---

## 3. Google Merchant Center

**URL фіду:** `https://avtonomka.com.ua/feed.xml`

**Розклад оновлення в Merchant Center:** автоматично раз на 24 години (налаштовано в панелі Merchant Center)

**Що містить фід:**
- Усі 65+ товарів сайту
- Поля: назва, опис, ціна (UAH), наявність, фото, категорія, артикул, посилання на товар
- Посилання на товари: `https://avtonomka.com.ua/product.html?id=...`

---

## 4. Як перевірити що все працює

### Перевірка GitHub Actions:
1. Зайти на GitHub → репо → вкладка **Actions**
2. Знайти workflow **"Update site data"**
3. Зелений статус = успішно, червоний = помилка (деталі всередині)

### Перевірка серверного cron:
```bash
# Переглянути лог останнього git pull
cat /home/avtonomka.com.ua/logs/git-pull.log

# Переглянути останні 3 коміти на сервері
cd /home/avtonomka.com.ua/public_html && git log --oneline -3

# Переглянути розклад cron
crontab -l
```

### Ручний запуск (без очікування розкладу):
- **GitHub Actions:** GitHub → Actions → "Update site data" → кнопка **"Run workflow"**
- **Сервер:** `cd /home/avtonomka.com.ua/public_html && git pull`

---

## 5. Ключові файли

| Файл | Призначення |
|---|---|
| `.github/workflows/update.yml` | Розклад і кроки GitHub Actions |
| `scripts/fetch_feed.py` | Завантаження цін і наявності |
| `scripts/fetch_telegram.py` | Завантаження постів з Telegram |
| `scripts/generate_merchant_feed.js` | Генерація XML-фіду для Merchant Center |
| `scripts/export_to_csv.js` | Експорт каталогу в CSV для Google Sheets |
| `products.json` | Актуальний список товарів |
| `data/telegram_posts.json` | Останні 30 постів Telegram |
| `feed.xml` | Фід для Google Merchant Center |
| `assets/images/komp/` | Локальні фото комплектів |
| `assets/images/zaglushka.png` | Заглушка для товарів без фото |

---

## 6. Важливо знати

**Нові комплекти без фото:**
Якщо в каталозі з'являється новий комплект і для нього ще немає фото в папці `assets/images/komp/` — автоматично ставиться заглушка. Щоб додати фото: завантаж файл `{id}.png` в папку `assets/images/komp/` і запушь у репо. При наступному запуску GitHub Actions фото підхопиться автоматично.

**Опис, посилання, специфікації товарів:**
При кожному оновленні цін зі зовнішнього джерела ці поля **зберігаються** — вони не перезаписуються автоматично.

**Часова зона:**
Увесь розклад прив'язаний до **київського часу (UTC+3)**. Влітку це відповідає UTC+3, взимку UTC+2 — якщо потрібна точність, варто скоригувати cron у жовтні та березні.
