---
title: استقرار و عملیات
doc_id: DOC-07
version: 2
status: as-built
architecture_version: Architecture v2 — as-built
code_revision: 10c22fe
language: fa
updated: 1405-06-23
tags:
  - deployment
  - docker
  - configuration
  - logging
  - operations
related:
  - "[[02-architecture]]"
  - "[[06-development-guide]]"
  - "[[11-backend-notes]]"
---

# ۰۷ — استقرار و عملیات

## ۱. وضعیت فعلی استقرار

پشته‌ی **توسعه** کامل و قابل اجراست. پشته‌ی **production** هنوز مستقر نشده، اما هر
چیزی که برای آن لازم است در کد آماده شده: تنظیمات production، مرحله‌ی production در
Dockerfile، پشتیبانی از Object Storage و سرآیندهای امنیتی.

```mermaid
flowchart TD
    subgraph امروز["امروز — توسعه"]
        A1["Angular dev server :4200"] -->|proxy| B1["Daphne :8000"]
        B1 --> P1[("postgres:17")]
        B1 --> R1[("redis:7")]
        C1["celery worker"] --> R1
        C1 --> P1
    end
    subgraph فردا["هدف — production"]
        I["اینترنت"] --> N["NGINX + TLS"]
        N --> S["فایل‌های استاتیک Angular"]
        N --> B2["Uvicorn · چند worker"]
        B2 --> P2[("PostgreSQL مدیریت‌شده")]
        B2 --> R2[("Redis")]
        B2 --> OS[("Object Storage")]
    end
```

## ۲. ترکیب Docker

`docker-compose.yml` چهار سرویس دارد:

| سرویس | ایمیج / ساخت | نقش |
|---|---|---|
| `postgres` | `postgres:17-alpine` | دیتابیس · حجم پایدار · healthcheck با `pg_isready` |
| `redis` | `redis:7-alpine` | cache، لایه‌ی کانال، کارگزار صف · healthcheck با `redis-cli ping` |
| `backend` | ساخت از `./backend` (مرحله‌ی `development`) | Daphne روی `:8000` · مهاجرت و داده‌ی اولیه |
| `celery` | همان ایمیج | کارگر پس‌زمینه · **بدون** مهاجرت و داده‌ی اولیه |

سرویس‌های فرانت‌اند و NGINX عمداً در ترکیب نیستند: سرور توسعه‌ی Angular بیرون از
Docker سریع‌تر است و NGINX تا زمان استقرار واقعی معنا ندارد.

### تصمیم‌های Dockerfile

| تصمیم | چرا |
|---|---|
| **بدون `apt-get`** | همه‌ی وابستگی‌ها چرخ manylinux دارند (`psycopg[binary]`، Pillow، cryptography)، پس کامپایلر لازم نیست. نصب gcc کندترین و شکننده‌ترین مرحله‌ی build بود و روی شبکه‌ی محدود شکست می‌خورد |
| ساخت چندمرحله‌ای (`base` · `development` · `production`) | مرحله‌ی production فقط وابستگی‌های production را نصب می‌کند |
| اجرای غیر-root (`USER rorschach`) | کاهش اثر یک نفوذ احتمالی — در هر دو مرحله |
| healthcheck با `python -c urllib.request` | تا ایمیج به `curl` یا `wget` نیاز نداشته باشد |
| `PIP_INDEX_URL` به‌صورت build arg | روی میزبان‌هایی که pypi.org در دسترس نیست، میرور بدهید |
| نصب entrypoint در `/usr/local/bin` | مسیر `/app` با bind mount پوشانده می‌شود و کپی داخل ایمیج را پنهان می‌کند |
| `sed -i 's/\r$//'` روی entrypoint | چک‌اوت ویندوزی ممکن است CRLF بدهد و `/bin/sh` شبنگ CRLF را رد می‌کند |
| `init: true` در compose | تا سیگنال‌ها درست برسند و پروسه‌ی zombie نماند |
| Daphne به‌جای `runserver` | چت WebSocket به ASGI نیاز دارد |
| `RUN_MIGRATIONS=false` روی کارگر | مسابقه‌ی دو کانتینر روی `migrate` هنگام بالا آمدن دیتابیس تازه، راه واقعی قفل‌شدن است |

