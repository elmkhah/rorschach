---
title: مستندات API
version: 2
language: fa
updated: 1405-06-23
tags:
  - api
  - rest
  - websocket
  - drf
  - openapi
related:
  - "[[02-architecture]]"
  - "[[03-data-model-er]]"
  - "[[05-sequence-diagrams]]"
  - "[[10-assessment-rpas]]"
---

# ۰۴ — مستندات API
مستندات API اپلیکیشن که سمت frontend پروژه از آن استفاده کرده است، در ادامه ذکر شده است:
## ۱. اصول

| موضوع            | قاعده                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| ریشه             | همه چیز زیر `/api/v1/` — تنها استثنا `/health/` که زیرساخت است            |
| قالب             | ‏`application/json` · تنها استثنا بارگذاری مدارک با `multipart/form-data` |
| احراز هویت       | سرآیند `Authorization: Bearer <access>`                                   |
| تمدید نشست       | کوکی `HttpOnly` با نام `rorschach_refresh` روی مسیر `/api/v1/auth/`       |
| شناسه‌ها         | ‏UUID به‌صورت رشته                                                        |
| زمان‌ها          | ‏ISO-8601 با منطقه‌ی زمانی (`Asia/Tehran`)                                |
| نام‌گذاری فیلدها | ‏`snake_case` — همان چیزی که مدل‌های TypeScript فرانت‌اند انتظار دارند    |
| زبان پیام‌ها     | پیام‌های خطا فارسی و قابل نمایش مستقیم به کاربرند                         |

## ۲. احراز هویت و مجوز

توکن دسترسی عمر ۱۵ دقیقه‌ای دارد و فقط در **حافظه‌ی** کلاینت می‌ماند. توکن تمدید عمر ۱۴ روزه دارد، در کوکی `HttpOnly` می‌نشیند و با هر بار استفاده **می‌چرخد**: توکن قبلی بلافاصله در لیست سیاه می‌رود.

کلاس‌های مجوز:

| کلاس                                        | معنی                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| ‏`AllowAny`                                 | بدون نیاز به ورود — فقط `login`، `register`، `refresh`، `logout` و `announcements` |
| ‏`IsAuthenticated`                          | هر کاربر واردشده                                                                   |
| ‏`IsPatient` · `IsPsychologist` · `IsAdmin` | فقط نقش مشخص                                                                       |
| ‏`IsPsychologistOrAdmin`                    | روان‌شناس یا مدیر                                                                  |
| ‏`IsApprovedPsychologist`                   | روان‌شناسِ **تأییدشده** (BR-01)                                                    |
| بررسی سطح شیء                               | ‏`readable_session` · `own_session` — علاوه بر کلاس بالا                           |

## ۳. قالب خطا

هر پاسخ ناموفق دقیقاً همین شکل را دارد:

```json
{
  "detail": "پیام قابل نمایش به کاربر",
  "code": "invalid",
  "errors": { "email": ["این ایمیل قبلاً ثبت شده است."] }
}
```

‏`detail` به‌صورت بنر نمایش داده می‌شود و `errors.<field>` روی همان فیلد فرم می‌نشیند.

| کد   | ‏`code`               | معنی در این سامانه                                     |
| ---- | --------------------- | ------------------------------------------------------ |
| ۴۰۰‏ | ‏`invalid`            | اعتبارسنجی ورودی یا نقض قاعده‌ی ورودی                  |
| ‏۴۰۱ | ‏`not_authenticated`  | توکن نامعتبر یا منقضی — پیام همیشه عمومی است           |
| ‏۴۰۳ | ‏`permission_denied`  | نقش یا رابطه اجازه نمی‌دهد                             |
| ‏۴۰۴ | ‏`not_found`          | شیء وجود ندارد                                         |
| ‏۴۰۵ | ‏`method_not_allowed` | ‏—                                                     |
| ‏۴۰۹ | ‏`conflict`           | درخواست با **وضعیت فعلی** سازگار نیست (نقض ماشین حالت) |
| ‏۴۲۹ | ‏`throttled`          | عبور از سقف نرخ                                        |
| ‏۵۰۰ | ‏—                    | خطای مدیریت‌نشده؛ در لاگ برنامه ثبت می‌شود             |

## ۴. صفحه‌بندی

بیشتر فهرست‌ها **آرایه‌ی ساده** برمی‌گردانند. فقط سه اندپوینت صفحه‌بندی دارند و شکل
پاسخشان `{count, next, previous, results}` است:

| اندپوینت                  | اندازه‌ی صفحه | پارامترها                                     |
| ------------------------- | ------------- | --------------------------------------------- |
| ‏`GET /psychologists/`    | ۱۲‏           | ‏`page` · `page_size` (حداکثر ۱۰۰) · `search` |
| ‏`GET /admin/users/`      | ‏۲۰           | ‏`page` · `page_size` · `role` · `search`     |
| ‏`GET /admin/audit-logs/` | ‏۲۵           | ‏`page` · `page_size` · `action` · `search`   |

