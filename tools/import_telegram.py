"""Импорт товаров из Telegram-канала Ubay Informatsiya в каталог.

Использование:
    python tools/import_telegram.py login               # один раз: вход в Telegram
    python tools/import_telegram.py import [--limit N] [--dry-run]

Структура канала: посты «Содержание» ссылаются на посты категорий,
посты категорий — на посты товаров. Пост товара — текст (название, артикул,
характеристики) и альбом с фотографиями-файлами.
"""
import argparse
import asyncio
import io
import json
import re
import secrets
import sys
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402

CHANNEL = "Ubay_informatsiya"
TOOLS_DIR = Path(__file__).resolve().parent
CONFIG_FILE = TOOLS_DIR / "telegram_config.json"
SESSION_FILE = TOOLS_DIR / "telegram"
OWNER_EMAIL = "catalog@ubaytools.uz"
OWNER_NAME = "Ubay Tools"
POST_LINK = re.compile(rf"t\.me/{CHANNEL}/(\d+)", re.I)
ARTICLE_LINE = re.compile(r"^(?:артикул|арт|art)\b\.?\s*[:.№#]?\s*(.+)$", re.I)
MODEL_IN_NAME = re.compile(r"\b([A-Z]{1,8}-[A-Za-z0-9][A-Za-z0-9.\-/]*)")
SECTION_HEADERS = {"технические характеристики", "характеристики", "комплектация", "описание"}
IMAGE_MAX_SIDE = 1600


def log(message):
    print(message, flush=True)


def load_config():
    if not CONFIG_FILE.exists():
        raise SystemExit("Сначала выполните: python tools/import_telegram.py login")
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def make_client(config):
    from telethon import TelegramClient

    return TelegramClient(str(SESSION_FILE), int(config["api_id"]), config["api_hash"])


async def login():
    api_id = input("api_id (my.telegram.org): ").strip()
    api_hash = input("api_hash (my.telegram.org): ").strip()
    if not api_id.isdigit() or not api_hash:
        raise SystemExit("Некорректные api_id или api_hash.")
    config = {"api_id": int(api_id), "api_hash": api_hash}
    client = make_client(config)
    await client.start()
    me = await client.get_me()
    await client.disconnect()
    CONFIG_FILE.write_text(json.dumps(config), encoding="utf-8")
    log(f"Готово: вход выполнен как {me.first_name}. Теперь можно запускать импорт.")


# ---------- Разбор текста поста ----------

def clean_line(line):
    return re.sub(r"\s+", " ", line.strip().lstrip("*•-–—·▪️✅🔹🔸 ").strip())


def parse_product(text, category, link_label):
    lines = [clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return None
    name = lines[0][:120]
    specs, description, section = [], [], ""
    article = ""
    for line in lines[1:]:
        lowered = line.lower().rstrip(":")
        if lowered in SECTION_HEADERS:
            section = lowered
            continue
        article_match = ARTICLE_LINE.match(line)
        if article_match and not article:
            article = article_match.group(1).strip()[:160]
            continue
        separator = ":" if ":" in line else " - " if " - " in line else ""
        if section != "комплектация" and separator:
            key, value = (part.strip() for part in line.split(separator, 1))
            if key and value and len(key) <= 60:
                specs.append({"name": key, "value": value[:160]})
                continue
        description.append(f"• {line}" if section == "комплектация" else line)
    if article:
        specs.insert(0, {"name": "Артикул", "value": article})
    model = next((spec["value"] for spec in specs if spec["name"].lower().startswith("модель")), "")
    if not model:
        found = MODEL_IN_NAME.search(name)
        model = found.group(1) if found else (link_label if any(c.isdigit() for c in link_label) else "")
    has_kit = any(line.startswith("• ") for line in description)
    if has_kit:
        first_kit = next(i for i, line in enumerate(description) if line.startswith("• "))
        description.insert(first_kit, "Комплектация:")
    return {
        "name": name if len(name) >= 2 else f"{name} {model}".strip(),
        "model": model[:80],
        "category": category[:60],
        "description": "\n".join(description)[:1200],
        "specs": specs[:30],
    }


# ---------- Работа с Telegram ----------

def links_of(message):
    from telethon.tl.types import MessageEntityTextUrl, MessageEntityUrl

    result = []
    for entity, text in message.get_entities_text() if message.entities else []:
        url = entity.url if isinstance(entity, MessageEntityTextUrl) else text if isinstance(entity, MessageEntityUrl) else ""
        match = POST_LINK.search(url or "")
        if match:
            result.append((clean_line(text), int(match.group(1))))
    return result


async def get_message(client, channel, message_id, cache):
    if message_id not in cache:
        cache[message_id] = await client.get_messages(channel, ids=message_id)
    return cache[message_id]


async def collect_products(client, channel):
    """Возвращает список (post_id, категория, подпись ссылки) по постам «Содержание»."""
    cache, seen, products = {}, set(), []
    contents = []
    async for message in client.iter_messages(channel, search="Содержание"):
        if message.message and "Содержание" in message.message and links_of(message):
            contents.append(message)
    contents.sort(key=lambda message: message.id)
    log(f"Постов «Содержание»: {len(contents)}")
    for contents_message in contents:
        for category, category_id in links_of(contents_message):
            category_message = await get_message(client, channel, category_id, cache)
            if not category_message:
                continue
            product_links = [(label, pid) for label, pid in links_of(category_message) if pid != category_id]
            if not product_links:
                product_links = [("", category_id)]
            for label, product_id in product_links:
                if product_id not in seen:
                    seen.add(product_id)
                    products.append((product_id, category, label))
            log(f"  {category}: {len(product_links)}")
    return products, cache


def is_image(message):
    if message.photo:
        return True
    document = message.document
    return bool(document and (document.mime_type or "").startswith("image/"))


async def album_of(client, channel, message):
    if not message.grouped_id:
        return [message]
    nearby = await client.get_messages(channel, ids=list(range(max(1, message.id - 15), message.id + 60)))
    return sorted((item for item in nearby if item and item.grouped_id == message.grouped_id), key=lambda item: item.id)


def save_image(data):
    from PIL import Image, ImageOps

    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE))
    output = io.BytesIO()
    image.save(output, "JPEG", quality=85, optimize=True, progressive=True)
    filename = f"{uuid4().hex}.jpg"
    server.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (server.UPLOAD_DIR / filename).write_bytes(output.getvalue())
    return f"/uploads/{filename}"


