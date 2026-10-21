"""Скрипт упорядочивания каталога Ubay Tools по 10 разделам клиента.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "docs" / "data" / "products.json"
BACKUP_FILE = ROOT / "docs" / "data" / "products.json.bak"

CATALOG_SECTIONS = [
    {
        "id": 1,
        "title": "Электроинструменты",
        "items": [
            "Шуруповерты", "Болгарки", "Дрели", "Перфораторы", "Гайковерты",
            "Аккумуляторы", "Зарядные устройства", "Наборы инструментов",
            "Молотки", "Граверы (бормашины)", "Фрезеры", "Рубанки",
            "Полировочные аппараты", "Шлифовальные машины", "Строительные фены",
        ],
    },
    {
        "id": 2,
        "title": "Сварочное оборудование",
        "items": [
            "Сварочные аппараты", "Сварочные маски", "Запчасти для сварочных аппаратов",
            "Сопла", "Аппараты для сварки пластиковых труб", "Аппараты для сварки пластика",
        ],
    },
    {
        "id": 3,
        "title": "Режущий и обрабатывающий инструмент",
        "items": [
            "Циркулярные пилы", "Лобзики", "Торцовочные пилы", "Торцовочные пилы по металлу",
            "Пилы", "Ленточные станки", "Сверлильные станки", "Распиловочные станки",
            "Станки алмазного бурения (бурмашины)", "Алмазные коронки", "Плиткорезы",
            "Режущие ролики для плиткорезов", "Штроборезы", "Точильно-шлифовальные станки",
            "Машины для обработки железа и бетона", "Диски", "Шлифовальные круги",
            "Цепи для пил", "Угольные щётки",
        ],
    },
    {
        "id": 4,
        "title": "Строительное оборудование",
        "items": [
            "Вибраторы для бетона", "Гибкие валы (шланги для вибраторов)", "Вибротрамбовки",
            "Отбойные молотки", "Миксеры", "Монтажные пистолеты",
            "Присоски и вибраторы для кафеля", "Домкраты", "Электрические штабелеры (кары)",
            "Электрические тали",
        ],
    },
    {
        "id": 5,
        "title": "Компрессоры, пневматика и оборудование для покраски",
        "items": [
            "Компрессоры", "Компрессорные насосы", "Воздушные шланги",
            "Шланги для безвоздушной покраски", "Катушки для шлангов",
            "Краскопульты (Wagner)", "Распылители (пистолеты)", "Нагнетатели смазки",
            "Смазочные пистолеты", "Насосы для смазки", "Заклёпочники", "Степлеры",
            "Мешкозашивочные машины", "Упаковочные машины",
        ],
    },
    {
        "id": 6,
        "title": "Насосы и энергетическое оборудование",
        "items": [
            "Генераторы", "Мотопомпы", "Центробежные насосы", "Циркуляционные насосы",
            "Погружные (глубинные) насосы", "Самовсасывающие насосы", "Качалковые насосы",
            "Масляные насосы", "Автоматические вакуумные насосы", "Вихревые вакуумные насосы",
            "Стабилизаторы", "Расширительные баки", "Регуляторы насосов", "Дробилки",
            "Моторы (двигатели)",
        ],
    },
    {
        "id": 7,
        "title": "Садовая и сельскохозяйственная техника",
        "items": [
            "Газонокосилки", "Кусторезы", "Мотоблоки (культиваторы)", "Мотобуры",
            "Опрыскиватели", "Секаторы", "Машинки для стрижки баранов и лошадей",
            "Воздуходувки",
        ],
    },
    {
        "id": 8,
        "title": "Клининговое и тепловое оборудование",
        "items": [
            "Мойки высокого давления (Kärcher)", "Промышленные пылесосы",
            "Поломоечные машины", "Тепловые пушки", "Прожекторы",
        ],
    },
    {
        "id": 9,
        "title": "Измерительные приборы и ручной инструмент",
        "items": [
            "Лазерные и оптические уровни", "Лазерные дальномеры", "Детекторы",
            "Рулетки", "Ножовки по металлу", "Плоскогубцы", "Наборы ключей",
            "Наборы свёрл", "Наборы бит", "Насадки", "Перчатки",
            "Сумки для инструментов", "Витрины",
        ],
    },
    {
        "id": 10,
        "title": "Специальное оборудование и прочие товары",
        "items": [
            "Паяльники", "Пожарные шланги",
        ],
    },
]

OLD_TO_NEW = {
    "Зарядное устройство": "Зарядные устройства",
    "Гравер (Бормашины)": "Граверы (бормашины)",
    "Сварочная маска": "Сварочные маски",
    "Сопло": "Сопла",
    "Торцовочная пила по металлу": "Торцовочные пилы по металлу",
    "Режущий ролик для плиткореза": "Режущие ролики для плиткорезов",
    "Цепь для пилы": "Цепи для пил",
    "Гибкие Валы (вибратор шланг)": "Гибкие валы (шланги для вибраторов)",
    "Присоска и Вибратор для кафеля": "Присоски и вибраторы для кафеля",
    "Домкрат": "Домкраты",
    "Электрический штабелер (КАРА)": "Электрические штабелеры (кары)",
    "Электрическая таль": "Электрические тали",
    "Компрессор насосы": "Компрессорные насосы",
    "Безвоздушный шланг": "Шланги для безвоздушной покраски",
    "Катушка для шланга": "Катушки для шлангов",
    "Краскопульты (Вагнеры)": "Краскопульты (Wagner)",
    "Распылитель (пистолет)": "Распылители (пистолеты)",
    "Нагнетатель смазки": "Нагнетатели смазки",
    "Заклепочник": "Заклёпочники",
    "Cteплеры": "Степлеры",
    "Cтеплеры": "Степлеры",
    "Степлеры": "Степлеры",
    "упаковочная машина": "Упаковочные машины",
    "Насосы самовсасывающие": "Самовсасывающие насосы",
    "Качалка насосы": "Качалковые насосы",
    "Автоматически вакуумные насосы": "Автоматические вакуумные насосы",
    "Регулятор насоса": "Регуляторы насосов",
    "Дробилка": "Дробилки",
    "Мотобур": "Мотобуры",
    "Опрыскиватель": "Опрыскиватели",
    "Мойки высокого давления ( Карчеры )": "Мойки высокого давления (Kärcher)",
    "Поломоечная машина": "Поломоечные машины",
    "Детектор": "Детекторы",
    "Ножовка по металлу": "Ножовки по металлу",
    "Набор ключей": "Наборы ключей",
    "Набор свёрл": "Наборы свёрл",
    "Набор бит": "Наборы бит",
    "Сумка для инструментов": "Сумки для инструментов",
    "Станки алмазного бурения (Бур машины)": "Станки алмазного бурения (бурмашины)",
    "Мотоблоки (Культиваторы)": "Мотоблоки (культиваторы)",
    "Лазерные и Оптические уровни": "Лазерные и оптические уровни",
}

MISSING_IMAGES = {
    "Детекторы": "img/categories/" + hashlib.sha1("Детекторы".encode("utf-8")).hexdigest()[:12] + ".jpg",
    "Заклёпочники": "img/categories/" + hashlib.sha1("Заклёпочники".encode("utf-8")).hexdigest()[:12] + ".jpg",
    "Поломоечные машины": "img/categories/" + hashlib.sha1("Поломоечные машины".encode("utf-8")).hexdigest()[:12] + ".jpg",
    "Режущие ролики для плиткорезов": "img/categories/" + hashlib.sha1("Режущие ролики для плиткорезов".encode("utf-8")).hexdigest()[:12] + ".jpg",
    "Сумки для инструментов": "img/categories/" + hashlib.sha1("Сумки для инструментов".encode("utf-8")).hexdigest()[:12] + ".jpg",
    "Упаковочные машины": "img/categories/" + hashlib.sha1("Упаковочные машины".encode("utf-8")).hexdigest()[:12] + ".jpg",
}


def main():
    if not BACKUP_FILE.exists():
        shutil.copyfile(DATA_FILE, BACKUP_FILE)
        print(f"Created backup: {BACKUP_FILE}")

    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    cat_to_section = {}
    for sec in CATALOG_SECTIONS:
        for idx, item in enumerate(sec["items"], 1):
            cat_to_section[item] = (sec["id"], sec["title"], idx)

    orig_cat_meta = {}
    for c in data["categories"]:
        std_name = OLD_TO_NEW.get(c["name"], c["name"])
        orig_cat_meta[std_name] = c

    # Category images map
    cat_image_map = {}
    for item in cat_to_section:
        orig = orig_cat_meta.get(item, {})
        img = orig.get("image", "")
        if not img and item in MISSING_IMAGES:
            img = MISSING_IMAGES[item]
        if img:
            cat_image_map[item] = img

    updated_products = []
    category_product_counts = {}
    for p in data["products"]:
        orig_cat = p.get("category", "")
        new_cat = OLD_TO_NEW.get(orig_cat, orig_cat)
        p["category"] = new_cat
        if new_cat in cat_to_section:
            sec_id, sec_title, order = cat_to_section[new_cat]
            p["section_id"] = sec_id
            p["section_title"] = sec_title
        # Attach image to product if not present
        if not p.get("image") and new_cat in cat_image_map:
            p["image"] = cat_image_map[new_cat]
        category_product_counts[new_cat] = category_product_counts.get(new_cat, 0) + 1
        updated_products.append(p)

    ordered_categories = []
    for sec in CATALOG_SECTIONS:
        for order, item in enumerate(sec["items"], 1):
            if item in category_product_counts:
                orig = orig_cat_meta.get(item, {})
                img = orig.get("image", "")
                if not img and item in MISSING_IMAGES:
                    img = MISSING_IMAGES[item]
                ordered_categories.append({
                    "name": item,
                    "section_id": sec["id"],
                    "section_title": sec["title"],
                    "order": order,
                    "image": img,
                    "count": category_product_counts[item],
                    "url": orig.get("url", ""),
                })

    sections_summary = []
    for sec in CATALOG_SECTIONS:
        sec_cats = [c for c in ordered_categories if c["section_id"] == sec["id"]]
        total_prods = sum(c["count"] for c in sec_cats)
        sections_summary.append({
            "id": sec["id"],
            "title": sec["title"],
            "category_count": len(sec_cats),
            "product_count": total_prods,
            "categories": [c["name"] for c in sec_cats],
        })

    data["sections"] = sections_summary
    data["categories"] = ordered_categories
    data["products"] = updated_products

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print("Success! Updated data:")
    print(f"Total sections: {len(data['sections'])}")
    print(f"Total categories: {len(data['categories'])}")
    print(f"Total products: {len(data['products'])}")
    for s in data["sections"]:
        print(f"  [{s['id']}] {s['title']} -> {s['category_count']} categories, {s['product_count']} products")


if __name__ == "__main__":
    main()

