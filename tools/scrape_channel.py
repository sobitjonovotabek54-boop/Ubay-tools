"""Сбор товаров из открытой веб-версии Telegram-канала в JSON для статического сайта.

Вход в Telegram не нужен: читаются публичные страницы t.me.

Использование:
    python tools/scrape_channel.py [--limit-categories N]

Результат: docs/data/products.json и обложки категорий в docs/img/categories/.
"""
import argparse
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from import_telegram import CHANNEL, clean_line, parse_product  # noqa: E402

ROOT = TOOLS_DIR.parent
SITE_DIR = ROOT / "docs"
CACHE_DIR = TOOLS_DIR / ".cache"
CATEGORY_IMAGE_DIR = SITE_DIR / "img" / "categories"
DATA_FILE = SITE_DIR / "data" / "products.json"
POST_LINK = re.compile(rf"https?://t\.me/{CHANNEL}/(\d+)", re.I)
CONTENTS_QUERY = "Содержание"
REQUEST_DELAY = 0.35
WORKERS = 5


def log(message):
    print(message, flush=True)


def fetch(url, binary=False, use_cache=True):
    key = hashlib.sha1(url.encode()).hexdigest()
    cached = CACHE_DIR / key
    if use_cache and cached.exists():
        data = cached.read_bytes()
    else:
        for attempt in range(4):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = response.read()
                break
            except Exception as error:
                if attempt == 3:
                    raise
                log(f"    повтор {attempt + 1} ({error!r}): {url}")
                time.sleep(2 * (attempt + 1))
        time.sleep(REQUEST_DELAY)
        if use_cache:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
    return data if binary else data.decode("utf-8", errors="replace")


def html_to_text(fragment):
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    return html.unescape(re.sub(r"<[^>]+>", "", fragment))


def parse_post(page):
    text_match = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', page, re.S)
    text_html = text_match.group(1) if text_match else ""
    links = []
    for href, label in re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', text_html, re.S):
        match = POST_LINK.match(html.unescape(href))
        if match:
            links.append((clean_line(html_to_text(label)), int(match.group(1))))
    photo = re.search(r"tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)", page)
    return {"text": html_to_text(text_html).strip(), "links": links, "photo": photo.group(1) if photo else ""}


def get_post(post_id):
    return parse_post(fetch(f"https://t.me/{CHANNEL}/{post_id}?embed=1&mode=tme"))


def contents_posts():
    page = fetch(f"https://t.me/s/{CHANNEL}?q={urllib.request.quote(CONTENTS_QUERY)}", use_cache=False)
    result = []
    for block in re.split(r'<div class="tgme_widget_message_wrap', page)[1:]:
        post_id = int(re.search(r'data-post="[^/]+/(\d+)"', block).group(1))
        post = parse_post(block)
        if CONTENTS_QUERY in post["text"] and len(post["links"]) >= 10:
            result.append((post_id, post))
    return sorted(result)


def save_category_image(url, name):
    from PIL import Image, ImageOps

    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    data = fetch(url, binary=True)
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    image.thumbnail((900, 900))
    CATEGORY_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    filename = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12] + ".jpg"
    image.save(CATEGORY_IMAGE_DIR / filename, "JPEG", quality=82, optimize=True, progressive=True)
    return f"img/categories/{filename}"


def prefetch(post_ids):
    """Загружает посты параллельно в кэш; дальше обработка идёт из кэша по порядку."""
    def load(post_id):
        try:
            get_post(post_id)
        except Exception:
            pass
    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(load, post_ids))


def is_index(post, product):
    """Пост-указатель: много ссылок на другие посты и почти нет характеристик."""
    return len(post["links"]) >= 3 and (not product or len(product["specs"]) < 2)


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-categories", type=int, default=0)
    args = parser.parse_args()

    categories, products, seen = [], [], set()
    contents = contents_posts()
    log(f"Постов «Содержание»: {len(contents)} ({', '.join(str(pid) for pid, _ in contents)})")
    category_links = [link for _, post in contents for link in post["links"]]
    if args.limit_categories:
        category_links = category_links[:args.limit_categories]

    prefetch([category_id for _, category_id in category_links])
    for number, (category, category_id) in enumerate(category_links, 1):
        category = category.strip(" .•")[:60]
        try:
            category_post = get_post(category_id)
        except Exception as error:
            log(f"[{number}/{len(category_links)}] {category}: ошибка загрузки — {error!r}")
            continue
        queue = [(label, pid) for label, pid in category_post["links"] if pid != category_id] or [("", category_id)]
        prefetch([pid for _, pid in queue if pid not in seen])
        added = 0
        while queue:
            label, post_id = queue.pop(0)
            if post_id in seen:
                continue
            seen.add(post_id)
            try:
                post = get_post(post_id)
            except Exception as error:
                log(f"    {post_id}: ошибка загрузки — {error!r}")
                continue
            product = parse_product(post["text"], category, label) if post["text"] else None
            if post_id != category_id and is_index(post, product):
                queue.extend((sub_label, pid) for sub_label, pid in post["links"] if pid not in seen)
                continue
            if not product:
                continue
            product["id"] = post_id
            product["url"] = f"https://t.me/{CHANNEL}/{post_id}"
            products.append(product)
            added += 1
        image = ""
        try:
            image = save_category_image(category_post["photo"], category)
        except Exception as error:
            log(f"    обложка {category}: {error!r}")
        categories.append({"name": category, "image": image, "count": added, "url": f"https://t.me/{CHANNEL}/{category_id}"})
        log(f"[{number}/{len(category_links)}] {category}: {added}")

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": f"https://t.me/{CHANNEL}",
        "categories": [category for category in categories if category["count"]],
        "products": products,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"Готово: {len(products)} товаров в {sum(1 for c in categories if c['count'])} категориях → {DATA_FILE}")


if __name__ == "__main__":
    main()
