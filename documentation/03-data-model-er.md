---
title: مدل داده و ERD
version: 3
language: fa
updated: 1405-06-23
tags:
  - data-model
  - erd
  - database
  - postgresql
  - schema
related:
  - "[[00-overview]]"
  - "[[01-requirements]]"
  - "[[02-architecture]]"
  - "[[04-api-design]]"
  - "[[10-assessment-rpas]]"
---

# ۰۳ — مدل داده و ERD
در این سند به تشریح مدل ER دیاگرام اپلیکیشن رورشاخ می پردازیم، طراحی اولیه، پس از پیاده سازی ، چند مرتبه بازنگری شده و طرح زیر، پس از پیاده سازی و بازنگری نهایی شده است:
## ‏۱. ERD

```mermaid
erDiagram
    User ||--o| PatientProfile : "پروفایل"
    User ||--o| PsychologistProfile : "پروفایل"
    PsychologistProfile ||--o{ VerificationDocument : "مدارک"
    PsychologistProfile ||--o{ PsychologistAchievement : "افتخارات"
    PatientProfile ||--o{ Relationship : "دارد"
    PsychologistProfile ||--o{ Relationship : "دارد"

    TestDefinition ||--o{ TestVersion : "نسخه‌ها"
    TestVersion ||--o{ TestPhase : "مراحل"
    TestVersion ||--o{ AssessmentCard : "کارت‌ها"
    TestPhase ||--o{ AssessmentCard : "کارت‌های مرحله"
    MediaAsset ||--o{ AssessmentCard : "تصویر"

    PatientProfile ||--o{ AssessmentSession : "اجرا می‌کند"
    PsychologistProfile ||--o{ AssessmentSession : "ناظر"
    Relationship ||--o{ AssessmentSession : "چارچوب"
    TestDefinition ||--o{ AssessmentSession : "کدام آزمون"
    TestVersion ||--o{ AssessmentSession : "کدام نسخه"
    AssessmentSession ||--o{ AssessmentResponse : "پاسخ‌ها"
    AssessmentCard ||--o{ AssessmentResponse : "روی کارت"
    AssessmentSession ||--o| AssessmentAnalysis : "تحلیل"
    AssessmentSession ||--o| ContentDetection : "واژه‌های محتوا"
    AssessmentSession ||--o| AssessmentReport : "گزارش"
    User ||--o{ AssessmentResponse : "کدگذار"

    Conversation ||--o{ ConversationParticipant : "شرکت‌کنندگان"
    Conversation ||--o{ Message : "پیام‌ها"
    User ||--o{ ConversationParticipant : "عضو"
    User ||--o{ Message : "فرستنده"

    User ||--o{ AuditLog : "کنشگر"
```

## ۲. فهرست جدول‌ها

| دامنه   | جدول‌ها                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| هویت    | ‏`users`                                                                                                                         |
| پروفایل | ‏`patient_profiles` · `psychologist_profiles` · `psychologist_verification_documents` · `psychologist_achievements`              |
| رابطه   | ‏`patient_psychologist_relationships`                                                                                            |
| کاتالوگ | ‏`test_definitions` · `test_versions` · `test_phases` · `test_cards`                                                             |
| رسانه   | ‏`media_assets`                                                                                                                  |
| اجرا    | ‏`assessment_sessions` · `assessment_responses` · `assessment_analyses` · `assessment_content_detections` · `assessment_reports` |
| ارتباط  | ‏`conversations` · `conversation_participants` · `messages`                                                                      |
| اطلاعیه | ‏`site_announcements`                                                                                                            |
| ممیزی   | ‏`audit_logs`                                                                                                                    |

## ۳. هویت

### ‏`users`

