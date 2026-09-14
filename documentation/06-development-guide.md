---
title: راهنمای توسعه
doc_id: DOC-06
version: 2
status: as-built
architecture_version: Architecture v2 — as-built
code_revision: 10c22fe
language: fa
updated: 1405-06-23
tags:
  - development
  - project-structure
  - conventions
  - tooling
related:
  - "[[02-architecture]]"
  - "[[04-api-design]]"
  - "[[07-deployment-operations]]"
  - "[[12-testing-and-quality]]"
---

# ۰۶ — راهنمای توسعه

## ۱. پیش‌نیازها

| ابزار | نسخه | برای چه |
|---|---|---|
| Python | ۳٫۱۳ یا بالاتر | Backend |
| Node.js | ۲۰ یا بالاتر | Frontend |
| Docker + Compose | نسخه‌ی جدید | راه‌اندازی کامل پشته |
| PostgreSQL | ۱۷ | فقط اگر بدون Docker اجرا می‌کنید |
| Redis | ۷ | چت بلادرنگ و Celery |

## ۲. راه‌اندازی سریع

### با Docker — روش پیشنهادی

```bash
docker compose up -d --build     # از ریشه‌ی مخزن
cd Rorschach && npm ci && npm start
```

- Backend روی <http://localhost:8000> · سلامت: `/health/` · مستندات: `/api/docs/`
- Frontend روی <http://localhost:4200> — `/api` و `/ws` را به `:8000` پروکسی می‌کند

کانتینر خودش منتظر دیتابیس می‌ماند، مهاجرت‌ها را اجرا می‌کند، ساختار آزمون رورشاخ
را می‌سازد و (با `SEED_DEMO=true` که پیش‌فرض است) حساب‌های آزمایشی را ایجاد می‌کند.
هر سه گام idempotent‌اند، پس restart بی‌خطر است.

> سرور توسعه‌ی Angular عمداً بیرون از Docker می‌ماند: پایش فایل‌ها از روی bind mount
> در ویندوز کند است و `npm start` از قبل پروکسی می‌کند.

### بدون Docker

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # لینوکس و مک: source .venv/bin/activate
pip install -r requirements/development.txt
cp .env.example .env

python manage.py migrate
python manage.py seed_catalog     # ساختار آزمون — در هر محیطی لازم است
python manage.py seed_demo        # حساب‌های آزمایشی — فقط با DEBUG=True
python manage.py runserver 8000
```

برای چت بلادرنگ به Redis نیاز دارید؛ بدون آن، تنظیمات توسعه به‌طور خودکار روی
cache و لایه‌ی کانال درون‌حافظه‌ای می‌افتد و بقیه‌ی سامانه کار می‌کند.

## ۳. ساختار Backend

```
backend/
├── config/
│   ├── settings/{base,development,production,testing}.py
│   ├── urls.py · asgi.py · wsgi.py · celery.py
├── apps/
│   ├── accounts/        models · serializers · services · views · urls · constants
│   ├── profiles/        models · serializers · selectors · views · urls
│   ├── relationships/   models · serializers · services · views · urls
│   ├── catalog/         models · selectors · urls · management/commands/seed_catalog
│   ├── assessments/     models · state · services · selectors · serializers
│   │                    permissions · views · urls · tasks · rpas/{codes,scoring}
│   ├── messaging/       models · selectors · serializers · views · urls
│   │                    consumers · routing · realtime
│   ├── notifications/   models · views · urls
│   ├── media/           models
│   ├── audit/           models · services · middleware
│   └── administration/  serializers · views · urls · management/commands/seed_demo
├── common/              exceptions · pagination · permissions · throttling · models · health
├── requirements/        base.txt · development.txt · production.txt
├── conftest.py · pyproject.toml · manage.py
└── Dockerfile · docker-entrypoint.sh · .env.example
```

هر اپ فقط فایل‌هایی را دارد که واقعاً لازم دارد؛ فایل خالی ساخته نشده است. مثلاً
`apps/media` فقط مدل دارد چون اندپوینت اختصاصی ندارد و `apps/administration` مدل
ندارد چون روی مدل‌های اپ‌های دیگر کار می‌کند.

### قاعده‌ی لایه‌بندی

```mermaid
flowchart LR
    V["View"] --> S["Serializer"] --> SV["Service"] --> M["Model"]
    V -.->|"خواندنِ ساده"| SE["Selector"] --> M