فایل `.gitattributes` هم `*.sh text eol=lf` را تضمین می‌کند تا نسخه‌ی کاری روی ویندوز
هم LF بماند.

### رفتار entrypoint

```mermaid
flowchart TD
    S["شروع کانتینر"] --> W["انتظار برای دیتابیس (حداکثر ۶۰ تلاش)"]
    W --> M{"RUN_MIGRATIONS؟"}
    M -->|بله| MG["migrate --noinput"] --> SC["seed_catalog"]
    M -->|خیر| D
    SC --> D{"SEED_DEMO؟"}
    D -->|بله| SD["seed_demo"] --> CS
    D -->|خیر| CS{"RUN_COLLECTSTATIC؟"}
    CS -->|بله| CL["collectstatic --noinput"] --> X["exec دستور اصلی"]
    CS -->|خیر| X
```

هر سه دستور idempotent‌اند، پس restart هزینه‌ای ندارد.

## ۳. تفکیک محیط‌ها

```
config/settings/
├── base.py          مشترک — همه‌چیز از متغیر محیطی خوانده می‌شود
├── development.py   DEBUG · CORS باز برای :4200 · cache و channel layer درون‌حافظه‌ای
├── production.py    HSTS · SSL redirect · کوکی امن · Object Storage
└── testing.py       SQLite · بدون Redis · Celery همزمان · بدون محدودسازی نرخ
```

نکته‌های مهم هر محیط:

- **توسعه:** اگر `CACHE_URL` تنظیم نشده باشد، cache روی حافظه می‌افتد و لایه‌ی کانال هم
  درون‌حافظه‌ای می‌شود تا `manage.py runserver` بدون Redis کار کند. این حالت فقط در یک
  پروسه درست کار می‌کند.
- **تست:** SQLite پیش‌فرض است تا هیچ سرویسی لازم نباشد. مدل‌ها عمداً فقط از نوع‌های
  قابل‌حمل استفاده می‌کنند (`JSONField` و نه `ArrayField` مخصوص PostgreSQL)، پس همان
  مجموعه‌ی تست با تنظیم `DATABASE_URL` روی PostgreSQL هم اجرا می‌شود. هش رمز روی
  MD5 گذاشته شده تا تست‌ها سریع بمانند.
- **production:** `SECURE_SSL_REDIRECT`، HSTS یک‌ساله با زیردامنه و preload،
  `SECURE_PROXY_SSL_HEADER` برای کار پشت پروکسی، کوکی‌های `Secure` و `X_FRAME_OPTIONS=DENY`.