| ستون                          | نوع           | قید و توضیح                                                         |
| ----------------------------- | ------------- | ------------------------------------------------------------------- |
| ‏`id`                         | ‏UUID         | کلید اصلی                                                           |
| ‏`email`                      | ‏varchar(254) | یکتا، ایندکس، **یکتای حساس‌نبودن به حروف**                          |
| ‏`password`                   | ‏varchar(128) | هش Django (PBKDF2)                                                  |
| ‏`phone`                      | ‏varchar(32)  | ‏nullable                                                           |
| ‏`role`                       | ‏varchar(20)  | ایندکس · `PATIENT` \| `PSYCHOLOGIST` \| `ADMIN`                     |
| ‏`is_active`                  | ‏bool         | پیش‌فرض `true` — ادمین می‌تواند حساب را ببندد                       |
| ‏`is_verified`                | ‏bool         | پیش‌فرض `false` — تأیید مالکیت ایمیل/تلفن؛ فعلاً جریان تأییدی ندارد |
| ‏`is_staff` · ‏`is_superuser` | ‏bool         | برای پنل داخلی Django                                               |
| ‏`last_login`                 | ‏timestamptz  | در API با نام قراردادی `last_login_at` سریالایز می‌شود              |
| ‏`created_at`                 | ‏timestamptz  | ایندکس                                                              |
| ‏`updated_at`                 | ‏timestamptz  | ‏—                                                                  |

### ‏`patient_profiles`

| ستون                        | نوع          | قید                                               |
| --------------------------- | ------------ | ------------------------------------------------- |
| `user_id`                   | UUID         | **کلید اصلی** و کلید خارجی به `users` · `CASCADE` |
| `first_name` · `last_name`  | varchar(80)  | الزامی                                            |
| `birth_date`                | date         | ‏nullable                                         |
| `gender`                    | varchar(10)  | ‏nullable · `MALE` \| `FEMALE` \| `OTHER`         |
| `avatar`                    | varchar(100) | مسیر فایل، nullable                               |
| `bio`                       | text         | پیش‌فرض `''`                                      |
| `created_at` · `updated_at` | timestamptz  | ‏—                                                |

### ‏`psychologist_profiles`

| ستون                        | نوع          | قید                                               |
| --------------------------- | ------------ | ------------------------------------------------- |
| `user_id`                   | UUID         | **کلید اصلی** و کلید خارجی به `users` · `CASCADE` |
| `first_name` · `last_name`  | varchar(80)  | الزامی                                            |
| `avatar`                    | varchar(100) | ‏nullable                                         |
| `bio`                       | text         | پیش‌فرض `''`                                      |
| `specialty`                 | varchar(160) | پیش‌فرض `''`                                      |
| `professional_code`         | varchar(64)  | شماره‌ی نظام؛ پیش‌فرض `''`                        |
| `verification_status`       | varchar(32)  | ایندکس · پنج حالت · پیش‌فرض `REGISTERED`          |
| `city`                      | varchar(80)  | پیش‌فرض `''`                                      |
| `years_of_experience`       | smallint ≥ ۰ | پیش‌فرض ۰                                         |
| `verification_note`         | text         | یادداشت تصمیم ادمین                               |
| `verified_at`               | timestamptz  | ‏nullable                                         |
| `created_at` · `updated_at` | timestamptz  | ‏—                                                |

### ‏`psychologist_verification_documents`

| ستون | نوع | قید |
|---|---|---|
| `id` | UUID | کلید اصلی |
| `profile_id` | UUID | کلید خارجی به `psychologist_profiles` · `CASCADE` · ایندکس |
| `name` | varchar(255) | نام اصلی فایل |
| `file` | varchar(100) | مسیر فایل در فضای ذخیره‌سازی |
| `uploaded_at` | timestamptz | ترتیب پیش‌فرض |

### ‏`psychologist_achievements`

| ستون | نوع | قید |
|---|---|---|
| `id` | UUID | کلید اصلی |
| `psychologist_id` | UUID | کلید خارجی به `psychologist_profiles` · `CASCADE` · ایندکس |
| `title` | varchar(200) | الزامی |
| `issuer` | varchar(200) | پیش‌فرض `''` |
| `year` | smallint ≥ ۰ | در نبود مقدار، سال جاری |
| `description` | text | پیش‌فرض `''` |
| `created_at` | timestamptz | ترتیب: `-year, title` |

## ۴. رابطه

### ‏`patient_psychologist_relationships`

