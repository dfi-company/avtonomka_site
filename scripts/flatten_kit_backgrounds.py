#!/usr/bin/env python3
"""Replace the green studio-background gradient on "Комплекти" (kit combo)
photos with a single flat brand color, strip the "КОМПЛЕКТ АВТОНОМНОГО
ЕНЕРГОЖИВЛЕННЯ" title text, and re-crop/enlarge the product photos to make
better use of the freed space. Per product owner's request:

  - mono-brand kits (inverter + battery same brand): Deye -> blue,
    Felicity -> orange, Must -> red
  - everything else (mixed-brand kits): yellow

Supersedes scripts/recolor_monobrand_kits.py (which only hue-shifted the
gradient rather than flattening it, and only touched mono-brand kits).

How it works, per image:
  1. Detect background pixels via HSV (green hue range + minimum
     saturation) - this is the actual gradient, not a fixed color, so a
     plain color-match wouldn't do; a hue+saturation *range* does.
  2. Force everything above TEXT_CUTOFF to also be treated as background
     (removes the title text, which sits in that band and isn't reliably
     separable from the gradient behind it - it was authored with partial
     transparency onto the green, so its own pixels already carry some
     green tint).
  3. Flat-fill all of that with the target color (soft-edged mask so there
     is no hard seam around product edges).
  4. Find the bounding box of what's left (products + name labels, only
     below TEXT_CUTOFF so leftover text ghosting can't skew it), crop to
     it with a small pad, scale up to fit the canvas (aspect preserved, so
     nothing is ever stretched or clipped), and center it on a fresh flat
     canvas.

Images whose green-background coverage is negligible (a handful of kits
use a one-off custom photo, not the green template) are left untouched -
see MIN_BG_FRACTION.

Usage:
    python3 scripts/flatten_kit_backgrounds.py            # process all matches
    python3 scripts/flatten_kit_backgrounds.py --dry-run   # just list them
"""
import argparse
import glob
import json
import os
import re

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_JSON = os.path.join(ROOT, "products.json")
KOMP_DIR = os.path.join(ROOT, "assets", "images", "komp")

KNOWN_BRANDS = ["DAH Solar", "Deye", "Dyness", "Felicity", "Must"]

BRAND_RGB = {
    "Deye": (38, 102, 191),      # blue
    "Felicity": (235, 128, 35),  # orange
    "Must": (199, 40, 50),       # red
}
MIXED_RGB = (242, 201, 36)  # yellow, for kits that aren't mono-brand

HUE_LOW, HUE_HIGH = 50, 120   # PIL 0-255 hue units, ~70-169 degrees (green)
SAT_MIN = 31                  # PIL 0-255 saturation units, ~12%
TEXT_CUTOFF = 310             # px from top, below which real product content starts
PAD = 24                      # px padding kept around the detected content bbox
MIN_BG_FRACTION = 0.15        # skip images where less than this much is background


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


def target_color(title):
    inv, bat = kit_brands(title)
    if inv and inv == bat:
        return BRAND_RGB.get(inv, MIXED_RGB)
    return MIXED_RGB


def background_mask(im):
    H, S, _ = im.convert("HSV").split()
    mask_hue = H.point(lambda p: 255 if HUE_LOW <= p <= HUE_HIGH else 0)
    mask_sat = S.point(lambda p: 255 if p >= SAT_MIN else 0)
    return ImageChops.multiply(mask_hue, mask_sat)


def process(path, target_rgb):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    bg_mask = background_mask(im)

    # bounding box of real content (non-background), ignoring the text band
    content_mask = ImageChops.invert(bg_mask)
    ImageDraw.Draw(content_mask).rectangle([0, 0, w, TEXT_CUTOFF], fill=0)
    bbox = content_mask.getbbox() or (0, TEXT_CUTOFF, w, h)
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - PAD)
    y0 = max(TEXT_CUTOFF, y0 - PAD)
    x1 = min(w, x1 + PAD)
    y1 = min(h, y1 + PAD)

    # flatten background, forcing the whole text band into it too
    top_band = Image.new("L", (w, h), 0)
    ImageDraw.Draw(top_band).rectangle([0, 0, w, TEXT_CUTOFF], fill=255)
    full_mask = ImageChops.lighter(bg_mask, top_band).filter(ImageFilter.GaussianBlur(2))
    solid = Image.new("RGB", (w, h), target_rgb)
    flat = Image.composite(solid, im, full_mask)

    # crop to content, scale to fit, center on a flat canvas
    crop = flat.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    scale = min(w / cw, h / ch)
    new_size = (round(cw * scale), round(ch * scale))
    crop_resized = crop.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), target_rgb)
    canvas.paste(crop_resized, ((w - new_size[0]) // 2, (h - new_size[1]) // 2))

    kwargs = {"quality": 95} if path.lower().endswith((".jpg", ".jpeg")) else {}
    canvas.save(path, **kwargs)


def bg_fraction(im):
    mask = background_mask(im)
    hist = mask.histogram()
    return hist[255] / (im.size[0] * im.size[1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    products = json.load(open(PRODUCTS_JSON, encoding="utf-8"))
    done, skipped = 0, 0
    for p in products:
        title = p.get("title") or ""
        if not title.startswith("Комплект автономного енергоживлення"):
            continue

        matches = glob.glob(os.path.join(KOMP_DIR, f"{p['id']}.*"))
        if not matches:
            print(f"  no image for {p['id']} - skipped")
            continue
        path = matches[0]

        im = Image.open(path).convert("RGB")
        frac = bg_fraction(im)
        if frac < MIN_BG_FRACTION:
            print(f"  {p['id']}: only {frac:.0%} background - not the green template, skipped")
            skipped += 1
            continue

        rgb = target_color(title)
        print(f"{'[dry-run] ' if args.dry_run else ''}{p['id']}  -> {rgb}  {os.path.basename(path)}")
        if not args.dry_run:
            process(path, rgb)
        done += 1

    print(f"\n{done} image(s) {'would be ' if args.dry_run else ''}processed, {skipped} skipped")


if __name__ == "__main__":
    main()
