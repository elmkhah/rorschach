---
title: دیاگرام‌های رفتاری
doc_id: DOC-05
version: 2
status: as-built
architecture_version: Architecture v2 — as-built
code_revision: 10c22fe
language: fa
updated: 1405-06-23
tags:
  - sequence
  - state-machine
  - flows
related:
  - "[[01-requirements]]"
  - "[[02-architecture]]"
  - "[[04-api-design]]"
  - "[[10-assessment-rpas]]"
---

# ۰۵ — دیاگرام‌های رفتاری

> همه‌ی دیاگرام‌های این سند با کد پیاده‌شده تطبیق داده شده‌اند: نام اندپوینت‌ها،
> ترتیب گام‌ها و مرز تراکنش‌ها همان چیزی است که در
> `backend/apps/*/services.py` اتفاق می‌افتد.

## ۱. ثبت‌نام و تأیید روان‌شناس

```mermaid
sequenceDiagram
    actor PS as روان‌شناس
    participant FE as Angular
    participant BE as Django
    actor AD as مدیر

    PS->>FE: ثبت‌نام با نقش روان‌شناس
    FE->>BE: POST /auth/register/
    BE->>BE: User + PsychologistProfile (REGISTERED)
    BE-->>FE: 201 {access, me} + کوکی تمدید
    FE-->>PS: هدایت به صفحه‌ی «در انتظار تأیید»

    PS->>FE: انتخاب مدارک
    FE->>BE: POST /psychologists/me/documents/ (multipart)
    BE->>BE: اعتبارسنجی حجم و نوع · ذخیره · REGISTERED ← PENDING_VERIFICATION
    BE->>BE: AuditLog(PSYCHOLOGIST_DOCUMENTS_UPLOADED)
    BE-->>FE: 200 {me}

    AD->>BE: GET /admin/psychologists/?verification_status=PENDING_VERIFICATION
    alt تأیید
        AD->>BE: POST /admin/psychologists/{id}/verify/ {decision: APPROVE}
        BE->>BE: APPROVED + AuditLog(PSYCHOLOGIST_PROFILE_APPROVED)
    else رد
        AD->>BE: {decision: REJECT, note}
        BE->>BE: REJECTED — روان‌شناس می‌تواند مدارک تازه بفرستد
    else تعلیق
        AD->>BE: {decision: SUSPEND, note}
        BE->>BE: SUSPENDED
    end
```

تا وقتی وضعیت `APPROVED` نشود، نگهبان `IsApprovedPsychologist` جلوی دسترسی به بخش
بالینی را می‌گیرد و فرانت‌اند هم کاربر را روی صفحه‌ی انتظار نگه می‌دارد (BR-01).

## ۲. برقراری رابطه

```mermaid
sequenceDiagram
    actor P as مراجع
    participant BE as Django
    actor PS as روان‌شناس

    P->>BE: GET /psychologists/?search=…
    BE-->>P: فهرست تأییدشده‌ها + وضعیت رابطه‌ی خودِ مراجع
    P->>BE: POST /relationships/ {psychologist_id}
    BE->>BE: بررسی APPROVED بودن و فعال بودن حساب
    BE->>BE: ردیف PENDING (یا احیای ردیف قبلی) + AuditLog(RELATIONSHIP_CREATED)
    BE-->>P: 201

    PS->>BE: GET /relationships/?status=PENDING
    alt تأیید
        PS->>BE: POST /relationships/{id}/approve/
        BE->>BE: ACTIVE + ساخت گفت‌وگوی دونفره + AuditLog(RELATIONSHIP_APPROVED)
    else رد
        PS->>BE: POST /relationships/{id}/reject/
        BE->>BE: REJECTED + AuditLog(RELATIONSHIP_REJECTED)
    end
```

```mermaid
stateDiagram-v2
    [*] --> PENDING: درخواست مراجع
    PENDING --> ACTIVE: تأیید روان‌شناس
    PENDING --> REJECTED: رد روان‌شناس
    PENDING --> REVOKED: انصراف مراجع
    ACTIVE --> REVOKED: لغو هر یک از دو طرف یا ادمین
    REJECTED --> PENDING: درخواست دوباره
    REVOKED --> PENDING: درخواست دوباره
```

تصمیم درباره‌ی درخواست فقط کار روان‌شناس است؛ لغو را هر دو طرف یا ادمین می‌توانند
انجام دهند.

## ۳. اجرای کامل آزمون