| ستون                         | نوع         | قید                                                                           |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `id`                         | UUID        | کلید اصلی                                                                     |
| `patient_id`                 | UUID        | کلید خارجی به `patient_profiles` · `CASCADE` · ایندکس                         |
| `psychologist_id`            | UUID        | کلید خارجی به `psychologist_profiles` · `CASCADE` · ایندکس                    |
| `status`                     | varchar(16) | ایندکس · `PENDING` \| `ACTIVE` \| `REJECTED` \| `REVOKED` · پیش‌فرض `PENDING` |
| `requested_at`               | timestamptz | زمان آخرین درخواست                                                            |
| `approved_at` · `revoked_at` | timestamptz | ‏nullable                                                                     |
| `created_at` · `updated_at`  | timestamptz | ترتیب: `-updated_at`                                                          |

## ۵. کاتالوگ آزمون

```mermaid
flowchart LR
    TD["test_definitions<br/>code = RORSCHACH"] --> TV["test_versions<br/>version = 1.0"]
    TV --> TP["test_phases<br/>RESPONSE · CLARIFICATION"]
    TP --> TC["test_cards ×۱۰"]
    MA["media_assets"] -.-> TC
```

### ‏`test_definitions`

| ستون                    | نوع          | قید                                                  |
| ----------------------- | ------------ | ---------------------------------------------------- |
| `id`                    | UUID         | کلید اصلی                                            |
| `code`                  | varchar(64)  | **یکتا** — مثلاً `RORSCHACH`                         |
| `name`                  | varchar(200) | ‏—                                                   |
| `description`           | text         | پیش‌فرض `''`                                         |
| `status`                | varchar(16)  | ‏`DRAFT` \| `ACTIVE` \| `ARCHIVED` · پیش‌فرض `DRAFT` |
| `coding_system`         | varchar(32)  | ‏پیش‌فرض `R-PAS` — سیستم کدگذاری این آزمون           |
| `methodology_reference` | varchar(255) | ‏nullable — ارجاع روش‌شناسی                          |
| `source_document`       | varchar(255) | ‏nullable — سند مبنا                                 |
| `created_at`            | timestamptz  | ترتیب: `code`                                        |


### ‏`test_versions`

| ستون                 | نوع         | قید                             |
| -------------------- | ----------- | ------------------------------- |
| `id`                 | UUID        | کلید اصلی                       |
| `test_definition_id` | UUID        | کلید خارجی · `CASCADE` · ایندکس |
| `version`            | varchar(16) | مثل `1.0` و `1.1`               |
| `is_published`       | bool        | پیش‌فرض `false`                 |
| `published_at`       | timestamptz | ‏nullable                       |
| `created_at`         | timestamptz | ترتیب: `created_at`             |

**قید یکتایی `unique_definition_version` روی `(test_definition_id, version)`.**
نسخه‌ی منتشرشده تغییرناپذیر است: ویرایش کارت‌های آن از سمت API رد می‌شود و راه
تغییر، `clone` کردن به یک پیش‌نویس تازه است.

### ‏`test_phases`

| ستون                   | نوع                 | قید                             |
| ---------------------- | ------------------- | ------------------------------- |
| `id`                   | UUID                | کلید اصلی                       |
| `test_version_id`      | UUID                | کلید خارجی · `CASCADE` · ایندکس |
| `kind`                 | varchar(16)         | ‏`RESPONSE` \| `CLARIFICATION`  |
| `name` · `description` | varchar(200) · text | متن نمایشی مرحله                |
| `display_order`        | smallint ≥ ۰        | پیش‌فرض ۱ · ترتیب پیش‌فرض       |

### ‏`test_cards`

| ستون | نوع | قید |
|---|---|---|
| `id` | UUID | کلید اصلی |
| `test_version_id` | UUID | کلید خارجی · `CASCADE` · ایندکس |
| `phase_id` | UUID | کلید خارجی به `test_phases` · `CASCADE` · ایندکس |
| `card_number` | smallint ≥ ۰ | ۱ تا ۱۰ |
| `title` | varchar(120) | مثل «کارت III» |
| `image_asset_id` | UUID | کلید خارجی به `media_assets` · `SET_NULL` · nullable |
| `image_path` | varchar(512) | مسیر نسبی جایگزین در توسعه |
| `display_order` | smallint ≥ ۰ | ترتیب نمایش |
| `configuration` | json | پیکربندی کارت (زیر) |