## ۴. متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.development` | انتخاب محیط |
| `SECRET_KEY` | کلید ناامن توسعه | **در production اجباری** |
| `JWT_SECRET` | همان `SECRET_KEY` | کلید امضای توکن |
| `DEBUG` | `False` | — |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | فهرست جداشده با کاما |
| `DATABASE_URL` | `postgres://rorschach:rorschach@localhost:5432/rorschach` | — |
| `REDIS_URL` | `redis://localhost:6379/0` | لایه‌ی کانال و کارگزار صف |
| `CACHE_URL` | همان `REDIS_URL` | جدا شده تا بتوان cache را مستقل تنظیم کرد |
| `CELERY_BROKER_URL` · `CELERY_RESULT_BACKEND` | همان `REDIS_URL` | — |
| `CELERY_TASK_ALWAYS_EAGER` | `False` | در تست `True` |
| `ACCESS_TOKEN_LIFETIME_MINUTES` | `15` | — |
| `REFRESH_TOKEN_LIFETIME_DAYS` | `14` | — |
| `REFRESH_COOKIE_NAME` | `rorschach_refresh` | — |
| `REFRESH_COOKIE_SECURE` | `True` | در توسعه `False` |
| `REFRESH_COOKIE_SAMESITE` | `Lax` | — |
| `REFRESH_COOKIE_DOMAIN` | خالی | برای استقرار روی زیردامنه |
| `CORS_ALLOWED_ORIGINS` | خالی | در توسعه `:4200` |
| `CSRF_TRUSTED_ORIGINS` | خالی | — |
| `STORAGE_BACKEND` | `local` | `s3` برای Object Storage |
| `STORAGE_ENDPOINT` · `STORAGE_BUCKET` · `STORAGE_ACCESS_KEY` · `STORAGE_SECRET_KEY` · `STORAGE_REGION` | — | فقط وقتی `STORAGE_BACKEND=s3` |
| `AI_ENABLED` | `True` | کلید قطع تشخیص واژه‌های محتوا ([[14-ai-content-words]]) |
| `AI_BASE_URL` | `https://api.avalai.ir/v1` | واسط ایرانی سازگار با OpenAI |
| `AI_API_KEY` | خالی | خالی = فقط واژه‌نامه‌ی محلی، بدون هیچ تماس بیرونی |
| `AI_MODEL` | `gpt-4o-mini` | نام مدل نزد همان واسط |
| `AI_TIMEOUT_SECONDS` | `20` | مهلت یک تماس |
| `RUN_MIGRATIONS` | `true` | entrypoint |
| `SEED_DEMO` | `false` | entrypoint — در ترکیب توسعه `true` |
| `RUN_COLLECTSTATIC` | `false` | entrypoint |
| `PIP_INDEX_URL` | `https://pypi.org/simple` | build arg |

**هیچ رازی داخل مخزن نیست.** فایل `.env` در `.gitignore` است و فقط `.env.example`
نگهداری می‌شود.

## ۵. سلامت و پایش

```
GET /health/ → 200 {"status":"ok","checks":{"database":true}}
             → 503 {"status":"degraded","checks":{"database":false}}
```

این مسیر عمداً بیرون از `/api/v1/` است — زیرساخت است نه بخشی از قرارداد API — و
دیتابیس را واقعاً می‌زند، چون پروسه‌ای که به PostgreSQL نمی‌رسد سالم نیست. پاسخ
`never_cache` است.

healthcheck کانتینر `backend` هم همین مسیر را با یک تک‌خطی پایتون صدا می‌زند.

## ۶. لاگ و ممیزی

سه لایه که هرگز با هم یکی نمی‌شوند:

| Logger | سطح | نمونه |
|---|---|---|
| `rorschach.app` | INFO | استثنای مدیریت‌نشده، در دسترس نبودن کارگزار صف، شکست وظیفه‌ی تحلیل |
| `rorschach.audit` | INFO | «چه کسی چه کاری روی چه شیئی انجام داد» — همراه با ثبت در `audit_logs` |
| `rorschach.security` | WARNING | ورود ناموفق، هر ۴۰۱/۴۰۳، از کار افتادن محدودکننده‌ی نرخ |

قالب: `[زمان] سطح نام: پیام` روی خروجی استاندارد — مناسب برای جمع‌آوری توسط
زیرساخت کانتینر.

جدول `audit_logs` مستقل از لاگ متنی است و پرس‌وجوپذیر: `actor`، `action`،
`target_type`، `target_id`، `ip_address`، `user_agent`، `metadata` و زمان.
ایمیل کنشگر غیرنرمال ذخیره می‌شود تا پس از حذف حساب هم ردیف خوانا بماند.

## ۷. Redis در عملیات

سه مصرف مجزا، که بهتر است در production روی شماره‌ی دیتابیس‌های متفاوت باشند:

| مصرف | متغیر | اگر نباشد چه می‌شود |
|---|---|---|
| Cache و شمارنده‌ی نرخ | `CACHE_URL` | محدودکننده **باز** می‌شود و هشدار امنیتی ثبت می‌گردد |
| لایه‌ی کانال WebSocket | `REDIS_URL` | چت بلادرنگ بین چند worker کار نمی‌کند |
| کارگزار صف Celery | `CELERY_BROKER_URL` | تحلیل درجا محاسبه می‌شود (با هشدار) |

