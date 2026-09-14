# سامانه‌ی رورشاخ

پلتفرم وب اجرای آزمون روان‌شناختی **رورشاخ** به روش **R-PAS**، با سه نقش
مراجع، روان‌شناس و مدیر.

مراجع آزمون را به‌صورت آنلاین اجرا می‌کند؛ سامانه داده‌ی خام و اندازه‌گیری‌های اجرایی
را با زمان سرور ثبت می‌کند؛ روان‌شناس پاسخ‌ها را کدگذاری می‌کند و متغیرهای سطح
پروتکل به‌صورت خودکار محاسبه می‌شوند.

> ‏**این سامانه ادعای تشخیص روان‌شناختی ندارد.** خروجی تحلیل، متغیرهای خام و
> یافته‌های غیرقطعی با ذکر مبنا و سطح اطمینان است؛ قضاوت بالینی بر عهده‌ی روان‌شناس
> است.

---

## اجرای سریع

```bash
docker compose up -d --build
cd Rorschach && npm ci && npm start
```

| سرویس | نشانی |
|---|---|
| اپلیکیشن | <http://localhost:4200> |
| API | <http://localhost:8000/api/v1/> |
| مستندات تعاملی API | <http://localhost:8000/api/docs/> |
| سلامت سرویس | <http://localhost:8000/health/> |

حساب‌های آزمایشی با رمز `Test1234` به‌طور خودکار ساخته می‌شوند:
`patient@test.com` · `psych@test.com` · `pending@test.com` · `admin@test.com`
(فهرست کامل در [راهنمای توسعه](documentation/06-development-guide.md#۸-دادهی-نمونه-و-حسابهای-آزمایشی)).

اجرا بدون Docker: [documentation/06-development-guide.md](documentation/06-development-guide.md).

---

## پشته

| لایه | فناوری |
|---|---|
| Frontend | Angular 20 (Standalone · Signals) · Tailwind CSS 4 · daisyUI 5 |
| Backend | Django 6 · Django REST Framework 3.18 · ASGI (Daphne) |
| دیتابیس | PostgreSQL 17 با ستون‌های JSON |
| Cache / صف / بلادرنگ | Redis 7 · Celery · Django Channels |
| احراز هویت | JWT — توکن دسترسی در حافظه، توکن تمدید در کوکی `HttpOnly` با چرخش |
| بسته‌بندی | Docker · docker compose |

---

## ساختار مخزن

```
.
├── backend/           Django + DRF — ۱۰ اپ دامنه‌ای، ۲۰ جدول، ۴۹ مسیر API
├── Rorschach/         Angular 20 — ۹ feature، ۳۰ صفحه
├── documentation/     مستند مهندسی پروژه (فارسی)
├── docs/              خروجی ساخت فرانت‌اند برای GitHub Pages (کد منبع نیست)
└── docker-compose.yml
```

---

## مستندات

مستند کامل مهندسی در پوشه‌ی [`documentation/`](documentation/README.md) است و با کد
پیاده‌شده تطبیق داده شده است.

| # | سند | موضوع |
|---|---|---|
| ۰۰ | [نمای کلی](documentation/00-overview.md) | صورت مسئله، تصمیم‌های کلان، وضعیت پروژه |
| ۰۱ | [نیازمندی‌ها](documentation/01-requirements.md) | Actorها، قواعد کسب‌وکار، FR و NFR |
| ۰۲ | [معماری](documentation/02-architecture.md) | معماری سیستم، لایه‌بندی، امنیت |
| ۰۳ | [مدل داده](documentation/03-data-model-er.md) | ERD و schema کامل هر ۲۰ جدول |
| ۰۴ | [مرجع API](documentation/04-api-design.md) | هر ۴۹ مسیر با دسترسی و بدنه |
| ۰۵ | [دیاگرام‌های رفتاری](documentation/05-sequence-diagrams.md) | توالی‌ها و ماشین‌های حالت |
| ۰۶ | [راهنمای توسعه](documentation/06-development-guide.md) | ساختار کد، دستورها، قراردادها |
| ۰۷ | [استقرار و عملیات](documentation/07-deployment-operations.md) | Docker، پیکربندی، لاگ |
| ۰۸ | [Frontend](documentation/08-frontend.md) | معماری Angular، مسیرها، رابط کاربری |
| ۰۹ | [مبانی رورشاخ](documentation/09-rorschach-analysis.md) | دانش دامنه و سیستم‌های کدگذاری |
| ۱۰ | [موتور R-PAS](documentation/10-assessment-rpas.md) | قواعد اجرا، متغیرها، تفسیر |
| ۱۱ | [یادداشت‌های Backend](documentation/11-backend-notes.md) | انحراف‌ها و شکاف‌های شناخته‌شده |
| ۱۲ | [تست و کیفیت](documentation/12-testing-and-quality.md) | ۱۲۹ تست و راهبرد آن‌ها |
| ۱۳ | [ماتریس ردیابی](documentation/13-traceability.md) | نیازمندی ← کد ← تست |

---

## بررسی صحت

```bash
cd backend && python -m pytest && python -m ruff check .
cd Rorschach && npx ng test --watch=false --browsers=ChromeHeadless
```

| بررسی | نتیجه |
|---|---|
| تست Backend | ۱۲۹ تست — سبز |
| تست Frontend | ۱۲ تست — سبز |
| لینت Backend | `ruff` بدون خطا |

---

## وضعیت

پیاده‌شده: هویت و نقش‌ها، تأیید روان‌شناس، رابطه‌ی مراجع ↔ روان‌شناس، موتور کامل
اجرای R-PAS (دو مرحله، قاعده‌ی یادآوری، ادامه پس از قطعی، تکمیل اتمیک)، کدگذاری و
محاسبه‌ی متغیرها، چت بلادرنگ، پنل مدیریت و ممیزی.

باقی‌مانده: NGINX و TLS، CI، مانیتورینگ و پشتیبان‌گیری، تولیدکننده‌ی گزارش نهایی، و
یک شکاف مجوزی شناخته‌شده (D-13) — فهرست کامل در
[یادداشت‌های Backend §۸](documentation/11-backend-notes.md).