## ۶. رسانه

### ‏`media_assets`

| ستون          | نوع          | قید                                             |
| ------------- | ------------ | ----------------------------------------------- |
| `id`          | UUID         | کلید اصلی                                       |
| `storage_key` | varchar(512) | **یکتا** — مثل `tests/rorschach/v1/card-01.jpg` |
| `file`        | varchar(100) | ‏nullable — مسیر واقعی در فضای ذخیره‌سازی       |
| `mime_type`   | varchar(100) | ‏—                                              |
| `size`        | bigint ≥ ۰   | پیش‌فرض ۰                                       |
| `checksum`    | varchar(64)  | ‏SHA-256، پیش‌فرض `''`                          |
| `created_at`  | timestamptz  | ترتیب: `storage_key`                            |

## ۷. اجرای آزمون

### ‏`assessment_sessions`

| ستون                                        | نوع         | قید                                                            |
| ------------------------------------------- | ----------- | -------------------------------------------------------------- |
| `id`                                        | UUID        | کلید اصلی                                                      |
| `patient_id`                                | UUID        | کلید خارجی به `patient_profiles` · **`PROTECT`** · ایندکس      |
| `psychologist_id`                           | UUID        | کلید خارجی به `psychologist_profiles` · **`PROTECT`** · ایندکس |
| `relationship_id`                           | UUID        | کلید خارجی به رابطه · **`PROTECT`**                            |
| `test_definition_id`                        | UUID        | کلید خارجی · **`PROTECT`**                                     |
| `test_version_id`                           | UUID        | کلید خارجی · **`PROTECT`** — نسخه‌ی اجراشده (BR-04)            |
| `status`                                    | varchar(16) | ایندکس · شش حالت · پیش‌فرض `CREATED`                           |
| `current_phase_id`                          | UUID        | کلید خارجی به مرحله · `SET_NULL` · nullable                    |
| `current_card_id`                           | UUID        | کلید خارجی به کارت · `SET_NULL` · nullable                     |
| `current_step`                              | int         | ‏nullable — در مرحله‌ی روشن‌سازی، اندیس پاسخِ در حال بررسی     |
| `started_at` · `paused_at` · `completed_at` | timestamptz | ‏nullable                                                      |
| `created_at`                                | timestamptz | ایندکس · ترتیب: `-created_at`                                  |
| `updated_at`                                | timestamptz | ‏—                                                             |
| `administration`                            | json        | مشاهده‌های اجرایی (زیر)                                        |

### ‏`assessment_responses`

| ستون                                        | نوع          | قید                                           |
| ------------------------------------------- | ------------ | --------------------------------------------- |
| `id`                                        | UUID         | کلید اصلی                                     |
| `assessment_id`                             | UUID         | کلید خارجی به جلسه · `CASCADE` · ایندکس       |
| `phase_id`                                  | UUID         | کلید خارجی به مرحله · `PROTECT`               |
| `card_id`                                   | UUID         | کلید خارجی به کارت · `PROTECT` · ایندکس       |
| `card_number`                               | smallint ≥ ۰ | غیرنرمال، برای خواندن سریع پروتکل             |
| `client_response_id`                        | varchar(64)  | کلید idempotency تولیدشده توسط کلاینت         |
| `sequence`                                  | int ≥ ۰      | شماره‌ی پاسخ در کل پروتکل (همان R)            |
| `card_response_number`                      | smallint ≥ ۰ | چندمین پاسخ روی همین کارت                     |
| `response_text`                             | text         | متن خام مراجع — **هرگز بازنویسی نمی‌شود**     |
| `server_started_at` · `server_submitted_at` | timestamptz  | مرجع زمانی (BR-11)                            |
| `client_started_at` · `client_submitted_at` | timestamptz  | ‏nullable — اندازه‌گیری کمکی                  |
| `duration_ms`                               | int ≥ ۰      | محاسبه‌شده از زمان سرور                       |
| `client_metadata`                           | json         | پیش‌فرض `{}` — رزرو                           |
| `measurement_data`                          | json         | اندازه‌گیری‌های اجرایی (زیر)                  |
| `clarification`                             | json         | ‏nullable — مرحله‌ی روشن‌سازی (زیر)           |
| `coding`                                    | json         | ‏nullable — کدگذاری R-PAS (زیر)               |
| `coded_by_id`                               | UUID         | کلید خارجی به `users` · `SET_NULL` · nullable |
| `coded_at`                                  | timestamptz  | ‏nullable                                     |
| `created_at` · `updated_at`                 | timestamptz  | ترتیب: `sequence`                             |

