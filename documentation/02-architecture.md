---
title: معماری سیستم
version: 3
language: fa
updated: 1405-06-23
tags:
  - architecture
  - backend
  - frontend
  - security
  - realtime
related:
  - "[[00-overview]]"
  - "[[01-requirements]]"
  - "[[03-data-model-er]]"
  - "[[04-api-design]]"
  - "[[06-development-guide]]"
  - "[[07-deployment-operations]]"
---

# ۰۲ — معماری سیستم


## ۱. معماری سیستم

```mermaid
flowchart TD
    I["اینترنت"] --> A["Angular 20 (SPA)<br/>Public · Patient · Psychologist · Admin"]
    A -->|"REST · /api/v1"| D
    A -->|"WebSocket · /ws"| D
    D["Django 6 + DRF<br/>روی ASGI (Daphne)"]
    D --> PG[("PostgreSQL 17")]
    D --> R[("Redis 7")]
    D --> CEL["Celery worker"]
    CEL --> R
    CEL --> PG
    D -.->|production| OS[("Object Storage<br/>S3-compatible")]
    classDef todo stroke-dasharray: 5 5,color:#888
```

در توسعه، سرور توسعه‌ی Angular روی `:4200` اجرا می‌شود و `/api` و `/ws` را با‏`proxy.conf.json` به `127.0.0.1:8000` پروکسی می‌کند؛ بنابراین از دید مرورگر همه‌چیز هم‌ریشه است و کوکی `HttpOnly` بدون دردسر cross-site کار می‌کند.

سبک معماری **Modular Monolith** است. در مقیاس این پروژه، microservice فقط هزینه‌ی شبکه و سازگاری داده را اضافه می‌کرد بی‌آنکه منفعتی بدهد؛ در عوض مرزهای دامنه چنان تیز کشیده شده‌اند که جدا کردن بعدی یک دامنه، جابه‌جایی یک پوشه باشد نه بازنویسی.

## ۲. مدل دامنه

| ‏Bounded Context        | اپ                | محتوا                                             |
| ----------------------- | ----------------- | ------------------------------------------------- |
| ‏Identity & Access      | ‏`accounts`       | ‏`User`، توکن، نقش                                |
| ‏Patient / Psychologist | ‏`profiles`       | دو پروفایل، مدارک تأیید، افتخارات                 |
| ‏Relationship           | ‏`relationships`  | ‏`Relationship` — مبنای مجوز دسترسی               |
| ‏Test Catalog           | ‏`catalog`        | تعریف، نسخه، مرحله، کارت                          |
| ‏Assessment             | ‏`assessments`    | جلسه، پاسخ، تحلیل، گزارش، موتور R-PAS             |
| ‏Communication          | ‏`messaging`      | گفت‌وگو، شرکت‌کننده، پیام، مصرف‌کننده‌ی WebSocket |
| ‏Notification           | ‏`notifications`  | اطلاعیه‌ی عمومی                                   |
| ‏Media                  | ‏`media`          | ‏`MediaAsset`                                     |
| ‏Audit                  | ‏`audit`          | ‏`AuditLog` و میان‌افزار زمینه‌ی درخواست          |
| ‏Administration         | ‏`administration` | پنل ادمین (بدون مدل اختصاصی)                      |

## ۳. لایه‌بندی Backend

```mermaid
flowchart LR
    V["View<br/>احراز هویت · مجوز · وضعیت HTTP"] --> S["Serializer<br/>اعتبارسنجی و شکل داده"]
    S --> SV["Service<br/>منطق کسب‌وکار و تراکنش"]
    SV --> M["Model<br/>داده و قیدها"]
    V -.->|"خواندنِ ساده"| SE["Selector<br/>کوئری بهینه"]
    SE --> M
```

## ۴. معماری آزمون

### کاتالوگ در برابر زمان اجرا

```mermaid
flowchart TD
    subgraph کاتالوگ["کاتالوگ — پیکربندی، تغییرناپذیر پس از انتشار"]
        TD["TestDefinition"] --> TV["TestVersion"]
        TV --> PH["TestPhase — RESPONSE / CLARIFICATION"]
        PH --> CD["AssessmentCard + configuration (JSON)"]
    end
    subgraph اجرا["زمان اجرا — داده‌ی هر مراجع"]
        AS["AssessmentSession"] --> RP["AssessmentResponse"]
        AS --> AN["AssessmentAnalysis"]
        AS --> RE["AssessmentReport"]
    end
    TV -.->|"ثبت نسخه‌ی اجراشده"| AS
    CD -.-> RP
```