## ۵. محدودسازی نرخ

| دامنه    | سقف          | شامل                                                          |
| -------- | ------------ | ------------------------------------------------------------- |
| ‏`auth`  | ۲۰ در دقیقه  | ‏`login` · `register` · `refresh`                             |
| ‏`write` | ۱۲۰ در دقیقه | ثبت پاسخ، روشن‌سازی، تکمیل، پیام، کدگذاری، تحلیل، اعمال ادمین |

## ۶. هویت — `/auth/` و `/users/`

| متد    | مسیر              | دسترسی        | شرح                              |
| ------ | ----------------- | ------------- | -------------------------------- |
| ‏POST  | `/auth/register/` | همه           | ثبت‌نام مراجع یا روان‌شناس       |
| ‏POST  | `/auth/login/`    | همه           | ورود                             |
| ‏POST  | `/auth/refresh/`  | همه (با کوکی) | تمدید توکن دسترسی                |
| ‏POST  | `/auth/logout/`   | همه           | ابطال توکن تمدید و پاک کردن کوکی |
| ‏GET   | `/auth/me/`       | واردشده       | هویت + پروفایل نقش               |
| ‏PATCH | `/users/me/`      | واردشده       | ویرایش پروفایل خود               |


```json
{
  "role": "PATIENT",
  "email": "user@example.com",
  "password": "…",
  "first_name": "سارا",
  "last_name": "محمدی",
  "phone": null,
  "specialty": "",
  "professional_code": ""
}
```


**شیء `Me`:**

```json
{
  "user": { "id": "…", "email": "…", "phone": null, "role": "PATIENT",
            "is_active": true, "is_verified": false,
            "created_at": "…", "last_login_at": "…" },
  "patient_profile": { "user_id": "…", "first_name": "…", "last_name": "…",
                       "birth_date": null, "gender": null, "avatar": null, "bio": "" },
  "psychologist_profile": null
}
```

‏`PATCH /users/me/` — اتحاد فیلدهای قابل‌ویرایش هر دو نقش؛ فیلدهایی که به نقش
کاربر مربوط نیستند **نادیده گرفته می‌شوند**، نه اینکه خطا بدهند:

| نقش | فیلدهای قابل ویرایش |
|---|---|
| هر دو | `phone` · `first_name` · `last_name` · `bio` |
| مراجع | `birth_date` · `gender` |
| روان‌شناس | `specialty` · `city` · `years_of_experience` |

## ۷. پروفایل روان‌شناسان — `/psychologists/`

| متد     | مسیر                                   | دسترسی    | شرح                                       |
| ------- | -------------------------------------- | --------- | ----------------------------------------- |
| ‏GET    | `/psychologists/`                      | واردشده   | فهرست روان‌شناسان تأییدشده (صفحه‌بندی ۱۲) |
| ‏GET    | `/psychologists/{user_id}/`            | واردشده   | پروفایل + افتخارات                        |
| ‏GET    | `/psychologists/me/achievements/`      | روان‌شناس | افتخارات خودم                             |
| ‏POST   | `/psychologists/me/achievements/`      | روان‌شناس | افزودن افتخار                             |
| ‏DELETE | `/psychologists/me/achievements/{id}/` | روان‌شناس | حذف افتخار (`204`)                        |
| ‏POST   | `/psychologists/me/documents/`         | روان‌شناس | بارگذاری مدارک تأیید                      |

## ۸. رابطه — `/relationships/` و `/patients/`

| متد   | مسیر                           | دسترسی             | شرح                              |
| ----- | ------------------------------ | ------------------ | -------------------------------- |
| ‏GET  | `/relationships/?status=`      | واردشده            | روابط مرتبط با خودم (ادمین: همه) |
| ‏POST | `/relationships/`              | مراجع              | درخواست ارتباط                   |
| ‏POST | `/relationships/{id}/approve/` | روان‌شناس          | تأیید                            |
| ‏POST | `/relationships/{id}/reject/`  | روان‌شناس          | رد                               |
| ‏POST | `/relationships/{id}/revoke/`  | هر دو طرف یا ادمین | لغو                              |
| ‏GET  | `/patients/{user_id}/`         | روان‌شناسِ مرتبط   | پرونده‌ی مراجع                   |


## ۹. کاتالوگ آزمون — `/tests/`

| متد  | مسیر      | دسترسی  | شرح                  |
| ---- | --------- | ------- | -------------------- |
| ‏GET | `/tests/` | واردشده | تعریف آزمون‌های فعال |

