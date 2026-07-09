#!/usr/bin/env python3
"""
Завантажує JSON-фід товарів з URL і зберігає у products.json.
URL: https://dfi2.com.ua/price_xml/avtonomka.txt
"""

import json
import sys
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import requests

FEED_URL = "https://dfi2.com.ua/price_xml/avtonomka.txt"
OUTPUT_FILE = Path(__file__).parent.parent / "products.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; Googlebot/2.1; "
        "+http://www.google.com/bot.html)"
    )
}


def main() -> int:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Завантаження {FEED_URL}...")

    try:
        resp = requests.get(FEED_URL, headers=HEADERS, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"ПОМИЛКА: не вдалося завантажити фід: {exc}", file=sys.stderr)
        return 1

    print(f"  Отримано {len(resp.content):,} байт")

    try:
        text = resp.content.decode("utf-8-sig")
        data = json.loads(text)
    except Exception as exc:
        print(f"ПОМИЛКА: не вдалося розпарсити JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(data, list):
        print("ПОМИЛКА: очікується JSON-масив", file=sys.stderr)
        return 1

    # Preserve existing descriptions, links and embeds from current products.json
    existing_desc = {}
    existing_link = {}
    existing_embed = {}
    existing_specs = {}
    if OUTPUT_FILE.exists():
        try:
            existing = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
            for item in existing:
                if item.get("description"):
                    existing_desc[item["id"]] = item["description"]
                if item.get("link"):
                    existing_link[item["id"]] = item["link"]
                if item.get("embed"):
                    existing_embed[item["id"]] = item["embed"]
                if item.get("specs"):
                    existing_specs[item["id"]] = item["specs"]
        except Exception:
            pass

    for p in data:
        p["description"] = existing_desc.get(p["id"], "")
        p["link"] = existing_link.get(p["id"], "")
        p["embed"] = existing_embed.get(p["id"], "")
        p["specs"] = existing_specs.get(p["id"], "")

    komp_dir = Path(__file__).parent.parent / "assets" / "images" / "komp"
    if komp_dir.exists():
        komp_ids = {f.stem: f.name for f in komp_dir.iterdir() if "(" not in f.name}
        overridden = 0
        for p in data:
            if p.get("id") in komp_ids:
                p["image_link"] = f"assets/images/komp/{komp_ids[p['id']]}"
                overridden += 1
        if overridden:
            print(f"  Замінено фото для {overridden} товарів (локальні фото в assets/images/komp/)")

    # Комплекти без локального фото → заглушка (не використовуємо зовнішнє URL)
    fallback = 0
    for p in data:
        if "Комплект" in p.get("product_type", ""):
            if not p.get("image_link", "").startswith("assets/"):
                p["image_link"] = "assets/images/zaglushka.png"
                fallback += 1
    if fallback:
        print(f"  Заглушка для {fallback} комплектів без локального фото")

    OUTPUT_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    size_kb = OUTPUT_FILE.stat().st_size // 1024
    print(f"  Товарів: {len(data)}")
    print(f"  Збережено -> {OUTPUT_FILE} ({size_kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