پیکربندی هر کارت به‌جای ده‌ها ستون nullable در یک `configuration` از نوع JSON نشسته
است، چون ممکن است کارت ۱ پارامتری داشته باشد که کارت ۷ ندارد:

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

### ماشین حالت

دو سطح، که نباید با هم اشتباه شوند:

```mermaid
stateDiagram-v2
    direction LR
    state "status — ذخیره‌شده" as S {
        [*] --> CREATED
        CREATED --> IN_PROGRESS
        IN_PROGRESS --> COMPLETED
    }
    state "stage — محاسبه‌شده" as G {
        [*] --> INTRO
        INTRO --> RESPONSE: start
        RESPONSE --> RESPONSE: پاسخ / کارت بعد
        RESPONSE --> CLARIFICATION: کارت بعد روی کارت دهم
        CLARIFICATION --> CLARIFICATION: روشن‌سازی هر پاسخ
        CLARIFICATION --> REVIEW: آخرین روشن‌سازی
        REVIEW --> COMPLETED: complete
    }
```

تابع `build_state()` در `apps/assessments/state.py` در هر درخواست یک شیء `RunState`
می‌سازد:

| فیلد                                                      | معنی                                   |
| --------------------------------------------------------- | -------------------------------------- |
| ‏`stage`                                                  | مرحله‌ی محاسبه‌شده                     |
| ‏`card` · `card_index` · `total_cards`                    | کارت جاری و جایگاهش                    |
| ‏`card_responses`                                         | پاسخ‌های ثبت‌شده روی همین کارت         |
| ‏`prompted` · `pulled`                                    | آیا یادآوری داده شده / سقف پاسخ پر شده |
| ‏`target` · `clarification_index` · `clarification_total` | پاسخِ در حال روشن‌سازی                 |
| ‏`min_responses` · `max_responses`                        | از `configuration` کارت                |

چون `stage` مشتق است و ذخیره نمی‌شود، هیچ‌گاه «حالت ذخیره‌شده‌ی خراب» پدید نمی‌آید:
تنها منبع حقیقت، چند ستون ساده و شمارش پاسخ‌هاست.

### تراکنش و idempotency

ثبت پاسخ:

```
if existing(client_response_id): return existing          ← مسیر سریع
try: INSERT
except IntegrityError: return existing                    ← مسابقه‌ی دو تلاش هم‌زمان
```

تکمیل آزمون:

```
BEGIN
    SELECT ... FOR UPDATE                 ← قفل جلسه
    if status == COMPLETED: return        ← ترمینال بودن (BR-08)
    require stage == REVIEW
    status ← COMPLETED
    AssessmentAnalysis(status=PENDING)    ← get_or_create
    AuditLog(PATIENT_COMPLETED_ASSESSMENT)
COMMIT
→ transaction.on_commit → صف Celery       ← بیرون از تراکنش (BR-09، BR-10)
```

اگر کارگزار صف در دسترس نباشد، تابع `enqueue_analysis` همان‌جا و درجا محاسبه می‌کند و هشدار می‌دهد؛ این مسیر برای ماشین توسعه‌دهنده است، نه production. علاوه بر آن، ‏`ensure_analysis()` هنگام خواندن پروتکل، تحلیلِ در `PENDING` مانده را محاسبه می‌کند تا روان‌شناس هرگز به صفحه‌ی خالی نرسد.

## ۵. معماری داده

```mermaid
flowchart TD
    PG[("PostgreSQL")] --> ID["هویت<br/>users · profiles · documents · achievements"]
    PG --> BU["کسب‌وکار<br/>relationships · conversations · messages · announcements"]
    PG --> CAT["کاتالوگ<br/>test_definitions · versions · phases · cards"]
    PG --> RUN["اجرا<br/>sessions · responses · analyses · reports"]
    PG --> OPS["عملیات<br/>audit_logs · media_assets · token blacklist"]
    RUN --> J["ستون‌های JSON<br/>administration · measurement_data<br/>clarification · coding · calculated_data"]
```


| ستون                                     | چرا JSON                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| ‏`test_cards.configuration`              | پارامترهای هر کارت متفاوت و نسخه‌پذیرند                         |
| ‏`assessment_sessions.administration`    | شمارنده‌های اجرایی R-PAS که ممکن است رشد کنند                   |
| ‏`assessment_responses.measurement_data` | اندازه‌گیری‌ها ممکن است با نسخه‌ی آزمون عوض شوند                |
| ‏`assessment_responses.clarification`    | ساختار تودرتو با آرایه‌ی مختصات                                 |
| ‏`assessment_responses.coding`           | مجموعه‌ی کدها سیستم‌وابسته است (R-PAS در برابر Exner)           |
| ‏`assessment_analyses.calculated_data`   | خروجی الگوریتم نسخه‌دار؛ شکلش با `algorithm_version` عوض می‌شود |