```json
[{ "id": "…", "code": "RORSCHACH", "name": "آزمون رورشاخ", "description": "…",
   "status": "ACTIVE", "coding_system": "R-PAS",
   "methodology_reference": "…", "source_document": "…", "created_at": "…" }]
```

## ۱۰. آزمون — `/assessments/sessions/`

### ۱۰-۱. فهرست و جلسه

| متد   | مسیر                                          | دسترسی                         | شرح                         |
| ----- | --------------------------------------------- | ------------------------------ | --------------------------- |
| ‏GET  | ‏`/assessments/sessions/?status=&patient_id=` | واردشده                        | فهرست، فیلترشده بر اساس نقش |
| ‏POST | ‏`/assessments/sessions/`                     | مراجع                          | ایجاد یا بازیابی جلسه‌ی باز |
| ‏GET  | ‏`/assessments/sessions/{id}/`                | مالک / روان‌شناس مرتبط / ادمین | خلاصه‌ی جلسه                |

**شیء `AssessmentSession`:**

```json
{
  "id": "…", "patient_id": "…", "psychologist_id": "…", "relationship_id": "…",
  "test_definition_id": "…", "test_version_id": "…",
  "status": "IN_PROGRESS",
  "current_phase": "…", "current_card": "…", "current_step": 0,
  "started_at": "…", "paused_at": null, "completed_at": null,
  "created_at": "…", "updated_at": "…",
  "administration": { "prompts": 1, "pulls": 0, … },
  "test_name": "آزمون رورشاخ", "test_version": "1.0",
  "patient_name": "سارا محمدی", "psychologist_name": "مریم احمدی",
  "total_cards": 10, "answered_cards": 4
}
```


### ۱۰-۲. اجرای آزمون (مراجع)

| متد   | مسیر                     | شرح                       |
| ----- | ------------------------ | ------------------------- |
| ‏GET  | `…/{id}/state/`          | وضعیت جاری اجرا           |
| ‏POST | `…/{id}/start/`          | `CREATED` ← `IN_PROGRESS` |
| ‏POST | `…/{id}/responses/`      | ثبت پاسخ روی کارت جاری    |
| ‏POST | `…/{id}/next/`           | کارت بعد، یا یادآوری      |
| ‏POST | `…/{id}/clarifications/` | روشن‌سازی یک پاسخ         |
| ‏POST | `…/{id}/complete/`       | ثبت نهایی                 |
| ‏POST | `…/{id}/events/`         | ثبت مشاهده‌ی اجرایی       |

**شیء `RunState`** — پاسخ همه‌ی این اندپوینت‌ها (مستقیم یا داخل پوشش):

```json
{
  "session": { … },
  "stage": "RESPONSE",
  "card": { "id": "…", "card_number": 3, "title": "کارت III",
            "image_url": "/images/test/3.jpg", "configuration": { … } },
  "card_index": 3,
  "total_cards": 10,
  "card_responses": [ { … } ],
  "prompted": false,
  "pulled": false,
  "target": null,
  "clarification_index": 0,
  "clarification_total": 0,
  "min_responses": 2,
  "max_responses": null
}
```

‏**`POST …/responses/`**

```json
{
  "client_response_id": "b3f1…",
  "card_id": "…",
  "response_text": "دو خرس که دست‌هایشان را به هم زده‌اند",
  "client_started_at": "…",
  "client_submitted_at": "…",
  "measurements": { "reaction_time_ms": 4200, "card_turns": 1, "final_rotation": 90 }
}
```

پاسخ `201` با `{ "response": { … }, "state": { … } }`.

- ارسال دوباره با همان `client_response_id` → همان پاسخ قبلی، بدون رکورد تازه (BR-07).
- ‏`card_id` ناسازگار با کارت جاری → `409`.
- متن خالی → `400`.
- زمان‌های سرور را خود سرور می‌گذارد؛ مبدأ هر پاسخ، زمان ثبت پاسخ قبلی روی همان کارت
  است یا زمان نمایش کارت (BR-11).

‏`POST …/next/` → `{ "prompt": true|false, "state": { … } }`

‏`POST …/clarifications/`

```json
{
  "response_id": "…",
  "whole": false,
  "location_marks": [{ "x": 0.3, "y": 0.5 }],
  "reasons": ["MOVEMENT", "FORM"],
  "text": "حالت دست زدن دارند"
}
```

### ۱۰-۳. پروتکل و تحلیل (روان‌شناس / ادمین)