### ‏`assessment_analyses`

| ستون                | نوع         | قید                                              |
| ------------------- | ----------- | ------------------------------------------------ |
| `id`                | UUID        | کلید اصلی                                        |
| `assessment_id`     | UUID        | **یک‌به‌یک** با جلسه · `CASCADE`                 |
| `algorithm_version` | varchar(32) | مثلاً `rpas-raw-0.1`                             |
| `status`            | varchar(16) | ‏`PENDING` \| `PROCESSING` \| `DONE` \| `FAILED` |
| `raw_analysis_data` | json        | ‏پیش‌فرض `{}` — رزرو برای ورودی خام الگوریتم     |
| `calculated_data`   | json        | ‏nullable — متغیرها، یافته‌ها و هشدارها          |
| `generated_at`      | timestamptz | ‏nullable                                        |
| `updated_at`        | timestamptz | ‏—                                               |

نسخه‌دار بودن الگوریتم عمدی است: اگر وزنی یا آستانه‌ای عوض شود، تحلیل‌های قدیمی
همچنان قابل تفسیرند چون می‌دانیم با کدام نسخه محاسبه شده‌اند.

### ‏`assessment_content_detections`

| ستون                        | نوع         | قید                                              |
| --------------------------- | ----------- | ------------------------------------------------ |
| `id`                        | UUID        | کلید اصلی                                        |
| `assessment_id`             | UUID        | **یک‌به‌یک** با جلسه · `CASCADE`                 |
| `status`                    | varchar(16) | ‏`PENDING` \| `PROCESSING` \| `DONE` \| `FAILED` |
| `source`                    | varchar(16) | ‏`AI` \| `LEXICON` — چه چیزی جواب داده           |
| `model_name`                | varchar(64) | پیش‌فرض `''` — برای واژه‌نامه خالی است           |
| `items`                     | json        | پیش‌فرض `[]` — فهرست تخت واژه‌های تشخیص‌داده‌شده |
| `error`                     | text        | پیش‌فرض `''` — دلیل در دسترس نبودن واسط          |
| `generated_at`              | timestamptz | ‏nullable                                        |
| `created_at` · `updated_at` | timestamptz | ‏—                                               |

### ‏`assessment_reports`

| ستون                | نوع          | قید                                           |
| ------------------- | ------------ | --------------------------------------------- |
| `id`                | UUID         | کلید اصلی                                     |
| `assessment_id`     | UUID         | **یک‌به‌یک** با جلسه · `CASCADE`              |
| `summary`           | text         | پیش‌فرض `''`                                  |
| `structured_result` | json         | پیش‌فرض `{}`                                  |
| `generated_at`      | timestamptz  | ‏—                                            |
| `generated_by_id`   | UUID         | کلید خارجی به `users` · `SET_NULL` · nullable |
| `version`           | smallint ≥ ۰ | پیش‌فرض ۱                                     |


## ۸. ارتباط و اطلاعیه

### ‏`conversations`

| ستون         | نوع         | قید                                                      |
| ------------ | ----------- | -------------------------------------------------------- |
| `id`         | UUID        | کلید اصلی                                                |
| `created_at` | timestamptz | ‏—                                                       |
| `updated_at` | timestamptz | ایندکس · با هر پیام به‌روز می‌شود · ترتیب: `-updated_at` |

### ‏`conversation_participants`

| ستون              | نوع         | قید                                        |
| ----------------- | ----------- | ------------------------------------------ |
| `id`              | bigint      | کلید اصلی (جدول واسط)                      |
| `conversation_id` | UUID        | کلید خارجی · `CASCADE` · ایندکس            |
| `user_id`         | UUID        | کلید خارجی به `users` · `CASCADE` · ایندکس |
| `joined_at`       | timestamptz | ‏—                                         |