```mermaid
sequenceDiagram
    actor P as مراجع
    participant FE as Angular
    participant BE as Django
    participant DB as PostgreSQL

    P->>FE: «شروع آزمون»
    FE->>BE: POST /assessments/sessions/ {psychologist_id}
    BE->>DB: جلسه‌ی CREATED با سه‌گانه‌ی مراجع/روان‌شناس/رابطه + نسخه‌ی منتشرشده
    BE-->>FE: 201 {session}

    FE->>BE: POST /sessions/{id}/start/
    BE->>DB: IN_PROGRESS · مرحله=RESPONSE · کارت=۱ + AuditLog(PATIENT_STARTED_ASSESSMENT)
    BE-->>FE: RunState (stage=RESPONSE، کارت ۱ از ۱۰)

    loop کارت ۱ تا ۱۰
        FE-->>P: نمایش کارت و پرسش استاندارد
        Note over FE: تایمر واکنش و پیش‌نویس در localStorage
        P->>FE: نوشتن پاسخ و Enter
        FE->>BE: POST /sessions/{id}/responses/ + client_response_id
        BE->>DB: ثبت پاسخ با زمان سرور و measurement_data
        BE-->>FE: 201 {response, state}
        P->>FE: «کارت بعدی»
        FE->>BE: POST /sessions/{id}/next/
        alt فقط یک پاسخ و یادآوری داده نشده
            BE-->>FE: {prompt: true, state}
            FE-->>P: متن استاندارد یادآوری — بدون پیشروی
        else
            BE->>DB: کارت بعد، یا در کارت دهم: مرحله ← CLARIFICATION
            BE-->>FE: {prompt: false, state}
        end
    end

    loop پاسخ ۱ تا R
        FE-->>P: کارت + متن خود فرد + پرسش «چه چیزی باعث شد این‌طور به نظر برسد؟»
        P->>FE: علامت‌گذاری محل + انتخاب دلایل + توضیح اختیاری
        FE->>BE: POST /sessions/{id}/clarifications/ {response_id, whole, location_marks, reasons, text}
        BE->>DB: ذخیره در ستون clarification — بدون دست زدن به response_text (BR-06)
        BE-->>FE: RunState (گام بعدی یا REVIEW)
    end

    FE->>BE: POST /sessions/{id}/complete/
    BE-->>FE: RunState (stage=COMPLETED)
    FE-->>P: «آزمون با موفقیت ثبت شد» — و نه چیز دیگری (BR-14)
```

## ۴. ادامه پس از بستن مرورگر

```mermaid
sequenceDiagram
    actor P as مراجع
    participant FE as Angular
    participant BE as Django

    Note over P,FE: کاربر روی کارت ۴ است؛ مرورگر بسته می‌شود
    FE->>BE: POST /sessions/{id}/events/ {type: TAB_HIDDEN}
    Note over BE: شمارنده‌ی مشاهده‌ی اجرایی

    P->>FE: ورود دوباره
    FE->>BE: GET /assessments/sessions/?status=IN_PROGRESS
    BE-->>FE: جلسه‌ی باز
    FE-->>P: «ادامه‌ی آزمون»
    P->>FE: ادامه
    FE->>BE: GET /sessions/{id}/state/
    BE->>BE: build_state() از روی status + current_phase + current_card + current_step
    BE-->>FE: RunState — دقیقاً کارت ۴
```

هیچ «حالت ذخیره‌شده‌ای» برای بازیابی وجود ندارد که بتواند خراب شود: مرحله در هر
درخواست از نو محاسبه می‌شود (BR-05). پیش‌نویس متن ثبت‌نشده در `localStorage` مرورگر
است و پس از ثبت یا پایان آزمون پاک می‌شود.

## ۵. ثبت تکراری پاسخ (idempotency)

```mermaid
sequenceDiagram
    participant FE as Angular
    participant BE as Django
    participant DB as PostgreSQL

    FE->>BE: POST /responses/ (client_response_id = X)
    BE->>DB: INSERT
    DB-->>BE: OK
    BE--xFE: قطعی شبکه — پاسخ به کلاینت نمی‌رسد
    Note over FE: تلاش مجدد خودکار (۳ بار، فاصله‌ی پلکانی)
    FE->>BE: POST /responses/ (همان client_response_id = X)
    BE->>DB: SELECT ... WHERE client_response_id = X
    DB-->>BE: رکورد موجود
    BE-->>FE: 201 با همان پاسخ — بدون رکورد تکراری
```

