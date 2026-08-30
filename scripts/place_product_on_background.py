#!/usr/bin/env python3
"""Cut product photos out of their white studio background and place them on
one of the branded scene backgrounds from foto_fon/, per product category.

No ML/rembg available in this environment, so background removal uses a
flood-fill from the image corners on the (near-white) studio background,
which works because every source photo in assets/images/products/ is shot on
a plain white sweep.

Usage:
    python3 scripts/place_product_on_background.py                     # full batch, skips ids already done
    python3 scripts/place_product_on_background.py --limit 1           # one per category, for review
    python3 scripts/place_product_on_background.py --ids 150590,152520
    python3 scripts/place_product_on_background.py --ids 150590 --force  # redo even if cached

By default the script processes every product that has a category profile
(or a static override, see STATIC_OVERRIDES below) and SKIPS any id whose
output file already exists in --out-dir -- so re-running it after adding new
products to products.json only generates photos for the new ones. Pass
--force to regenerate everything anyway (e.g. after tweaking a profile).

Output goes to assets/images/products_studio/<id>_1.jpg by default so the
live site (which reads assets/images/products/) is untouched until the
results are reviewed.
"""
import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_JSON = os.path.join(ROOT, "products.json")
BG_DIR = os.path.join(ROOT, "foto_fon")
OVERRIDES_DIR = os.path.join(ROOT, "assets", "images", "overrides")
DEFAULT_OUT_DIR = os.path.join(ROOT, "assets", "images", "products_studio")

# Product ids that should just use a ready-made photo as-is (resized/
# re-encoded) instead of running the cutout+compose pipeline -- e.g. cable
# pairs, which already look good in one shared reference photo. Ids of
# products that look meaningfully different (e.g. the 500m cable reels)
# are deliberately left out so they keep going through the normal pipeline.
STATIC_OVERRIDES = {
    "145284": "cable_pair.jpg",
    "151847": "cable_pair.jpg",
    "151848": "cable_pair.jpg",
    "151849": "cable_pair.jpg",
    "151850": "cable_pair.jpg",
    "151851": "cable_pair.jpg",
    "151852": "cable_pair.jpg",
    "151853": "cable_pair.jpg",
    "151854": "cable_pair.jpg",
    "151777": "cable_pair.jpg",
}

# One background template per product category. Anchor is where the
# product's bottom-center should land (fractions of background width/height);
# width_ratio is the product's rendered width as a fraction of background width.
PROFILES = {
    "battery": dict(
        bg="image_2026-08-28_11-07-30.png",
        anchor_x=0.446, anchor_y=0.90, width_ratio=0.48, height_ratio=0.66,
        shadow_opacity=110,
    ),
    "inverter": dict(
        bg="image_2026-08-28_10-41-34.png",
        anchor_x=0.49, anchor_y=0.855, width_ratio=0.40, height_ratio=0.62,
        shadow_opacity=120,
    ),
    "ups": dict(
        bg="image_2026-08-28_10-54-04.png",
        anchor_x=0.50, anchor_y=0.78, width_ratio=0.30, height_ratio=0.55,
        shadow_opacity=90,
    ),
    "cable": dict(
        bg="image_2026-08-28_10-24-59.png",
        anchor_x=0.50, anchor_y=0.865, width_ratio=0.30, height_ratio=0.50,
        shadow_opacity=90,
    ),
}

CATEGORY_TO_PROFILE = {
    "Автономна енергетика > Акумулятори для гібридних інверторів": "battery",
    "Автономна енергетика > Гибридні інвертори": "inverter",
    # "Комплекти" photos are pre-made marketing collages (two products + a
    # green banner), not plain studio shots -- the cutout pipeline doesn't
    # apply to them, so they're deliberately left unmapped (skipped).
    "Автономна енергетика > Силові та сонячні кабелі": "cable",
    "Обладнання > Джерела безперебійного живлення": "ups",
}


