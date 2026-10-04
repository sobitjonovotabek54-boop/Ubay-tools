# Ubay Tools katalogi

Telegram materiallarisiz ishlaydigan mahsulot katalogi. Mahsulotlar, tavsiflar va rasmlar hisob egasi tomonidan kiritiladi.

## Ishga tushirish

Python 3.10 yoki undan yangisi kerak. Tashqi Python paketlari talab qilinmaydi.

```powershell
python server.py
```

Brauzerda `http://127.0.0.1:8000` manzilini oching. Boshqa kompyuterlardan mahalliy tarmoq orqali ko‘rish uchun `HOST=0.0.0.0` va kerakli `PORT` o‘zgaruvchilarini belgilang.

## Sahifalar

Sayt rus tilida. Har bir sahifaning o‘z manzili bor:

| Manzil | Sahifa |
|---|---|
| `/` | Bosh sahifa: qidiruv, statistika, kategoriyalar, yangi mahsulotlar |
| `/catalog` | Katalog: qidiruv, kategoriya filtri, saralash (`?category=` va `?q=` parametrlari bilan ham ochiladi) |
| `/login` | Kirish |
| `/register` | Ro‘yxatdan o‘tish |
| `/admin` | Admin-panel: statistika, foydalanuvchilar va mahsulotlarni boshqarish (faqat administratorlar uchun) |

## Imkoniyatlar

- Hisob yaratish, kirish va chiqish
- Mahsulot qo‘shish, ko‘rish, tahrirlash va o‘chirish
- JPG, PNG yoki WebP rasmni yuklash (5 MB gacha)
- Xususiyatlar, kategoriya va model bo‘yicha qidirish
- Mahsulotlarni kategoriya va nom bo‘yicha saralash
- SQLite bazasida hisoblar, sessiyalar va mahsulotlarni saqlash

Har bir hisob faqat o‘zi qo‘shgan mahsulotni tahrirlaydi yoki o‘chiradi. Administrator esa istalgan mahsulotni tahrirlay va o‘chira oladi. Katalogdagi mahsulotlar ommaviy ko‘rinadi.

## Administrator

Admin-panelda (`/admin`) administrator:

- barcha foydalanuvchilarni, ularning rolini va mahsulotlar sonini ko‘radi;
- boshqa foydalanuvchiga admin huquqini beradi yoki undan oladi;
- foydalanuvchini o‘chiradi (uning mahsulotlari va rasmlari ham o‘chadi);
- istalgan mahsulotni ochadi, tahrirlaydi yoki o‘chiradi.

Administrator o‘z rolini o‘zgartira olmaydi va o‘z hisobini o‘chira olmaydi, shuning uchun tizim administratorsiz qolmaydi.

Admin hisobini yaratish yoki parolini tiklash:

```powershell
python server.py create-admin admin@misol.uz Admin
```

Buyruq yangi tasodifiy parolni ekranga chiqaradi. Email allaqachon ro‘yxatdan o‘tgan bo‘lsa, shu hisob admin qilinadi, paroli yangilanadi va eski sessiyalari bekor qilinadi. Parollar bazada faqat xesh ko‘rinishida saqlanadi, shuning uchun ularni keyin o‘qib bo‘lmaydi: parolni xavfsiz joyda saqlang.

## Xavfsizlik

Bir IP manzildan kirish yoki ro‘yxatdan o‘tishga 15 daqiqa ichida 10 tadan ortiq urinish bloklanadi (muvaffaqiyatli kirish hisoblagichni nolga tushiradi).

## Deploy

Python server ishga tushira oladigan hostingga deploy qiling. Ishlab chiqarishda `HOST=0.0.0.0` belgilang, platformaning `PORT` qiymatidan foydalaning va `UBAY_DATABASE` ni doimiy diskka yo‘naltiring. Yuklangan `uploads/` papkasi hamda SQLite bazasi deploylar orasida saqlanishi kerak. HTTPS reverse proxy ortida `X-Forwarded-Proto: https` yuboring.

Ro‘yxatdan o‘tish hozir emailni tasdiqlamaydi. Ommaviy ishga tushirishdan oldin email tasdiqlash va bazaning muntazam backupini sozlash tavsiya etiladi. Reverse proxy ortida rate limit proxy IP manziliga qo‘llanadi, shuning uchun proxy darajasida ham cheklov qo‘ying.