‏Redis **دیتابیس اصلی نیست**. سه کار می‌کند: cache و شمارنده‌ی محدودسازی نرخ، لایه‌ی کانال برای WebSocket، و کارگزار صف Celery. فایل‌ها هم در دیتابیس ذخیره نمی‌شوند: فقط متادیتا در media_assets` و خود فایل روی سیستم‌فایل (توسعه) یا ‏Object Storage (production).

## ۶. معماری API
- **نسخه‌بندی:** همه‌چیز زیر `/api/v1/`؛ تنها استثنا `/health/` است که زیرساخت استنه بخشی از قرارداد.
- **قالب یکسان خطا:** هر شکست با همین شکل برمی‌گردد و کلاینت هم دقیقاً همین را انتظار دارد:

  ```json
  { "detail": "پیام برای کاربر", "code": "invalid", "errors": { "email": ["..."] } }
  ```

  این کار در `common/exceptions.py::api_exception_handler` انجام می‌شود. بدنه‌ی پیش‌فرض DRF برای خطای اعتبارسنجی یک دیکشنری لخت `{field: [...]}` است که کلاینت  نمی‌تواند پیام بنر از آن بسازد؛ پس بسته‌بندی می‌شود. پیام‌های انگلیسی کتابخانه‌ها  نیز با معادل فارسی جایگزین می‌شوند.

- **صفحه‌بندی موضعی، نه سراسری:** بیشتر فهرست‌ها آرایه‌ی ساده برمی‌گردانند و فقط سه  اندپوینت صفحه‌بندی دارند (`/psychologists/` با ۱۲، `/admin/users/` با ۲۰،  ‏`/admin/audit-logs/` با ۲۵). دلیلش این است که کامپوننت صفحه‌بندی فرانت‌اند شمارش  صفحه را از `count / pageSize` می‌سازد و تغییر این اعداد بی‌صدا خرابش می‌کند.
- **محدودسازی نرخ:** دو دامنه — `auth` با ۲۰ درخواست در دقیقه و `write` با ۱۲۰.   محدودکننده **fail-open** است: اگر Redis نباشد، درخواست رد نمی‌شود بلکه در لاگ   امنیتی ثبت می‌گردد. در دسترس نبودن cache یک مسئله‌ی دسترس‌پذیری است، نه مجوز.
- **مستندسازی:** `drf-spectacular` شمای OpenAPI 3 را از خود کد می‌سازد
## ۷. معماری احراز هویت

```mermaid
sequenceDiagram
    participant FE as Angular
    participant BE as Django

    FE->>BE: POST /auth/login/ {email, password}
    BE-->>FE: {access, me} + Set-Cookie (refresh · HttpOnly · Path=/api/v1/auth/)
    Note over FE: توکن دسترسی فقط در حافظه (Signal) — نه localStorage
    FE->>BE: هر درخواست با Authorization: Bearer <access>
    BE-->>FE: 401 (توکن منقضی)
    FE->>BE: POST /auth/refresh/ (کوکی خودکار ارسال می‌شود)
    BE->>BE: ابطال توکن قبلی + صدور توکن تازه (چرخش)
    BE-->>FE: {access} + کوکی تازه
    FE->>BE: تکرار درخواست اصلی
```

| تصمیم                              | دلیل                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| توکن دسترسی در بدنه و فقط در حافظه | در دسترس XSS از طریق `localStorage` قرار نمی‌گیرد                                |
| توکن تمدید در کوکی `HttpOnly`      | جاوااسکریپت هرگز آن را نمی‌بیند                                                  |
| ‏`Path=/api/v1/auth/`              | کوکی فقط به اندپوینت‌های احراز هویت فرستاده می‌شود                               |
| چرخش + لیست سیاه                   | یک توکن تمدید فقط یک بار مصرف می‌شود؛ سرقتِ بازپخش‌شده بی‌اثر است                |
| عمر ۱۵ دقیقه / ۱۴ روز              | تعادل میان امنیت و تعداد دفعات تمدید                                             |
| ‏`SameSite=Lax` و `Secure`         | در production؛ در توسعه `Secure=False` چون HTTP ساده است                         |
| ۴۰۱ همیشه با پیام عمومی            | پیام داخلی کتابخانه برای کاربر بی‌معنی است و کلاینت ۴۰۱ را ساختاری مدیریت می‌کند |

## ۸. معماری بلادرنگ (RealTime)

یک اندپوینت: `/ws/`.

```mermaid
sequenceDiagram
    participant FE as Angular
    participant WS as RealtimeConsumer
    participant CL as Channel layer (Redis)

    FE->>WS: اتصال
    WS-->>FE: accept
    FE->>WS: {"type":"auth","token":"<access>"}
    WS->>WS: اعتبارسنجی توکن
    WS->>CL: group_add("user.<id>")
    WS->>WS: mark_online + انتشار حضور به طرف‌های گفت‌وگو
    Note over FE,WS: هر فریم پیش از auth نادیده گرفته و سوکت بسته می‌شود (کد ۴۰۰۱)