# ---------- База данных ----------

def prepare_db():
    server.initialize_db()
    with server.connect_db() as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS telegram_imports ("
            "post_id INTEGER PRIMARY KEY, product_id INTEGER, imported_at INTEGER NOT NULL)"
        )
        owner = db.execute("SELECT id FROM users WHERE email = ?", (OWNER_EMAIL,)).fetchone()
        if owner:
            return owner["id"]
        cursor = db.execute(
            "INSERT INTO users(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (OWNER_NAME, OWNER_EMAIL, server.make_password_hash(secrets.token_urlsafe(32)), int(time.time())),
        )
        return cursor.lastrowid


def already_imported():
    with server.connect_db() as db:
        return {row["post_id"] for row in db.execute("SELECT post_id FROM telegram_imports")}


def insert_product(owner_id, post_id, product, image):
    now = int(time.time())
    with server.connect_db() as db:
        cursor = db.execute(
            "INSERT INTO products(owner_id, name, model, category, description, specs, image, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (owner_id, product["name"], product["model"], product["category"], product["description"],
             json.dumps(product["specs"], ensure_ascii=False), image, now, now),
        )
        db.execute(
            "INSERT INTO telegram_imports(post_id, product_id, imported_at) VALUES (?, ?, ?)",
            (post_id, cursor.lastrowid, now),
        )


async def run_import(limit, dry_run):
    config = load_config()
    client = make_client(config)
    await client.connect()
    if not await client.is_user_authorized():
        raise SystemExit("Сессия не авторизована. Выполните: python tools/import_telegram.py login")
    channel = await client.get_entity(CHANNEL)
    owner_id = None if dry_run else prepare_db()
    done = set() if dry_run else already_imported()
    products, cache = await collect_products(client, channel)
    queue = [item for item in products if item[0] not in done]
    if limit:
        queue = queue[:limit]
    log(f"Найдено товаров: {len(products)}, уже импортировано: {len(done)}, к обработке: {len(queue)}")
    added = skipped = failed = 0
    for index, (post_id, category, label) in enumerate(queue, 1):
        try:
            message = await get_message(client, channel, post_id, cache)
            album = await album_of(client, channel, message) if message else []
            text = next((item.message for item in [message, *album] if item and item.message), "")
            product = parse_product(text, category, label) if text else None
            if not product:
                skipped += 1
                log(f"[{index}/{len(queue)}] {post_id}: пропущен (нет текста)")
                continue
            image_message = next((item for item in album if is_image(item)), None)
            if dry_run:
                log(f"[{index}/{len(queue)}] {post_id} | {product['category']} | {product['name']} | "
                    f"модель={product['model']} | характеристик={len(product['specs'])} | фото={'да' if image_message else 'нет'}")
                continue
            image = ""
            if image_message:
                data = await client.download_media(image_message, file=bytes)
                image = save_image(data) if data else ""
            insert_product(owner_id, post_id, product, image)
            added += 1
            log(f"[{index}/{len(queue)}] + {product['name']}{'' if image else ' (без фото)'}")
        except Exception as error:  # один сбойный пост не должен останавливать импорт
            failed += 1
            log(f"[{index}/{len(queue)}] {post_id}: ошибка — {error!r}")
    await client.disconnect()
    log(f"Итог: добавлено {added}, пропущено {skipped}, ошибок {failed}.")


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["login", "import"])
    parser.add_argument("--limit", type=int, default=0, help="обработать не больше N товаров")
    parser.add_argument("--dry-run", action="store_true", help="только показать, что будет добавлено")
    args = parser.parse_args()
    asyncio.run(login() if args.command == "login" else run_import(args.limit, args.dry_run))


if __name__ == "__main__":
    main()
