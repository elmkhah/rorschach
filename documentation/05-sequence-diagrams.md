---
title: دیاگرام‌های رفتاری
doc_id: DOC-05
version: 1
status: draft
architecture_version: Architecture v1
source: معماری رورشاخ - سندنگار Google.pdf
language: fa
tags:
  - sequence
  - state-machine
  - flows
related:
  - "[[01-requirements]]"
  - "[[02-architecture]]"
  - "[[04-api-design]]"
---
# ۰۵ — دیاگرام‌های رفتاری

## ۱. ثبت‌نام و تأیید روان‌شناس

```mermaid
sequenceDiagram
    actor PS as Psychologist
    participant FE as Angular
    participant BE as Django + DRF
    actor AD as Admin

    PS->>FE: Register (نقش: روان‌شناس)
    FE->>BE: POST /api/v1/auth/register/
    BE-->>FE: REGISTERED
    PS->>BE: ارسال مدارک حرفه‌ای
    BE->>BE: verification_status = PENDING_VERIFICATION
    AD->>BE: View psychologist / Verify documents
    alt تأیید
        AD->>BE: Approve
        BE->>BE: APPROVED + AuditLog(PSYCHOLOGIST_PROFILE_APPROVED)
    else رد
        AD->>BE: Reject
        BE->>BE: REJECTED
    end
```

```mermaid
stateDiagram-v2
    [*] --> REGISTERED
    REGISTERED --> PENDING_VERIFICATION
    PENDING_VERIFICATION --> APPROVED
    PENDING_VERIFICATION --> REJECTED
```

هر کسی نمی‌تواند خودش را روان‌شناس معرفی کند؛ این مرحله mandatory است. عملیات ادمین: View، Verify documents، Approve، Reject، Suspend.

## ۲. برقراری رابطه Patient ↔ Psychologist

```mermaid
sequenceDiagram
    actor P as Patient
    participant BE as Backend
    actor PS as Psychologist

    P->>BE: جست‌وجوی روان‌شناس
    P->>BE: POST /relationships/ (درخواست)
    BE->>BE: status = PENDING + AuditLog(RELATIONSHIP_CREATED)
    BE-->>PS: Notification
    alt تأیید
        PS->>BE: Approve
        BE->>BE: status = ACTIVE + AuditLog(RELATIONSHIP_APPROVED)
    else رد
        PS->>BE: Reject
        BE->>BE: status = REJECTED
    end
```

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> ACTIVE: approve
    PENDING --> REJECTED: reject
    ACTIVE --> REVOKED: revoke
```

## ۳. اجرای کامل آزمون

```mermaid
sequenceDiagram
    actor P as Patient
    participant FE as Angular
    participant BE as Django + DRF
    participant DB as PostgreSQL
    participant OS as Object Storage

    P->>FE: Start Assessment
    FE->>BE: POST /assessments/sessions/
    BE->>DB: session (CREATED) با test_definition_id + test_version_id + relationship
    BE-->>FE: sessionId
    FE->>BE: POST /sessions/{id}/start/
    BE->>DB: status = IN_PROGRESS + AuditLog(PATIENT_STARTED_ASSESSMENT)
    BE-->>FE: current phase / card / step

    loop برای هر Card
        FE->>OS: دریافت تصویر کارت
        FE->>FE: شروع تایمر (client_started_at)
        FE->>BE: save draft (debounced)
        FE->>BE: POST /sessions/{id}/responses/ + client_response_id
        BE->>DB: ثبت response + measurement_data + timing سروری
        FE->>BE: POST /sessions/{id}/next/
        BE-->>FE: وضعیت بعدی (مرجع: Backend)
    end

    FE->>BE: POST /sessions/{id}/complete/
    BE->>DB: transaction → COMPLETED + analysis event + notification event
    BE-->>FE: Assessment completed successfully
```

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> IN_PROGRESS: start
    IN_PROGRESS --> PAUSED: pause
    IN_PROGRESS --> COMPLETED: finish
    PAUSED --> IN_PROGRESS: resume
```