```


## ۹. معماری Frontend

‏Angular 20 با **Standalone Components**، **Signals** و `ChangeDetectionStrategy.OnPush`.

رابط کاربری دو حالت دارد: داشبورد (هدر + سایدبار شیشه‌ای در دسکتاپ، Dock پایین در موبایل) و **حالت تمرکز** برای اجرای آزمون — بدون سایدبار، بدون اعلان، بدون ناوبری نامرتبط. جزئیات در [[08-frontend]].

## ۱۰. معماری امنیت

```mermaid
flowchart TD
    B["مرورگر"] --> C1["CORS + CSRF"] --> C2["احراز هویت JWT"]
    C2 --> C3["مجوز نقش<br/>IsPatient · IsPsychologist · IsAdmin"]
    C3 --> C4["مجوز سطح شیء<br/>readable_session · own_session"]
    C4 --> C5["اعتبارسنجی Serializer"]
    C5 --> C6["قیدهای دیتابیس"]
    C4 --> AU["AuditLog"]
    C2 --> TH["محدودسازی نرخ"]
```

## ۱۱. مشاهده‌پذیری

سه لایه‌ی لاگ در اپلیکیشن وجود دارد که مستقل از یکدیگر فعالیت میکنند:

| ‏Logger                | عملکرد                                                        |
| ---------------------- | ------------------------------------------------------------- |
| ‏`rorschach.app`       | خطاهای برنامه، استثنای مدیریت‌نشده، در دسترس نبودن کارگزار صف |
| ‏`rorschach.audit`     | رویدادهای دامنه‌ای که در `audit_logs` هم ثبت می‌شوند          |
| ‏‏`rorschach.security` | ورود ناموفق، پاسخ ۴۰۱/۴۰۳، از کار افتادن محدودکننده‌ی نرخ     |

## ۱۲. خلاصه‌ی تصمیمات معماری

| ‏#  | تصمیم                                 | جایگزین رد شده          | دلیل                                              |
| --- | ------------------------------------- | ----------------------- | ------------------------------------------------- |
| ۱‏  | مونولیت ماژولار                       | میکروسرویس              | مقیاس پروژه؛ پیچیدگی شبکه و سازگاری بی‌دلیل       |
| ‏۲  | ‏PostgreSQL + JSONB                   | ‏MongoDB                | نیاز هم‌زمان به تراکنش، قید یکتایی و انعطاف JSON  |
| ‏۳  | موتور آزمون داده‌محور و نسخه‌پذیر     | صفحات ثابت Angular      | تغییر روش‌شناسی نباید هسته را بازنویسی کند        |
| ‏۴  | مرحله‌ی اجرا محاسبه‌شده، نه ذخیره‌شده | ستون `stage`            | حالت ذخیره‌شده‌ی ناسازگار ممکن نمی‌شود            |
| ‏۵  | توکن تمدید در کوکی `HttpOnly`         | ذخیره در `localStorage` | کاهش سطح حمله‌ی XSS                               |
| ‏۶  | احراز هویت WebSocket در اولین فریم    | توکن در query string    | توکن در لاگ پروکسی نمی‌نشیند                      |
| ‏۷  | تحلیل غیرهمزمان + محاسبه هنگام خواندن | فقط همزمان یا فقط صف    | تکمیل آزمون منتظر نمی‌ماند و تحلیل هم گیر نمی‌کند |
| ‏۸  | محدودکننده‌ی نرخ fail-open            | ‏fail-closed            | قطعی cache نباید ورود را غیرممکن کند              |
| ‏۹  | صفحه‌بندی موضعی                       | صفحه‌بندی سراسری DRF    | قرارداد موجود فرانت‌اند آرایه‌ی ساده انتظار دارد  |


