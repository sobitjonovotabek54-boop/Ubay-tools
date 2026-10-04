import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4


ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.environ.get("UBAY_UPLOADS", ROOT / "uploads"))
DATABASE = Path(os.environ.get("UBAY_DATABASE", ROOT / "ubay_catalog.db"))
# За прокси (Render и др.) реальный IP клиента приходит в X-Forwarded-For.
TRUST_PROXY = os.environ.get("UBAY_TRUST_PROXY", "1" if os.environ.get("RENDER") else "") == "1"
MAX_BODY = 7 * 1024 * 1024
MAX_IMAGE = 5 * 1024 * 1024
PASSWORD_ITERATIONS = 310_000
SESSION_SECONDS = 60 * 60 * 24 * 7
AUTH_WINDOW_SECONDS = 15 * 60
AUTH_MAX_ATTEMPTS = 10
ALLOWED_STATIC = {"index.html", "app.js", "styles.css"}
PAGE_ROUTES = {"", "catalog", "login", "register", "admin"}
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        ".webp",
        lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    ),
}


def connect_db():
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                specs TEXT NOT NULL DEFAULT '[]',
                image TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS products_owner_idx ON products(owner_id);
            CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
            """
        )
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "is_admin" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")


def make_password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def public_user(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"], "is_admin": bool(row["is_admin"])}


def check_password(password, stored_hash):
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


class AuthRateLimiter:
    def __init__(self, max_attempts, window_seconds):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.attempts = {}
        self.lock = threading.Lock()

    def is_blocked(self, key):
        now = time.monotonic()
        with self.lock:
            recent = [moment for moment in self.attempts.get(key, []) if now - moment < self.window_seconds]
            if recent:
                self.attempts[key] = recent
            else:
                self.attempts.pop(key, None)
            return len(recent) >= self.max_attempts

    def record(self, key):
        with self.lock:
            self.attempts.setdefault(key, []).append(time.monotonic())

    def reset(self, key):
        with self.lock:
            self.attempts.pop(key, None)


auth_limiter = AuthRateLimiter(AUTH_MAX_ATTEMPTS, AUTH_WINDOW_SECONDS)


def safe_image(data_url):
    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("Выберите файл изображения заново.")
    header, encoded = data_url.split(",", 1)
    match = re.fullmatch(r"data:(image/(?:jpeg|png|webp));base64", header)
    if not match:
        raise ValueError("Принимаются только изображения JPG, PNG или WebP.")
    try:
        image_data = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ValueError("Не удалось прочитать файл изображения.") from error
    if not image_data or len(image_data) > MAX_IMAGE:
        raise ValueError("Размер изображения не должен превышать 5 МБ.")
    content_type = match.group(1)
    extension, validate = IMAGE_TYPES[content_type]
    if not validate(image_data):
        raise ValueError("Выбранный файл не является изображением.")
    filename = f"{uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(image_data)
    return f"/uploads/{filename}"


def validate_product(payload):
    if not isinstance(payload, dict):
        raise ValueError("Некорректные данные товара.")
    name = str(payload.get("name", "")).strip()
    model = str(payload.get("model", "")).strip()
    category = str(payload.get("category", "")).strip()
    description = str(payload.get("description", "")).strip()
    specs = payload.get("specs", [])
    if not 2 <= len(name) <= 120:
        raise ValueError("Название товара должно содержать от 2 до 120 символов.")
    if len(model) > 80 or len(category) > 60 or len(description) > 1200:
        raise ValueError("Одно из полей превышает допустимую длину.")
    if not isinstance(specs, list) or len(specs) > 30:
        raise ValueError("Некорректный список характеристик.")
    clean_specs = []
    for item in specs:
        if not isinstance(item, dict):
            continue
        key = str(item.get("name", "")).strip()[:60]
        value = str(item.get("value", "")).strip()[:160]
        if key and value:
            clean_specs.append({"name": key, "value": value})
    return {
        "name": name,
        "model": model,
        "category": category,
        "description": description,
        "specs": clean_specs,
    }


class CatalogHandler(BaseHTTPRequestHandler):
    server_version = "UbayCatalog/1.0"

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")

    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Некорректный размер запроса.") from error
        if length < 1 or length > MAX_BODY:
            raise ValueError("Размер запроса превышает допустимый предел.")
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Запрос должен быть в формате JSON.") from error

    def origin_is_allowed(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlparse(origin)
        return parsed.netloc == self.headers.get("Host") and parsed.scheme in {"http", "https"}

    def get_user(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            token = cookie.get("ubay_session").value if cookie.get("ubay_session") else ""
        except (KeyError, TypeError):
            token = ""
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with connect_db() as db:
            row = db.execute(
                "SELECT users.id, users.name, users.email, users.is_admin FROM sessions "
                "JOIN users ON users.id = sessions.user_id "
                "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
                (token_hash, int(time.time())),
            ).fetchone()
        return public_user(row) if row else None

    def session_cookie(self, token, max_age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        return (
            f"ubay_session={token}; Path=/; HttpOnly; SameSite=Lax; "
            f"Max-Age={max_age}{secure}"
        )

    def create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        expires_at = int(time.time()) + SESSION_SECONDS
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with connect_db() as db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            db.execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (token_hash, user_id, expires_at),
            )
        return self.session_cookie(token, SESSION_SECONDS)

    def client_ip(self):
        if TRUST_PROXY:
            forwarded = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            if forwarded:
                return forwarded
        return self.client_address[0]

    def auth_blocked(self):
        if auth_limiter.is_blocked(self.client_ip()):
            self.send_json(429, {"error": "Слишком много попыток. Повторите через 15 минут."})
            return True
        return False

    def require_user(self):
        user = self.get_user()
        if not user:
            self.send_json(401, {"error": "Войдите в аккаунт, чтобы продолжить."})
            return None
        return user

    def require_admin(self):
        user = self.require_user()
        if user and not user["is_admin"]:
            self.send_json(403, {"error": "Доступ только для администраторов."})
            return None
        return user

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/session":
            self.send_json(200, {"user": self.get_user()})
            return
        if path == "/api/admin/users":
            self.admin_list_users()
            return
        if path == "/api/products":
            with connect_db() as db:
                rows = db.execute(
                    "SELECT products.id, products.name, products.model, products.category, "
                    "products.description, products.specs, products.image, products.owner_id, "
                    "products.updated_at, users.name AS owner_name FROM products "
                    "JOIN users ON users.id = products.owner_id "
                    "ORDER BY products.updated_at DESC, products.id DESC"
                ).fetchall()
            products = []
            for row in rows:
                item = dict(row)
                item["specs"] = json.loads(item["specs"])
                products.append(item)
            self.send_json(200, {"products": products})
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path.startswith("/api/") and not self.origin_is_allowed():
            self.send_json(403, {"error": "Источник запроса не разрешён."})
            return
        try:
            payload = self.read_json()
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        if path == "/api/register":
            self.register(payload)
        elif path == "/api/login":
            self.login(payload)
        elif path == "/api/logout":
            self.logout()
        elif path == "/api/products":
            self.create_product(payload)
        else:
            self.send_json(404, {"error": "Запрошенный адрес не найден."})

    def do_PUT(self):
        if not self.origin_is_allowed():
            self.send_json(403, {"error": "Источник запроса не разрешён."})
            return
        path = urlparse(self.path).path
        product_match = re.fullmatch(r"/api/products/(\d+)", path)
        user_match = re.fullmatch(r"/api/admin/users/(\d+)", path)
        if not product_match and not user_match:
            self.send_json(404, {"error": "Запрошенный адрес не найден."})
            return
        try:
            payload = self.read_json()
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        if product_match:
            self.update_product(int(product_match.group(1)), payload)
        else:
            self.admin_set_role(int(user_match.group(1)), payload)

    def do_DELETE(self):
        if not self.origin_is_allowed():
            self.send_json(403, {"error": "Источник запроса не разрешён."})
            return
        path = urlparse(self.path).path
        product_match = re.fullmatch(r"/api/products/(\d+)", path)
        user_match = re.fullmatch(r"/api/admin/users/(\d+)", path)
        if product_match:
            self.delete_product(int(product_match.group(1)))
        elif user_match:
            self.admin_delete_user(int(user_match.group(1)))
        else:
            self.send_json(404, {"error": "Запрошенный адрес не найден."})

    def admin_list_users(self):
        if not self.require_admin():
            return
        with connect_db() as db:
            rows = db.execute(
                "SELECT users.id, users.name, users.email, users.is_admin, users.created_at, "
                "COUNT(products.id) AS product_count FROM users "
                "LEFT JOIN products ON products.owner_id = users.id "
                "GROUP BY users.id ORDER BY users.is_admin DESC, users.created_at DESC"
            ).fetchall()
        users = [
            {**public_user(row), "created_at": row["created_at"], "product_count": row["product_count"]}
            for row in rows
        ]
        self.send_json(200, {"users": users})

    def admin_set_role(self, user_id, payload):
        admin = self.require_admin()
        if not admin:
            return
        is_admin = payload.get("is_admin") if isinstance(payload, dict) else None
        if not isinstance(is_admin, bool):
            self.send_json(400, {"error": "Некорректные данные роли."})
            return
        if user_id == admin["id"]:
            self.send_json(400, {"error": "Нельзя изменить собственную роль."})
            return
        with connect_db() as db:
            cursor = db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))
        if not cursor.rowcount:
            self.send_json(404, {"error": "Пользователь не найден."})
            return
        self.send_json(200, {"ok": True})

    def admin_delete_user(self, user_id):
        admin = self.require_admin()
        if not admin:
            return
        if user_id == admin["id"]:
            self.send_json(400, {"error": "Нельзя удалить собственный аккаунт."})
            return
        with connect_db() as db:
            images = [row["image"] for row in db.execute("SELECT image FROM products WHERE owner_id = ?", (user_id,))]
            cursor = db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        if not cursor.rowcount:
            self.send_json(404, {"error": "Пользователь не найден."})
            return
        for image in images:
            self.remove_upload(image)
        self.send_json(200, {"ok": True})

    def register(self, payload):
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = payload.get("password", "")
        if self.auth_blocked():
            return
        auth_limiter.record(self.client_ip())
        if not 2 <= len(name) <= 80 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            self.send_json(400, {"error": "Некорректное имя или адрес email."})
            return
        if not isinstance(password, str) or len(password) < 8 or len(password) > 200:
            self.send_json(400, {"error": "Пароль должен содержать не менее 8 символов."})
            return
        try:
            with connect_db() as db:
                cursor = db.execute(
                    "INSERT INTO users(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (name, email, make_password_hash(password), int(time.time())),
                )
                user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "Аккаунт с этим email уже существует."})
            return
        cookie = self.create_session(user_id)
        self.send_json(
            201, {"user": {"id": user_id, "name": name, "email": email, "is_admin": False}}, {"Set-Cookie": cookie}
        )

    def login(self, payload):
        email = str(payload.get("email", "")).strip().lower()
        password = payload.get("password", "")
        if self.auth_blocked():
            return
        with connect_db() as db:
            user = db.execute(
                "SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ?", (email,)
            ).fetchone()
        if not user or not isinstance(password, str) or not check_password(password, user["password_hash"]):
            auth_limiter.record(self.client_ip())
            self.send_json(401, {"error": "Неверный email или пароль."})
            return
        auth_limiter.reset(self.client_ip())
        cookie = self.create_session(user["id"])
        self.send_json(
            200,
            {"user": public_user(user)},
            {"Set-Cookie": cookie},
        )

    def logout(self):
        cookie = SimpleCookie()
        cookie.load(self.headers.get("Cookie", ""))
        token = cookie.get("ubay_session").value if cookie.get("ubay_session") else ""
        if token:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            with connect_db() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        expired = self.session_cookie("", 0)
        self.send_json(200, {"ok": True}, {"Set-Cookie": expired})

    def create_product(self, payload):
        user = self.require_user()
        if not user:
            return
        try:
            product = validate_product(payload)
            product["image"] = safe_image(payload.get("image", "")) if payload.get("image") else ""
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        now = int(time.time())
        with connect_db() as db:
            cursor = db.execute(
                "INSERT INTO products(owner_id, name, model, category, description, specs, image, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user["id"], product["name"], product["model"], product["category"],
                    product["description"], json.dumps(product["specs"], ensure_ascii=False),
                    product["image"], now, now,
                ),
            )
            product_id = cursor.lastrowid
        self.send_json(201, {"id": product_id})

    def update_product(self, product_id, payload):
        user = self.require_user()
        if not user:
            return
        try:
            product = validate_product(payload)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        with connect_db() as db:
            current = db.execute(
                "SELECT image FROM products WHERE id = ? AND (owner_id = ? OR ?)",
                (product_id, user["id"], user["is_admin"]),
            ).fetchone()
            if not current:
                self.send_json(404, {"error": "Товар не найден или не принадлежит вам."})
                return
            image = current["image"]
            if payload.get("image"):
                try:
                    image = safe_image(payload["image"])
                except ValueError as error:
                    self.send_json(400, {"error": str(error)})
                    return
            elif payload.get("remove_image"):
                image = ""
            db.execute(
                "UPDATE products SET name = ?, model = ?, category = ?, description = ?, specs = ?, image = ?, updated_at = ? "
                "WHERE id = ?",
                (
                    product["name"], product["model"], product["category"], product["description"],
                    json.dumps(product["specs"], ensure_ascii=False), image, int(time.time()),
                    product_id,
                ),
            )
        if image != current["image"]:
            self.remove_upload(current["image"])
        self.send_json(200, {"ok": True})

    def delete_product(self, product_id):
        user = self.require_user()
        if not user:
            return
        with connect_db() as db:
            row = db.execute(
                "SELECT image FROM products WHERE id = ? AND (owner_id = ? OR ?)",
                (product_id, user["id"], user["is_admin"]),
            ).fetchone()
            if not row:
                self.send_json(404, {"error": "Товар не найден или не принадлежит вам."})
                return
            db.execute("DELETE FROM products WHERE id = ?", (product_id,))
        self.remove_upload(row["image"])
        self.send_json(200, {"ok": True})

    @staticmethod
    def remove_upload(image_path):
        match = re.fullmatch(r"/uploads/([a-f0-9]{32}\.(?:jpg|png|webp))", image_path or "")
        if match:
            (UPLOAD_DIR / match.group(1)).unlink(missing_ok=True)

    def serve_static(self, path):
        relative = unquote(path).strip("/")
        status = 200
        if relative.startswith("uploads/"):
            filename = relative.removeprefix("uploads/")
            if not re.fullmatch(r"[a-f0-9]{32}\.(?:jpg|png|webp)", filename):
                self.send_error(404)
                return
            file_path = UPLOAD_DIR / filename
        elif relative in ALLOWED_STATIC:
            file_path = ROOT / relative
        elif relative in PAGE_ROUTES:
            file_path = ROOT / "index.html"
        elif not relative.startswith("api/") and "." not in relative.rsplit("/", 1)[-1]:
            file_path = ROOT / "index.html"
            status = 404
        else:
            self.send_error(404)
            return
        try:
            content = file_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or "javascript" in content_type else content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "public, max-age=86400" if relative.startswith("uploads/") else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(content)


def create_admin(email, name="Admin", password=None):
    email = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise SystemExit("Некорректный адрес email.")
    password = password or secrets.token_urlsafe(12)
    password_hash = make_password_hash(password)
    with connect_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            db.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?", (password_hash, existing["id"])
            )
            db.execute("DELETE FROM sessions WHERE user_id = ?", (existing["id"],))
        else:
            db.execute(
                "INSERT INTO users(name, email, password_hash, created_at, is_admin) VALUES (?, ?, ?, ?, 1)",
                (name, email, password_hash, int(time.time())),
            )
    return email, password


def ensure_env_admin():
    email = os.environ.get("UBAY_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("UBAY_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    if len(password) < 8:
        raise SystemExit("UBAY_ADMIN_PASSWORD должен содержать не менее 8 символов.")
    with connect_db() as db:
        user = db.execute("SELECT password_hash, is_admin FROM users WHERE email = ?", (email,)).fetchone()
    if user and user["is_admin"] and check_password(password, user["password_hash"]):
        return
    create_admin(email, os.environ.get("UBAY_ADMIN_NAME", "Admin"), password)
    print(f"Аккаунт администратора {email} настроен из переменных окружения.")


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    initialize_db()
    if len(sys.argv) >= 3 and sys.argv[1] == "create-admin":
        email, password = create_admin(sys.argv[2], " ".join(sys.argv[3:]) or "Admin")
        print(f"Аккаунт администратора готов.\nEmail: {email}\nПароль: {password}")
        return
    ensure_env_admin()
    # Хостинги (Render и др.) задают PORT и ждут подключения извне.
    host = os.environ.get("HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), CatalogHandler)
    print(f"Каталог Ubay Tools: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()