اگر دو تلاش **هم‌زمان** برسند، مسیر سریع هر دو خالی است و هر دو INSERT می‌زنند؛
آن‌گاه قید یکتایی `unique_assessment_client_response` یکی را رد می‌کند و کد،
`IntegrityError` را می‌گیرد و رکورد برنده را می‌خواند. یعنی تضمین در **دیتابیس**
است نه در منطق برنامه (BR-07).

## ۶. تکمیل آزمون: تراکنش و کار پس از commit

```mermaid
sequenceDiagram
    participant BE as services.complete()
    participant DB as PostgreSQL
    participant Q as Celery
    participant W as Worker

    BE->>DB: BEGIN
    BE->>DB: SELECT ... FOR UPDATE (قفل جلسه)
    alt از قبل COMPLETED
        BE-->>BE: بازگشت بی‌اثر (BR-08)
    else
        BE->>BE: بررسی stage == REVIEW وگرنه 409
        BE->>DB: status ← COMPLETED · completed_at
        BE->>DB: AssessmentAnalysis(status=PENDING) — get_or_create
        BE->>DB: AuditLog(PATIENT_COMPLETED_ASSESSMENT)
        BE->>DB: COMMIT
    end
    Note over BE,DB: در صورت خطا ROLLBACK — جلسه نیمه‌تمام نمی‌ماند (BR-09)
    BE->>Q: on_commit → generate_analysis.delay(session_id)
    Q->>W: اجرای تحلیل
    W->>DB: calculated_data + status=DONE
```

سه نکته‌ی طراحی در این دیاگرام:

1. **قفل صریح** (`SELECT ... FOR UPDATE`) تا دو کلیک هم‌زمان «ثبت نهایی» دو تحلیل
   نسازند.
2. **صف پس از commit** است، نه داخل تراکنش. اگر داخل تراکنش بود، worker می‌توانست
   پیش از commit اجرا شود و جلسه را پیدا نکند (BR-10).
3. **مسیر پشتیبان:** اگر worker خاموش باشد، `ensure_analysis()` هنگام نخستین خواندن
   پروتکل، تحلیل را همان‌جا محاسبه می‌کند. محاسبه‌ی متغیرهای خام چند ده سطر حساب روی
   حداکثر چند ده ردیف است و هزینه‌ای ندارد.

## ۷. کدگذاری و تحلیل توسط روان‌شناس

```mermaid
sequenceDiagram
    actor PS as روان‌شناس
    participant BE as Django
    participant DB as PostgreSQL

    PS->>BE: GET /sessions/{id}/detail/
    BE->>BE: readable_session() — مالک؟ روان‌شناسِ ACTIVE؟ ادمین؟
    BE->>DB: AuditLog(PSYCHOLOGIST_VIEWED_ASSESSMENT)
    BE->>BE: ensure_analysis()
    BE-->>PS: جلسه + کارت‌ها + پاسخ‌ها + تحلیل

    loop برای هر پاسخ
        PS->>BE: PUT /sessions/{id}/responses/{rid}/coding/
        BE->>BE: normalize_coding() — کدهای ناشناخته دور ریخته می‌شوند
        BE->>DB: ستون coding + coded_by + coded_at (بدون دست زدن به متن خام)
        BE->>DB: AuditLog(RESPONSE_CODED)
    end

    PS->>BE: POST /sessions/{id}/analysis/
    BE->>BE: compute_rpas(responses, administration)
    BE->>DB: calculated_data + algorithm_version + status=DONE
    BE->>DB: AuditLog(ANALYSIS_GENERATED)
    BE-->>PS: متغیرها در پنج حوزه + یافته‌های غیرقطعی + هشدارها
```

کدگذاری پیش از تکمیل آزمون `409` می‌گیرد، و روان‌شناسی که مالک جلسه نیست `403`.

## ۸. مجوز دسترسی در سطح شیء

```mermaid
flowchart TD
    R["GET /assessments/sessions/{id}/detail/"] --> AU{"توکن معتبر؟"}
    AU -->|خیر| E1["401 — احراز هویت لازم است"]
    AU -->|بله| RO{"نقش روان‌شناس یا ادمین؟"}
    RO -->|خیر| E2["403"]
    RO -->|بله| EX{"جلسه وجود دارد؟"}
    EX -->|خیر| E3["404"]
    EX -->|بله| OW{"ادمین؟"}
    OW -->|بله| OK["200"]
    OW -->|خیر| LK{"روان‌شناسِ همین جلسه<br/>و رابطه هنوز ACTIVE؟"}
    LK -->|خیر| E4["403"]
    LK -->|بله| AL["AuditLog"] --> OK
```

