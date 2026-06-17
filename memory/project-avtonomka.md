---
name: project-avtonomka
description: Повна інформація про проект сайту Автономка — структура, стек, дані, адмін
metadata:
  type: project
---

## Проект: Автономка

Інтернет-магазин товарів для автономного живлення (сонячні панелі, акумулятори, інвертори).

**Why:** Статичний сайт на GitHub Pages без бекенду, всі дані в JSON.
**How to apply:** При змінах враховувати що немає сервера — всі рішення статичні або через GitHub API.

---

## Хостинг і репозиторій

- **Хостинг:** GitHub Pages
- **Репо:** `https://github.com/mlntn-hash/avtonomka_site`
- **Гілка:** `master`
- **GitHub user:** `mlntn-hash`

---

## Стек

- Чистий HTML + CSS + Vanilla JS (без фреймворків, без npm)
- Один CSS файл: `assets/css/style.css`
- Дані: JSON файли в корені та `/data/`

---

## Структура файлів

```
index.html          — головна
catalog.html        — каталог товарів
product.html        — сторінка товару
blog.html           — новини (Telegram-пости)
articles.html       — статті (кастомні)
admin.html          — адмін-панель (без сервера)
404.html

assets/css/style.css
assets/js/main.js        — бургер-меню, спільне
assets/js/catalog.js     — каталог з фільтрами
assets/js/product.js     — сторінка товару
assets/js/blog.js        — Telegram-пости + превью на головній
assets/js/articles.js    — статті + hash-навігація

assets/images/           — логотип, стікери хом'яка, іконки
  logo.jpg, sticker.webp, 1111111.webp, 2222.webp
  vibir.png, garantia.png, dostavka.png  — іконки "Чому обирають нас"

data/telegram_posts.json — пости з Telegram-каналу
data/articles.json       — кастомні статті (публікуються через admin.html)
products.json            — каталог товарів
```

---

## CSS Variables (design tokens)

```css
--color-dark:    #1a2e4a   /* темно-синій, хедер */
--color-orange:  #f5a623   /* акцент, CTA */
--color-green:   #2ecc40   /* ціни, логотип */
--color-grey:    #f4f6f8   /* фон сторінки */
--color-white:   #ffffff
--color-text:    #222831
--color-muted:   #6c757d
--color-border:  #e0e6ed
--radius:        8px
--radius-lg:     12px
--shadow:        0 2px 12px rgba(26,46,74,.10)
--max-w:         1200px
```

---

## Дані товарів (products.json)

Поля кожного товару:
- `id`, `title`, `description` (HTML з битими тегами `lt;p>`→ очищує `cleanDescription()`)
- `price` (рядок, напр. `"34062 UAH"`), `availability` (`"in_stock"` або інше)
- `images` (масив URL), `mpn` (артикул), `product_type` (категорія, напр. `"Felicity"`)

---

## Дані статей (data/articles.json)

```json
[
  {
    "id": "slug-унікальний-timestamp",
    "title": "...",
    "summary": "короткий опис для картки",
    "body": "повний текст (абзаци через подвійний \n\n)",
    "photo": "URL або порожньо",
    "date": "2026-05-22"
  }
]
```

---

## Адмін-панель (admin.html)

- **Без бекенду** — зберігає статті через GitHub API (PUT `data/articles.json`)
- **Пароль:** SHA-256 хеш у `localStorage` (`admin_pwd_hash`), сесія у `sessionStorage`
- **Перший вхід:** форма встановлення пароля (Setup screen)
- **GitHub токен:** зберігається у `localStorage` (`admin_gh_token`), вводиться один раз
- **Налаштування:** owner=`mlntn-hash`, repo=`avtonomka_site`, branch=`master`
- **Після публікації:** GitHub Pages деплоїть за ~1 хвилину

---

## Навігація (у всіх HTML)

```html
<li><a href="index.html">Головна</a></li>
<li><a href="catalog.html">Каталог</a></li>
<li><a href="blog.html">Новини</a></li>
<li><a href="articles.html">Статті</a></li>
```
Футер також містить ці ж посилання + Telegram.

---

## Telegram-канал

`https://t.me/avtonomka_od` — використовується скрізь для зворотного зв'язку.

---

## Відомі особливості / нюанси

- Описи товарів містять зламаний HTML (`lt;p data-end="...">`) — обробляє `cleanDescription()` у `product.js`
- Telegram-пости: `white-space: pre-wrap` щоб зберігати відступи як у Telegram
- Картинки статей: `object-fit: contain` (не обрізати)
- Іконки "Чому обирають нас": 120×120px PNG (`vibir.png`, `garantia.png`, `dostavka.png`)
- На головній: секції "Останні надходження", "Чому обирають нас", "Останні новини", "Останні статті", "Контакти"
- При `git push` іноді треба `git pull --rebase` перед пушем (є авто-коміти в репо)