**قید یکتایی `unique_conversation_participant`.** گفت‌وگو در این محصول همیشه
دونفره است و هنگام تأیید رابطه ساخته می‌شود.

### ‏`messages`

| ستون              | نوع         | قید                                            |
| ----------------- | ----------- | ---------------------------------------------- |
| `id`              | UUID        | کلید اصلی                                      |
| `conversation_id` | UUID        | کلید خارجی · `CASCADE` · ایندکس                |
| `sender_id`       | UUID        | کلید خارجی به `users` · `CASCADE` · ایندکس     |
| `message_type`    | varchar(16) | ‏`TEXT` \| `SYSTEM` · پیش‌فرض `TEXT`           |
| `content`         | text        | حداکثر ۴۰۰۰ کاراکتر (اعتبارسنجی در serializer) |
| `created_at`      | timestamptz | ایندکس · ترتیب: `created_at`                   |
| `read_at`         | timestamptz | ‏nullable                                      |

**ایندکس ترکیبی `(conversation_id, created_at)`** برای بارگذاری تاریخچه‌ی گفت‌وگو.
پیام‌ها ردیف‌اند نه آرایه‌ای داخل گفت‌وگو (BR-16) — آرایه‌ی بی‌کران حتی در پایگاه‌داده‌ی
سندگرا هم توصیه نمی‌شود.

### ‏`site_announcements`

| ستون                          | نوع          | قید                  |
| ----------------------------- | ------------ | -------------------- |
| `id`                          | UUID         | کلید اصلی            |
| `title`                       | varchar(200) | ‏—                   |
| `body`                        | text         | پیش‌فرض `''`         |
| `published_at` · `expires_at` | timestamptz  | ‏nullable            |
| `is_published`                | bool         | پیش‌فرض `false`      |
| `created_at` · `updated_at`   | timestamptz  | ترتیب: `-created_at` |

## ۹. ممیزی

### ‏`audit_logs`

| ستون                        | نوع          | قید                                                       |
| --------------------------- | ------------ | --------------------------------------------------------- |
| `id`                        | UUID         | کلید اصلی                                                 |
| `actor_id`                  | UUID         | کلید خارجی به `users` · `SET_NULL` · nullable             |
| `actor_email`               | varchar(254) | ‏nullable · **غیرنرمال** تا پس از حذف حساب هم خوانا بماند |
| `action`                    | varchar(64)  | ایندکس                                                    |
| `target_type` · `target_id` | varchar(64)  | ارجاع چندریختی به شیء هدف                                 |
| `ip_address`                | inet         | ‏nullable                                                 |
| `user_agent`                | text         | حداکثر ۵۱۲ کاراکتر ذخیره می‌شود                           |
| `metadata`                  | json         | پیش‌فرض `{}`                                              |
| `created_at`                | timestamptz  | ایندکس · ترتیب: `-created_at`                             |

## ۱۰. ساختار ستون‌های JSON

### ‏`test_cards.configuration`

```json
{
  "required": true,
  "min_responses": 2,
  "max_responses": null,
  "allow_rotation": true,
  "allowed_responses": [],
  "metadata": { "roman": "I" }
}
```

### ‏`assessment_sessions.administration`

```json
{
  "prompts": 0,
  "pulls": 0,
  "card_turns": 0,
  "interruptions": 0,
  "tab_hidden": 0,
  "prompted_cards": [],
  "pulled_cards": [],
  "response_phase_started_at": null,
  "clarification_phase_started_at": null,
  "card_started_at": null
}
```

### ‏`assessment_responses.measurement_data`

```json
{ "reaction_time_ms": 4200, "card_turns": 1, "final_rotation": 90 }
```

‏`final_rotation` فقط یکی از مقادیر ۰، ۹۰، ۱۸۰ یا ۲۷۰ را می‌پذیرد.

### ‏`assessment_responses.clarification`

```json
{
  "whole": false,
  "location_marks": [{ "x": 0.3, "y": 0.5 }, { "x": 0.7, "y": 0.5 }],
  "reasons": ["MOVEMENT", "FORM"],
  "text": "این دو قسمت سیاه، حالت دست زدن دارند.",
  "submitted_at": "2026-09-14T10:12:44+03:30"
}
```