دو لایه پشت سر هم: کلاس مجوز نقش پیش از ورود به view، و بررسی سطح شیء داخل آن.
لغو رابطه بلافاصله دسترسی را می‌بندد ولی داده حذف نمی‌شود (BR-12 در برابر BR-13).

## ۹. چت و بلادرنگ

```mermaid
sequenceDiagram
    actor A as کاربر الف
    participant FE_A as مرورگر الف
    participant BE as Django + Channels
    participant FE_B as مرورگر ب
    actor B as کاربر ب

    FE_A->>BE: اتصال به /ws/
    FE_A->>BE: {"type":"auth","token":"…"}
    BE->>BE: group_add("user.A") + mark_online
    BE-->>FE_B: {"type":"presence","user_id":"A","is_online":true}

    A->>FE_A: نوشتن پیام
    FE_A->>BE: POST /conversations/{id}/messages/
    BE->>BE: ذخیره‌ی پیام + به‌روزرسانی updated_at گفت‌وگو
    BE-->>FE_A: 201 {message}
    BE-->>FE_B: {"type":"message.new","message":{…}}

    B->>FE_B: باز کردن گفت‌وگو
    FE_B->>BE: POST /conversations/{id}/read/
    BE-->>FE_A: {"type":"message.read","conversation_id":"…","read_at":"…"}

    A->>FE_A: تایپ کردن
    FE_A->>BE: {"type":"typing","conversation_id":"…"}
    BE-->>FE_B: {"type":"typing","user_id":"A"}
```

نوشتن همیشه REST است و سوکت فقط اطلاع می‌دهد؛ بنابراین قواعد مجوز فقط در یک جا
نوشته شده‌اند. اگر ارسال روی سوکت شکست بخورد، درخواست REST همچنان موفق است.

## ۱۰. تمدید خودکار نشست

```mermaid
sequenceDiagram
    participant FE as auth.interceptor
    participant BE as Django

    FE->>BE: GET /assessments/sessions/ (Bearer توکن منقضی)
    BE-->>FE: 401
    FE->>BE: POST /auth/refresh/ (کوکی HttpOnly خودکار می‌رود)
    alt کوکی معتبر
        BE->>BE: ابطال توکن قبلی + صدور توکن تازه (چرخش)
        BE-->>FE: 200 {access} + کوکی تازه
        FE->>BE: تکرار درخواست اصلی با توکن تازه
        BE-->>FE: 200
    else کوکی نامعتبر یا منقضی
        BE-->>FE: 401 «نشست منقضی شده است.»
        FE->>FE: پاک کردن حالت و هدایت به صفحه‌ی ورود
    end
```

تمدید فقط **یک بار** برای هر درخواست تلاش می‌شود تا حلقه‌ی بی‌پایان شکل نگیرد.

## ۱۱. مسیر بحرانی end-to-end

```mermaid
flowchart LR
    R["ثبت‌نام مراجع و روان‌شناس"] --> V["تأیید روان‌شناس توسط ادمین"]
    V --> L["ورود"] --> S["درخواست و تأیید ارتباط"]
    S --> ST["شروع آزمون"] --> AC["پاسخ به ۱۰ کارت"]
    AC --> CP["روشن‌سازی هر پاسخ"] --> C["ثبت نهایی"]
    C --> PL["ورود روان‌شناس"] --> VW["مشاهده‌ی پروتکل"]
    VW --> CO["کدگذاری"] --> AN["تحلیل"]
```

این مسیر به‌صورت **یک تست خودکار و فقط از راه HTTP** پیاده شده است:
`backend/apps/assessments/tests/test_critical_path.py`. هیچ‌جای آن به لایه‌ی سرویس
مستقیم دست نمی‌زند، پس اگر قرارداد API بشکند، همین تست شکست می‌خورد.

## ۱۲. حالت‌ها در یک نگاه

```mermaid
stateDiagram-v2
    direction LR
    state "تأیید روان‌شناس" as V {
        [*] --> REGISTERED
        REGISTERED --> PENDING_VERIFICATION
        PENDING_VERIFICATION --> APPROVED
        PENDING_VERIFICATION --> REJECTED
        REJECTED --> PENDING_VERIFICATION
        APPROVED --> SUSPENDED
    }
    state "رابطه" as R {
        [*] --> PENDING
        PENDING --> ACTIVE
        PENDING --> REJECTED2
        ACTIVE --> REVOKED
    }
    state "مرحله‌ی اجرا" as G {
        [*] --> INTRO
        INTRO --> RESPONSE
        RESPONSE --> CLARIFICATION
        CLARIFICATION --> REVIEW
        REVIEW --> COMPLETED2
    }
```