def cutout_product(path, thresh=15):
    """Return an RGBA cutout tightly cropped to the non-background pixels."""
    img = Image.open(path).convert("RGB")
    w, h = img.size
    filled = img.copy()
    sentinel = (1, 254, 1)
    seeds = [
        (1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2),
        (w // 2, 1), (w // 2, h - 2), (1, h // 2), (w - 2, h // 2),
    ]
    for seed in seeds:
        if filled.getpixel(seed) != sentinel:
            ImageDraw.floodfill(filled, seed, sentinel, thresh=thresh)

    mask = Image.new("L", (w, h), 255)
    mask.putdata([0 if p == sentinel else 255 for p in filled.getdata()])
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))

    rgba = img.convert("RGBA")
    rgba.putalpha(mask)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def build_shadow(size, opacity):
    """Soft dark ellipse sized to sit under a cutout of the given size."""
    w, h = size
    pad = int(w * 0.4)
    canvas = Image.new("RGBA", (w + pad * 2, int(w * 0.5) + pad * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    ex0, ey0 = pad, pad
    ex1, ey1 = pad + w, pad + int(w * 0.32)
    draw.ellipse([ex0, ey0, ex1, ey1], fill=(10, 10, 15, opacity))
    canvas = canvas.filter(ImageFilter.GaussianBlur(w * 0.05))
    return canvas


def compose(bg_path, cutout, profile):
    bg = Image.open(bg_path).convert("RGBA")
    bw, bh = bg.size

    scale_w = (bw * profile["width_ratio"]) / cutout.width
    scale_h = (bh * profile["height_ratio"]) / cutout.height
    scale = min(scale_w, scale_h)
    target_w = int(cutout.width * scale)
    target_h = int(cutout.height * scale)
    resized = cutout.resize((target_w, target_h), Image.LANCZOS)

    anchor_x = int(bw * profile["anchor_x"])
    anchor_y = int(bh * profile["anchor_y"])

    shadow = build_shadow((target_w, target_h), profile["shadow_opacity"])
    sx = anchor_x - shadow.width // 2
    sy = anchor_y - int(shadow.height * 0.5)
    bg.alpha_composite(shadow, (sx, sy))

    px = anchor_x - target_w // 2
    py = anchor_y - target_h
    bg.alpha_composite(resized, (px, py))

    return bg.convert("RGB")


def profile_for(product):
    key = CATEGORY_TO_PROFILE.get(product.get("product_type", ""))
    return PROFILES.get(key)


def process_override(product, out_path):
    src = os.path.join(OVERRIDES_DIR, STATIC_OVERRIDES[product["id"]])
    img = Image.open(src).convert("RGB")
    if img.width > 1254:
        img = img.resize((1254, int(img.height * 1254 / img.width)), Image.LANCZOS)
    img.save(out_path, quality=92)


def process_pipeline(product, profile, out_path):
    src = os.path.join(ROOT, product["image_link"])
    if not os.path.isfile(src):
        print(f"skip {product['id']}: source not found {src}")
        return False
    cutout = cutout_product(src)
    bg_path = os.path.join(BG_DIR, profile["bg"])
    result = compose(bg_path, cutout, profile)
    result.save(out_path, quality=92)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="comma-separated product ids to process")
    ap.add_argument("--limit", type=int, help="process only N products per category (for review)")
    ap.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    ap.add_argument("--force", action="store_true", help="regenerate even if output already exists")
    args = ap.parse_args()

    with open(PRODUCTS_JSON, encoding="utf-8") as f:
        products = json.load(f)

    if args.ids:
        wanted = set(args.ids.split(","))
        products = [p for p in products if p["id"] in wanted]

    os.makedirs(args.out_dir, exist_ok=True)

    per_category_count = {}
    done = 0
    skipped_cached = 0
    for p in products:
        is_override = p["id"] in STATIC_OVERRIDES
        profile = profile_for(p)
        if not is_override and profile is None:
            continue
        cat_key = "cable-override" if is_override else CATEGORY_TO_PROFILE[p["product_type"]]

        out_path = os.path.join(args.out_dir, f"{p['id']}_1.jpg")
        if os.path.isfile(out_path) and not args.force:
            skipped_cached += 1
            continue

        if args.limit is not None:
            n = per_category_count.get(cat_key, 0)
            if n >= args.limit:
                continue
            per_category_count[cat_key] = n + 1

        if is_override:
            process_override(p, out_path)
        else:
            if not process_pipeline(p, profile, out_path):
                continue

        done += 1
        print(f"{p['id']} [{cat_key}] -> {out_path}")

    print(f"done: {done} images, skipped {skipped_cached} already cached")


if __name__ == "__main__":
    main()
