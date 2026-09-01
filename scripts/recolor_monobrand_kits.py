#!/usr/bin/env python3
"""Recolor the green studio background on "Комплекти" (kit) combo photos to
a brand color, for kits where the inverter and battery are the same brand
(Deye -> blue, Felicity -> orange, Must -> red) - per product owner's request.

Only touches the green background/floor via an HSV hue swap (green hue range
-> flat target hue), leaving the product photos, text, and any non-green
accent colors (e.g. a battery's own LCD glow) alone. Naturally idempotent:
re-running it on an already-recolored image is a no-op, since the mask only
matches green hues, not the brand colors this script produces.

Usage:
    python3 scripts/recolor_monobrand_kits.py            # recolor all matches
    python3 scripts/recolor_monobrand_kits.py --dry-run   # just list matches
"""
import argparse
import glob
import json
import os
import re

from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_JSON = os.path.join(ROOT, "products.json")
KOMP_DIR = os.path.join(ROOT, "assets", "images", "komp")

KNOWN_BRANDS = ["DAH Solar", "Deye", "Dyness", "Felicity", "Must"]

# Target hue in degrees for each brand's background, per product owner.
BRAND_HUE = {
    "Deye": 215,      # blue
    "Felicity": 28,   # orange
    "Must": 356,      # red
}

# Source green hue range (PIL 0-255 scale, ~70-169 degrees) and minimum
# saturation to count as "background", tuned against the actual studio
# gradient - see git history for how these were picked.
HUE_LOW, HUE_HIGH = 50, 120
SAT_MIN = 31


def extract_brand(text):
    for b in KNOWN_BRANDS:
        if re.search(r"\b" + re.escape(b) + r"\b", text, re.I):
            return b
    return None


def kit_brands(title):
    body = re.sub(r"^Комплект автономного енергоживлення:\s*", "", title or "", flags=re.I)
    parts = re.split(r"\s*\+\s*", body)
    if len(parts) != 2:
        return (None, None)
    return (extract_brand(parts[0]), extract_brand(parts[1]))


def recolor_green_bg(path, target_deg):
    im = Image.open(path).convert("RGB")
    H, S, V = im.convert("HSV").split()
    target = round(target_deg / 360 * 255) % 256
    H_target = Image.new("L", im.size, target)
    mask_hue = H.point(lambda p: 255 if HUE_LOW <= p <= HUE_HIGH else 0)
    mask_sat = S.point(lambda p: 255 if p >= SAT_MIN else 0)
    mask = ImageChops.multiply(mask_hue, mask_sat).filter(ImageFilter.GaussianBlur(2))
    H_final = Image.composite(H_target, H, mask)
    out = Image.merge("HSV", (H_final, S, V)).convert("RGB")
    kwargs = {"quality": 95} if path.lower().endswith((".jpg", ".jpeg")) else {}
    out.save(path, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    products = json.load(open(PRODUCTS_JSON, encoding="utf-8"))
    changed = 0
    for p in products:
        title = p.get("title") or ""
        if not title.startswith("Комплект автономного енергоживлення"):
            continue
        inv_brand, bat_brand = kit_brands(title)
        if not inv_brand or inv_brand != bat_brand:
            continue
        hue = BRAND_HUE.get(inv_brand)
        if hue is None:
            continue

        matches = glob.glob(os.path.join(KOMP_DIR, f"{p['id']}.*"))
        if not matches:
            print(f"  no image for {p['id']} ({inv_brand}) - skipped")
            continue

        path = matches[0]
        print(f"{'[dry-run] ' if args.dry_run else ''}{p['id']}  {inv_brand} -> hue {hue}  {os.path.basename(path)}")
        if not args.dry_run:
            recolor_green_bg(path, hue)
        changed += 1

    print(f"\n{changed} monobrand kit image(s) {'would be ' if args.dry_run else ''}recolored")


if __name__ == "__main__":
    main()