Redis **دیتابیس اصلی پروژه نیست**؛ هیچ داده‌ی ماندگاری در آن نگه داشته نمی‌شود.

## ۸. ذخیره‌سازی فایل

```
Object Storage
├── tests/rorschach/v1/card-01.jpg …      تصاویر کارت
├── avatars/patients/ · avatars/psychologists/
├── verification-documents/               مدارک روان‌شناسان
└── assets/                               فایل‌های عمومی
```

در توسعه، `FileSystemStorage` روی `backend/media/` (حجم Docker `backend-media`). در
production با `STORAGE_BACKEND=s3`، پشتیبان `S3Storage` با `default_acl=private`،
`querystring_auth=True` و `file_overwrite=False` فعال می‌شود — یعنی فایل‌ها عمومی
نیستند و با URL امضاشده سرو می‌شوند.

تصاویر کارت در دیتابیس ذخیره نمی‌شوند (BR-15): فقط `storage_key`، نوع، حجم و
checksum در `media_assets`.

## ۹. پشتیبان‌گیری و بازیابی

⛔ هنوز پیاده نشده. چیزی که باید پشتیبان گرفته شود:

| مورد | اهمیت |
|---|---|
| `postgres-data` (کل دیتابیس) | حیاتی — پروتکل‌های آزمون در آن است |
| Object Storage | مهم — مدارک تأیید و آواتارها |
| `.env` و کلیدها | خارج از مخزن، در مدیریت راز |
| Redis | لازم نیست — داده‌ی ماندگار ندارد |

## ۱۰. فهرست کارهای باقی‌مانده برای production

| مورد | وضعیت | یادداشت |
|---|---|---|
| NGINX (پروکسی معکوس + استاتیک) | ⛔ | فایل ترکیب production هم لازم است |
| گواهی TLS | ⛔ | تنظیمات Django آماده است |
| CI/CD | ⛔ | `pytest` و `ruff` و `ng build` محلی سبزند |
| مانیتورینگ و هشدار | ⛔ | `sentry-sdk` در وابستگی‌های production هست، راه‌اندازی نشده |
| پشتیبان‌گیری | ⛔ | — |
| مقیاس‌دهی افقی | ◐ | با Redis به‌عنوان لایه‌ی کانال ممکن است؛ آزمایش نشده |
| ایندکس JSON | ⛔ | تا مشاهده‌ی الگوی کوئری واقعی |
| تست خودکار WebSocket | ⛔ | نیازمند `pytest-asyncio` و `ChannelsLiveServer` |

## ۱۱. چک‌لیست استقرار

وقتی سرور آماده شد، به این ترتیب:

1. `SECRET_KEY` و `JWT_SECRET` تازه و تصادفی تولید کنید.
2. `DJANGO_SETTINGS_MODULE=config.settings.production` و `DEBUG=False`.
3. `ALLOWED_HOSTS`، `CORS_ALLOWED_ORIGINS` و `CSRF_TRUSTED_ORIGINS` را روی دامنه‌ی
   واقعی تنظیم کنید.
4. `REFRESH_COOKIE_SECURE=True` و در صورت زیردامنه، `REFRESH_COOKIE_DOMAIN`.
5. `STORAGE_BACKEND=s3` به‌همراه مشخصات سطل.
6. `docker compose ... build --target production` و اجرا با `RUN_COLLECTSTATIC=true`.
7. `SEED_DEMO` حتماً `false` — این حساب‌ها رمز عمومی دارند.
8. `python manage.py migrate` و `seed_catalog` (entrypoint خودش انجام می‌دهد).
9. یک ادمین واقعی با `createsuperuser` بسازید.
10. NGINX را جلوی Uvicorn بگذارید، TLS را ببندید و `/health/` را به probe وصل کنید.
11. پشتیبان‌گیری زمان‌بندی‌شده از PostgreSQL را فعال کنید.
