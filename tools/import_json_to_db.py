"""Импорт товаров из docs/data/products.json в SQLite базу ubay_catalog.db.
"""
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "docs" / "data" / "products.json"
DB_FILE = ROOT / "ubay_catalog.db"


def main():
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    # Ensure admin/owner user exists
    cur.execute("SELECT id FROM users WHERE email = 'catalog@ubaytools.uz'")
    row = cur.fetchone()
    now = int(time.time())
    if row:
        owner_id = row[0]
    else:
        # Check any user
        cur.execute("SELECT id FROM users LIMIT 1")
        row = cur.fetchone()
        if row:
            owner_id = row[0]
        else:
            cur.execute(
                "INSERT INTO users (name, email, password_hash, is_admin, created_at) "
                "VALUES ('Ubay Tools', 'catalog@ubaytools.uz', 'dummy', 1, ?)",
                (now,),
            )
            owner_id = cur.lastrowid

    # Clear existing sample products to avoid duplicates
    cur.execute("DELETE FROM products")

    inserted = 0
    for p in data["products"]:
        cur.execute(
            "INSERT INTO products (owner_id, name, model, category, description, specs, image, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                owner_id,
                p["name"],
                p.get("model", ""),
                p.get("category", ""),
                p.get("description", ""),
                json.dumps(p.get("specs", []), ensure_ascii=False),
                p.get("image", ""),
                now,
                now,
            ),
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"Successfully imported {inserted} products into {DB_FILE}!")


if __name__ == "__main__":
    main()