| متد   | مسیر                                     | دسترسی                   | شرح                           |
| ----- | ---------------------------------------- | ------------------------ | ----------------------------- |
| ‏GET  | `…/{id}/detail/`                         | روان‌شناس مرتبط یا ادمین | پروتکل کامل                   |
| ‏PUT  | `…/{id}/responses/{response_id}/coding/` | روان‌شناسِ همان جلسه     | کدگذاری یک پاسخ               |
| ‏POST | `…/{id}/analysis/`                       | روان‌شناس مرتبط یا ادمین | محاسبه‌ی مجدد                 |
| ‏POST | `…/{id}/content-words/`                  | روان‌شناس مرتبط یا ادمین | تشخیص واژه‌های محتوای دور اول |
| ‏GET  | `…/{id}/content-words/`                  | روان‌شناس مرتبط یا ادمین | خواندن نتیجه‌ی ذخیره‌شده      |

## ۱۱. گفت‌وگو — `/conversations/`

| متد   | مسیر                            | دسترسی     | شرح                 |
| ----- | ------------------------------- | ---------- | ------------------- |
| ‏GET  | `/conversations/`               | واردشده    | فهرست گفت‌وگوهای من |
| ‏GET  | `/conversations/{id}/`          | شرکت‌کننده | یک گفت‌وگو          |
| ‏GET  | `/conversations/{id}/messages/` | شرکت‌کننده | تاریخچه‌ی پیام‌ها   |
| ‏POST | `/conversations/{id}/messages/` | شرکت‌کننده | ارسال پیام          |
| ‏POST | `/conversations/{id}/read/`     | شرکت‌کننده | علامت خوانده‌شدن    |

```json
{
  "id": "…", "created_at": "…", "updated_at": "…",
  "peer": { "user_id": "…", "name": "مریم احمدی", "avatar": null,
            "role": "PSYCHOLOGIST", "is_online": true },
  "last_message": { … },
  "unread_count": 2
}
```


## ۱۲. اطلاعیه — `/announcements/`

| متد  | مسیر              | دسترسی                | شرح                               |
| ---- | ----------------- | --------------------- | --------------------------------- |
| ‏GET | `/announcements/` | **بدون نیاز به ورود** | اطلاعیه‌های منتشرشده و منقضی‌نشده |

## ۱۳. پنل مدیریت — `/admin/`

همه API ها با `IsAdmin` کنترل می شوند.

| متد             | مسیر                                                 | شرح                             |
| --------------- | ---------------------------------------------------- | ------------------------------- |
| ‏GET            | `/admin/stats/`                                      | آمار کلی داشبورد                |
| ‏GET            | `/admin/users/?role=&search=`                        | کاربران (صفحه‌بندی ۲۰)          |
| ‏POST           | `/admin/users/{id}/toggle-active/`                   | فعال / غیرفعال کردن حساب        |
| ‏GET            | `/admin/psychologists/?verification_status=&search=` | روان‌شناسان با مدارکشان         |
| ‏POST           | `/admin/psychologists/{user_id}/verify/`             | تصمیم تأیید                     |
| ‏GET            | `/admin/relationships/?status=`                      | همه‌ی روابط                     |
| ‏GET            | `/admin/assessments/?status=&patient_id=`            | همه‌ی جلسات                     |
| ‏GET            | `/admin/tests/`                                      | تعریف آزمون‌ها به‌همراه نسخه‌ها |
| ‏GET            | `/admin/test-versions/{id}/`                         | نسخه با مراحل و کارت‌ها         |
| ‏POST           | `/admin/test-versions/{id}/clone/`                   | ساخت نسخه‌ی پیش‌نویس تازه       |
| ‏POST           | `/admin/test-versions/{id}/publish/`                 | انتشار نسخه                     |
| ‏PATCH          | `/admin/cards/{id}/`                                 | ویرایش عنوان و پیکربندی کارت    |
| ‏GET · POST     | `/admin/announcements/`                              | فهرست و ایجاد اطلاعیه           |
| ‏PATCH · DELETE | `/admin/announcements/{id}/`                         | ویرایش و حذف                    |
| ‏GET            | `/admin/media/`                                      | فهرست فایل‌های رسانه            |
| ‏GET            | `/admin/audit-logs/?action=&search=`                 | رویدادهای ممیزی (صفحه‌بندی ۲۵)  |

‏`GET /admin/stats/`

```json
{ "users": 9, "patients": 3, "psychologists": 5, "pending_verifications": 1,
  "active_relationships": 2, "sessions_total": 2, "sessions_completed": 1 }
```

## ۱۴. زیرساخت

| متد  | مسیر             | دسترسی | شرح                                                                |
| ---- | ---------------- | ------ | ------------------------------------------------------------------ |
| ‏GET | `/health/`       | همه    | `{"status":"ok","checks":{"database":true}}` — در صورت خرابی `503` |
| ‏GET | `/api/schema/`   | ‏—     | شمای OpenAPI 3                                                     |
| ‏GET | `/api/docs/`     | ‏—     | ‏Swagger UI                                                        |
| ‏—   | `/django-admin/` | ‏staff | پنل داخلی Django (ابزار توسعه، نه بخشی از محصول)                   |