```

| لایه | مسئول | حق ندارد |
|---|---|---|
| View | احراز هویت، مجوز، کد وضعیت HTTP | منطق کسب‌وکار داشته باشد |
| Serializer | اعتبارسنجی و شکل داده | تراکنش باز کند |
| Service | منطق کسب‌وکار، تراکنش، گذار حالت | به `request` دسترسی داشته باشد |
| Selector | کوئری خواندنی بهینه | چیزی بنویسد |
| Model | داده و قیدها | منطق چندموجودیتی داشته باشد |

## ۴. ساختار Frontend

```
Rorschach/src/app/
├── app.config.ts · app.routes.ts · app.ts
├── core/
│   ├── auth/            AuthService · TokenStore · مدل‌ها
│   ├── guards/          authGuard · guestGuard · roleGuard · approvedPsychologistGuard
│   ├── interceptors/    auth (توکن و تمدید) · error (پیام خطا)
│   ├── api/             Profile · Psychologists · Relationships · Assessments
│   │                    Communication · Admin
│   ├── models/          قراردادهای داده (snake_case، آینه‌ی serializerها)
│   ├── rpas/            فهرست کدهای R-PAS (دوقلوی TypeScript کد پایتون)
│   ├── mock/            mock-db · handlers/* · mock-backend.interceptor
│   └── services/        Toast · Realtime · TitleStrategy
├── shared/              ui/* · components/pagination · pipes/* · utils/* · pages/not-found
├── layouts/             public-layout · dashboard-layout · focus-layout
└── features/
    ├── landing/ auth/ profile/ chat/
    ├── patient/         dashboard · psychologists · psychologist-detail · assessments
    ├── psychologist/    dashboard · requests · patients · patient-detail · session-review
    ├── assessment/      assessment-runner + intro/response/clarification/finish
    └── admin/           dashboard · users · psychologist-verification · relationships
                         tests · test-version · assessments · audit-logs
```

قاعده‌ی سخت: **هیچ کامپوننتی مستقیماً `HttpClient` یا Mock را صدا نمی‌زند** — همه‌چیز
از `core/api/*` عبور می‌کند. جزئیات بیشتر در [[08-frontend]].

## ۵. قواعد پیاده‌سازی

| # | قاعده | کجا رعایت شده |
|---|---|---|
| ۱ | گام جاری آزمون را سرور تعیین می‌کند، نه کلاینت | `assessments/state.py` |
| ۲ | ثبت پاسخ idempotent باشد (کلید کلاینت + قید دیتابیس) | `services.submit_response` |
| ۳ | پاسخ ثبت‌شده بازنویسی نشود | ستون‌های جدا برای روشن‌سازی و کدگذاری |
| ۴ | تکمیل اتمیک، و رویدادها پس از commit | `services.complete` + `tasks.enqueue_analysis` |
| ۵ | آزمون و چت/اطلاع‌رسانی در یک تراکنش نباشند | صف بیرون از بلاک `atomic` |
| ۶ | مجوز سطح شیء همیشه بررسی شود | `assessments/permissions.py` |
| ۷ | یکپارچگی در سطح دیتابیس اعمال شود | ۷ قید یکتایی + `PROTECT` |
| ۸ | JSON فقط برای داده‌ی پویا؛ ایندکس JSON پس از دیدن الگوی کوئری | ۶ ستون JSON، صفر ایندکس JSON |
| ۹ | تلاش مجدد شبکه با فاصله‌ی پلکانی، نه حلقه‌ی تنگ | `assessment-run.store.ts::netRetry` |
| ۱۰ | سرور مرجع نهایی زمان است | `server_started_at` / `server_submitted_at` |
| ۱۱ | اسرار داخل مخزن نباشند | `.env` در `.gitignore` · فقط `.env.example` |
| ۱۲ | پارامترهای رورشاخ بدون منبع hard-code نشوند | جداول دارای حق نشر جاسازی نشده‌اند |
| ۱۳ | منطق کسب‌وکار در view نباشد | viewها فقط اعتبارسنجی و واگذاری می‌کنند |
| ۱۴ | سرویس‌ها `request` نگیرند | زمینه‌ی HTTP با `ContextVar` در میان‌افزار ممیزی |

## ۶. قراردادهای کدنویسی

| موضوع | قاعده |
|---|---|
| زبان توضیحات کد | **انگلیسی** — توضیح باید بگوید «چرا»، نه «چه» |
| زبان رشته‌های کاربری | **فارسی** — هر پیام خطا مستقیماً قابل نمایش است |
| نام فیلدهای API | `snake_case` در هر دو سمت؛ هیچ آداپتور تبدیل نامی وجود ندارد |
| طول سطر | ۱۱۰ کاراکتر (پیکربندی `ruff`) |
| هدف پایتون | `py313` — از نحو مدرن مثل `X | None` استفاده می‌شود |
| ترتیب import | `ruff` با `known-first-party = ["apps", "common", "config"]` |
| مهاجرت‌ها | از لینت مستثنا؛ دست‌کاری دستی نمی‌شوند |
| کامپوننت Angular | Standalone + Signals + `OnPush` |

قواعد فعال `ruff`: `E` (pycodestyle) · `F` (pyflakes) · `W` · `I` (isort) ·
`UP` (pyupgrade) · `B` (bugbear) · `C4` (comprehensions) · `DJ` (Django) · `RUF`.

چند قاعده عمداً خاموش‌اند و دلیلش در `pyproject.toml` نوشته شده: مثلاً `RUF001-003`
چون متن فارسی همه‌جا «کاراکتر یونیکد مبهم» تشخیص داده می‌شود، و `DJ001` چون قرارداد
API روی فیلدهای متنی اختیاری، `null` را از `""` تفکیک می‌کند.

## ۷. دستورهای پرکاربرد

### Backend

```bash
python -m pytest                      # ۱۲۹ تست
python -m pytest -k assessment        # فقط یک بخش
python -m pytest --cov                # با پوشش کد
python -m ruff check .                # لینت
python -m ruff check . --fix          # اصلاح خودکار

python manage.py makemigrations
python manage.py migrate
python manage.py seed_catalog
python manage.py seed_demo
python manage.py createsuperuser
python manage.py shell_plus           # از django-extensions
```

### Frontend

```bash
npm start                             # سرور توسعه روی :4200
npm run build                         # ساخت production
npx ng test --watch=false --browsers=ChromeHeadless
```

### Docker

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose exec backend python manage.py <command>
docker compose exec backend python -m pytest
docker compose down                   # توقف
docker compose down -v                # توقف و پاک کردن کامل داده
PIP_INDEX_URL=<mirror> docker compose build   # وقتی pypi.org در دسترس نیست
```

## ۸. داده‌ی نمونه و حساب‌های آزمایشی

`seed_catalog` ساختار آزمون را می‌سازد (تعریف، نسخه‌ی ۱٫۰ منتشرشده، دو مرحله، ده
کارت) و در هر محیطی لازم است.

`seed_demo` داده‌ی توسعه می‌سازد و **با `DEBUG=False` اجرا نمی‌شود** (مگر با `--force`)،
چون حساب‌هایی با رمز عمومی می‌سازد. رمز همه: `Test1234`.

| ایمیل | نقش | وضعیت |
|---|---|---|
| `patient@test.com` | مراجع — سارا محمدی | ارتباط فعال؛ **یک آزمون کامل و کدگذاری‌شده** (۱۸ پاسخ) + یک درخواست در انتظار |
| `patient2@test.com` | مراجع — علی رضایی | فقط یک درخواست در انتظار — برای تست حالت انتظار |
| `patient3@test.com` | مراجع — نرگس کاظمی | **آزمون نیمه‌تمام روی کارت ۴** — برای تست ادامه‌ی آزمون |
| `psych@test.com` | روان‌شناس — مریم احمدی | تأییدشده؛ دو مراجع فعال، یک درخواست، پروتکل کامل برای کدگذاری |
| `psych2@test.com` | روان‌شناس — حسین کریمی | تأییدشده؛ یک درخواست در انتظار |
| `psych3@test.com` · `psych4@test.com` | روان‌شناس | تأییدشده و بدون مراجع — برای تست جست‌وجو |
| `pending@test.com` | روان‌شناس — امید نوری | **در انتظار تأیید** — برای تست صفحه‌ی انتظار و تأیید ادمین |
| `admin@test.com` | مدیر | پنل ادمین |

**سناریوی پیشنهادی برای دیدن کل چرخه:** با `admin@test.com` وارد شوید و
`pending@test.com` را تأیید کنید ← با `patient2@test.com` ببینید درخواستش در انتظار
است ← با `psych@test.com` تأییدش کنید ← با `patient2@test.com` آزمون را از ابتدا
اجرا کنید ← دوباره با `psych@test.com` پاسخ‌ها را کدگذاری و تحلیل کنید.

## ۹. افزودن یک قابلیت تازه

نسخه‌ی کوتاه، به ترتیب:

1. **مدل** — فیلد یا جدول در `models.py` با قید لازم، سپس `makemigrations`.
2. **سرویس** — منطق و گذار حالت در `services.py`، با `@transaction.atomic` اگر بیش از
   یک نوشتن دارد.
3. **Serializer** — اعتبارسنجی ورودی و شکل خروجی؛ نام فیلدها باید با مدل TypeScript
   فرانت‌اند یکی باشد.
4. **View** — نازک: مجوز، فراخوانی سرویس، کد وضعیت.
5. **URL** — افزودن مسیر در `urls.py` همان اپ.
6. **ممیزی** — اگر عمل حساس است، `audit.services.record(...)`.
7. **تست** — دست‌کم یک تست مسیر موفق و یک تست مجوز.
8. **سند** — به‌روزرسانی [[04-api-design]] و در صورت تغییر داده، [[03-data-model-er]].

## ۱۰. کارهای پس‌زمینه

```mermaid
flowchart TD
    D["Django · درخواست کاربر"] -->|on_commit| C["Celery"]
    C --> A["assessments.generate_analysis"]
    D -.->|"کارگزار در دسترس نیست"| INL["اجرای درجا + هشدار در لاگ"]
```

فعلاً فقط **یک** وظیفه وجود دارد: `assessments.generate_analysis`. اگر کارگزار صف در
دسترس نباشد، همان‌جا اجرا می‌شود — این یک راحتی برای ماشین توسعه‌دهنده است، نه مسیر
production. در محیط تست، `CELERY_TASK_ALWAYS_EAGER = True` است تا تست‌ها قطعی بمانند.

## ۱۱. رفع اشکال‌های رایج

| نشانه | علت و راه‌حل |
|---|---|
| `#!/bin/sh^M: No such file` هنگام بالا آمدن کانتینر | چک‌اوت ویندوزی با CRLF؛ `.gitattributes` و `sed` در Dockerfile این را حل کرده‌اند — مخزن را دوباره کلون کنید |
| تست‌ها داخل کانتینر با خطای Redis شکست می‌خورند | `--ds=config.settings.testing` در `pyproject.toml` اجباری شده؛ مطمئن شوید `pytest` را از ریشه‌ی `backend` اجرا می‌کنید |
| چت وصل می‌شود ولی پیام نمی‌رسد | لایه‌ی کانال درون‌حافظه‌ای فقط در یک پروسه کار می‌کند؛ `REDIS_URL` را تنظیم کنید |
| تصویر کارت ۴۰۴ می‌دهد | فایل‌های `Rorschach/public/images/test/1..10.jpg` باید سر جایشان باشند |
| تحلیل در `PENDING` مانده | کارگزار Celery خاموش است؛ باز کردن صفحه‌ی جزئیات آزمون خودش محاسبه می‌کند |
| ۴۲۹ هنگام تست دستی | سقف نرخ `auth` بیست در دقیقه است؛ کمی صبر کنید |

## ۱۲. یکپارچه‌سازی پیوسته

⛔ فعلاً CI راه‌اندازی نشده است، چون سروری برای استقرار وجود ندارد. وقتی لازم شد،
حداقل خط لوله این است:

```mermaid
flowchart LR
    G["git push"] --> L["ruff check"]
    G --> T["pytest"]
    G --> B["ng build"]
    G --> U["ng test"]
    L & T & B & U --> D["استقرار"]
```

هر چهار گام همین حالا به‌صورت محلی اجرا می‌شوند و سبزند؛ افزودن CI فقط
انتقال همین دستورها به یک فایل workflow است.
