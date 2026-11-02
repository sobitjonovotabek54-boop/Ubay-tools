import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('docs/data/products.json', encoding='utf-8') as f:
    data = json.load(f)

categories = data['categories']
cat_img_map = {c['name']: c.get('image', '') for c in categories}
section_cats = {}
for c in categories:
    sec = c['section_id']
    if sec not in section_cats:
        section_cats[sec] = []
    section_cats[sec].append(c['name'])

# Global fallback images from popular accessories
all_cat_images = [c['image'] for c in categories if c.get('image')]

# Build 4 images per category
category_4_images = {}
for sec_id, cats in section_cats.items():
    sec_imgs = [cat_img_map[c] for c in cats if cat_img_map.get(c)]
    for i, cat in enumerate(cats):
        primary = cat_img_map.get(cat, '')
        pool = [primary] if primary else []
        # add other images from same section
        for other in sec_imgs:
            if other and other not in pool:
                pool.append(other)
            if len(pool) >= 4:
                break
        # if still less than 4, borrow from all_cat_images
        for fallback in all_cat_images:
            if fallback not in pool:
                pool.append(fallback)
            if len(pool) >= 4:
                break
        category_4_images[cat] = pool[:4]

# Assign to products
for p in data['products']:
    cat = p.get('category', '')
    p_img = p.get('image', '')
    cat_imgs = category_4_images.get(cat, all_cat_images[:4])
    images = []
    if p_img:
        images.append(p_img)
    for img in cat_imgs:
        if img not in images:
            images.append(img)
        if len(images) >= 4:
            break
    while len(images) < 4:
        for fb in all_cat_images:
            if fb not in images:
                images.append(fb)
            if len(images) >= 4:
                break
    p['images'] = images[:4]
    p['image'] = images[0]

# Save products.json (minified)
minified = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
with open('docs/data/products.json', 'w', encoding='utf-8') as f:
    f.write(minified)

# Save catalog.js (instant load)
with open('docs/data/catalog.js', 'w', encoding='utf-8') as f:
    f.write('window.CATALOG_DATA=' + minified + ';')

print(f"Successfully updated {len(data['products'])} products with 4 images each!")
sample = data['products'][0]
print("Sample product:", sample['name'])
print("Images count:", len(sample['images']))
print("Images:", sample['images'])