### ‏`assessment_responses.coding`

```json
{
  "location": "W",
  "space": [],
  "content": ["A"],
  "synthesis": false,
  "vague": false,
  "pair": false,
  "form_quality": "o",
  "popular": true,
  "determinants": ["F"],
  "cognitive_codes": [],
  "thematic_codes": [],
  "notes": ""
}
```


### ‏`assessment_analyses.calculated_data`

```json
{
  "coding_system": "R-PAS",
  "R": 18,
  "coded": 18,
  "variables": {
    "ADMINISTRATION": [{ "key": "R", "label": "…", "value": 18, "format": "count" }],
    "ENGAGEMENT": [], "PERCEPTION": [], "SELF_OTHER": [], "STRESS": []
  },
  "findings": [{ "domain": "STRESS", "text": "…", "basis": ["MC-PPD"], "confidence": "MODERATE" }],
  "caveats": ["…", "…"]
}
```


## ۱۱. خلاصه‌ی قیدها

| قید                                 | جدول             | ستون‌ها                               |
| ----------------------------------- | ---------------- | ------------------------------------- |
| `users_email_ci_unique`             | ‏`users`         | `Lower(email)`                        |
| `unique_patient_psychologist`       | روابط            | `(patient_id, psychologist_id)`       |
| `unique_definition_version`         | ‏`test_versions` | `(test_definition_id, version)`       |
| `unique_version_phase_kind`         | ‏`test_phases`   | `(test_version_id, kind)`             |
| `unique_version_card_number`        | ‏`test_cards`    | `(test_version_id, card_number)`      |
| `unique_assessment_client_response` | پاسخ‌ها          | `(assessment_id, client_response_id)` |
| `unique_assessment_sequence`        | پاسخ‌ها          | `(assessment_id, sequence)`           |
| `unique_conversation_participant`   | شرکت‌کنندگان     | `(conversation_id, user_id)`          |

## ۱۲. ایندکس‌ها

| نوع      | مورد                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| تک‌ستونی | ‏`users.email` · `users.role` · `users.created_at`                                 |
| تک‌ستونی | ‏`relationships.patient_id` · `.psychologist_id` · `.status`                       |
| تک‌ستونی | ‏`sessions.patient_id` · `.psychologist_id` · `.status` · `.created_at`            |
| تک‌ستونی | ‏`responses.assessment_id` · `.card_id`                                            |
| تک‌ستونی | ‏`messages.conversation_id` · `.created_at` · `conversations.updated_at`           |
| تک‌ستونی | ‏`audit_logs.action` · `.created_at` · `psychologist_profiles.verification_status` |
| ترکیبی   | ‏`sessions(patient_id, status)`                                                    |
| ترکیبی   | ‏`messages(conversation_id, created_at)`                                           |
| ترکیبی   | ‏‏`audit_logs(target_type, target_id)`                                             |

## ۱۴. سیاست حذف

| رابطه                                   | رفتار         | چرا                                                            |
| --------------------------------------- | ------------- | -------------------------------------------------------------- |
| کاربر ← پروفایل، مدارک، افتخارات        | `CASCADE`     | داده‌ی شخصی با حساب می‌رود                                     |
| کاربر ← گفت‌وگو و پیام                  | `CASCADE`     | ‏—                                                             |
| جلسه ← پاسخ، تحلیل، گزارش               | `CASCADE`     | پرونده یک واحد است                                             |
| پروفایل/رابطه/نسخه ← جلسه               | **`PROTECT`** | پرونده‌ی آزمون نباید به‌طور تصادفی نابود شود (BR-12)           |
| کارت و مرحله ← پاسخ                     | **`PROTECT`** | پاسخ بدون کارتش بی‌معنی است                                    |
| ‏`media_assets` ← کارت                  | `SET_NULL`    | حذف فایل، کارت را از بین نمی‌برد                               |
| کاربر ← `coded_by` و `audit_logs.actor` | `SET_NULL`    | رکورد باقی می‌ماند، هویت کنشگر از ایمیل غیرنرمال خوانده می‌شود |