وضعیت‌های کامل: `CREATED`، `IN_PROGRESS`، `PAUSED`، `COMPLETED`، `ABANDONED`، `CANCELLED`.

## ۴. Pause / Resume و بازیابی پس از crash

```mermaid
sequenceDiagram
    actor P as Patient
    participant FE as Angular
    participant BE as Backend

    Note over P,FE: کاربر روی Card 4 است و مرورگر بسته می‌شود
    P->>FE: Login مجدد
    FE->>BE: GET /assessments/sessions/{id}/
    BE-->>FE: Session: Phase 1 / Card 4 / Step 2
    FE-->>P: Continue Assessment
    P->>FE: ادامه
    FE->>BE: POST /sessions/{id}/resume/
    BE-->>FE: IN_PROGRESS
```

Frontend باید state را با Backend سینک کند (`Frontend State ↕ Backend State`)، نه اینکه frontend حقیقت نهایی باشد.

## ۵. ثبت پاسخ تکراری (Idempotency)

```mermaid
sequenceDiagram
    participant FE as Angular
    participant BE as Backend
    participant DB as PostgreSQL

    FE->>BE: POST /responses/ (client_response_id = X)
    BE->>DB: INSERT
    Note over FE,BE: قطعی شبکه — پاسخ به کلاینت نمی‌رسد
    FE->>BE: ارسال مجدد همان درخواست (client_response_id = X)
    BE->>DB: INSERT → نقض unique constraint
    BE-->>FE: همان response قبلی (بدون رکورد تکراری)
```

## ۶. تکمیل آزمون: transaction و رویدادها

```mermaid
sequenceDiagram
    participant BE as Backend
    participant DB as PostgreSQL
    participant EV as Event / Celery
    participant WS as WebSocket

    BE->>DB: BEGIN
    BE->>DB: update session → COMPLETED
    BE->>DB: create analysis job/event
    BE->>DB: create notification event
    BE->>DB: COMMIT
    Note over BE,DB: در صورت خطا ROLLBACK تا session نصفه نماند
    DB-->>EV: Event پس از commit
    EV->>EV: notification
    EV->>EV: report generation
    EV->>WS: websocket update
```

Assessment و Chat/Notification در یک transaction قرار نمی‌گیرند؛ تکمیل آزمون نباید منتظر ارسال اعلان یا رویداد چت بماند. `COMPLETED` ترمینال است تا تکرار درخواست دو report یا دو notification نسازد.

## ۷. مشاهده نتیجه توسط روان‌شناس

```mermaid
sequenceDiagram
    actor PS as Psychologist
    participant BE as Backend
    participant DB as PostgreSQL

    PS->>BE: GET /assessments/{id}
    BE->>BE: Authentication (identity)
    BE->>DB: بررسی رابطه و مالکیت
    alt Owner یا روان‌شناس مرتبط یا Admin
        BE->>DB: AuditLog(PSYCHOLOGIST_VIEWED_ASSESSMENT)
        BE-->>PS: Raw Responses · Measurements · Calculated Parameters · Report
    else غیرمجاز
        BE-->>PS: DENY
    end
```

بیمار پس از completion فقط «Assessment completed successfully» را می‌بیند؛ raw/coded data صرفاً برای روان‌شناس نمایش داده می‌شود.

## ۸. چت و اعلان

```mermaid
sequenceDiagram
    actor A as User A
    participant BE as Django + Channels
    actor B as User B

    A->>BE: GET /conversations/
    A->>BE: GET /messages/
    A->>BE: POST /messages/
    BE-->>B: WS: new message
    A-->>BE: WS: typing
    B-->>BE: WS: read receipt
    BE-->>A: WS: online status
```

## ۹. Critical Path (End-to-End)

```mermaid
flowchart TD
    R[Register] --> L[Login]
    L --> S[Select psychologist]
    S --> ST[Start assessment]
    ST --> AC[Answer cards]
    AC --> C[Complete]
    C --> PL[Psychologist login]
    PL --> V[View assessment]
```

این مسیر، critical path سیستم است و باید به‌صورت end-to-end تست شود.
