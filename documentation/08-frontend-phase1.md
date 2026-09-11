---
title: معماری Frontend — فاز ۱
doc_id: DOC-08
version: 2
status: draft
architecture_version: Architecture v1
language: fa
tags:
  - frontend
  - angular
  - tailwind
  - daisyui
  - roadmap
related:
  - "[[02-architecture]]"
  - "[[04-api-design]]"
  - "[[06-development-guide]]"
  - "[[11-backend-notes]]"
---
# ۰۸ — معماری Frontend (فاز ۱)

> فاز ۱ فقط Frontend است؛ Backend (Django + DRF) بعداً روی همین قرارداد `/api/v1` سوار می‌شود. **اجرای آزمون به روش R-PAS پیاده شده است** — جزئیات در [[10-assessment-rpas]]. **اعلان‌های شخصی (Notifications) از اپلیکیشن حذف شده‌اند**؛ فقط «اطلاعیه‌ی عمومی سایت» باقی است.

## ۱. پشته و تصمیمات

| موضوع | انتخاب |
|---|---|
| Framework | Angular 20 — Standalone Components، Signals، `rxResource`، `OnPush` |
| UI | Tailwind CSS 4 + daisyUI 5 (تم سفارشی `rorschach` در `src/styles.css`) |
| سبک بصری | خاکستری روشن + مشکی + بژ، گوشه‌های گرد بزرگ، دکمه‌های کپسولی، سطوح شیشه‌ای (`glass-card`، `glass-dark`) |
| زبان و فونت | فارسی، RTL، فونت **YekanBakh** از `public/fonts` (۸ وزن)، تاریخ شمسی |
| داده | لایه‌ی API در `core/api/*` + **Mock HttpInterceptor** در حالت development |
| Auth | Access token فقط در حافظه + Refresh در کوکی HttpOnly؛ refresh خودکار روی 401 |
| Realtime | `RealtimeService` (WebSocket در production، bus داخلی در mock) — فقط برای چت |

## ۲. ساختار پوشه‌ها (`Rorschach/src`)

```
src/
├── styles.css                    فونت‌ها + Tailwind + daisyUI + تم + utilityهای شیشه‌ای
├── environments/                 apiBaseUrl · wsBaseUrl · useMock
└── app/
    ├── app.config.ts / app.routes.ts
    ├── core/
    │   ├── auth/                 AuthService · TokenStore · models
    │   ├── guards/               authGuard · guestGuard · roleGuard · approvedPsychologistGuard
    │   ├── interceptors/         auth (توکن + refresh) · error (toast)
    │   ├── api/                  ProfileApi · PsychologistsApi · RelationshipsApi
    │   │                         AssessmentsApi · ChatApi · AnnouncementsApi · AdminApi
    │   ├── models/               قراردادهای داده (snake_case مطابق سند 03)
    │   ├── mock/                 mock-db · handlers/* · mock-backend.interceptor
    │   └── services/             Toast · Realtime · TitleStrategy
    ├── shared/
    │   ├── ui/                   icon · avatar · logo · image-slot · status-badge · stat-card
    │   │                         page-header · empty-state · loading · form-field · toast-host · confirm-dialog
    │   ├── components/           pagination
    │   ├── pipes/                jalaliDate · relativeTime · faNumber
    │   ├── pages/                not-found
    │   └── utils/                images (فهرست محل تصاویر) · status · forms · names
    ├── layouts/
    │   ├── public-layout/        هدر شیشه‌ای کپسولی + فوتر تیره
    │   ├── dashboard-layout/     سایدبار شیشه‌ای شناور (دسکتاپ) / Dock پایین (موبایل)
    │   └── focus-layout/         حالت تمرکز آزمون
    └── features/
        ├── landing/  auth/  profile/  chat/
        ├── patient/        dashboard · psychologists (نمایش لیستی) · psychologist-detail · assessments
        ├── psychologist/   dashboard · requests · patients · patient-detail
        │                   assessment-detail · achievements
        ├── admin/          dashboard · users · psychologists · relationships · tests
        │                   test-version · assessments · audit-logs
        └── assessment/     coming-soon (اسکلت فاز بعد)
```

قاعده: **هیچ کامپوننتی مستقیم به mock یا HttpClient دسترسی ندارد**؛ همه‌چیز از `core/api/*` عبور می‌کند.

## ۳. محل تصاویر (به‌جز تصاویر آزمون)

فایل را در مسیر زیر بگذارید؛ جای‌نگهدار (کادر خط‌چین «محل تصویر») به‌طور خودکار با تصویر جایگزین می‌شود. فهرست مرجع: `src/app/shared/utils/images.ts`.

| مسیر | محل استفاده | اندازه‌ی پیشنهادی |
|---|---|---|
| `public/images/brand/logo.svg` | هدر، سایدبار، فوتر | ارتفاع ~۴۰px، شفاف |
| `public/images/landing/hero.webp` | تصویر اصلی صفحه‌ی نخست | عمودی ~۹۰۰×۱۱۰۰ |
| `public/images/landing/psychologists.webp` | بخش «روان‌شناس هستید؟» | ~۸۰۰×۹۰۰ |
| `public/images/auth/login.webp` | کنار فرم ورود | عمودی ~۹۰۰×۱۱۰۰ |
| `public/images/auth/register.webp` | کنار فرم‌های ثبت‌نام | عمودی ~۹۰۰×۱۱۰۰ |
| `public/images/dashboard/patient.webp` | بنر داشبورد مراجع | ~۶۰۰×۴۰۰ |
| `public/images/avatars/psychologist-{1..5}.webp` | عکس روان‌شناسان (داده‌ی آزمایشی) | مربع ۴۰۰×۴۰۰ |

در production عکس پروفایل‌ها از API (`avatar`) و Object Storage می‌آید. تصاویر کارت‌های آزمون در فاز آزمون → `public/rorschach/v1/`.

## ۴. Routes

| مسیر | Guard | Layout |
|---|---|---|
| `/` · `/login` · `/register` · `/register/:role` | guestGuard (برای auth) | Public |
| `/verification-pending` | auth + PSYCHOLOGIST | Public |
| `/patient/**` | auth + PATIENT | Dashboard |
| `/psychologist/**` | auth + PSYCHOLOGIST + APPROVED | Dashboard |
| `/admin/**` | auth + ADMIN | Dashboard |
| `/assessment/:sessionId` | auth + PATIENT | Focus |

Guardها فقط UX هستند؛ مرجع واقعی دسترسی، permission سمت Backend است (BR-02).

## ۵. Mock Backend

- فعال با `environment.useMock = true` (فقط development). در build production فایل `mock.providers.ts` با `mock.providers.prod.ts` جایگزین می‌شود و هیچ کد mock در خروجی نیست.
- حساب‌های آزمایشی (رمز `Test1234`): `patient@test.com` · `psych@test.com` · `pending@test.com` · `admin@test.com`
- برای اتصال به Django: `useMock: false`. proxy در `proxy.conf.json` آماده است و `angular.json` به آن وصل شده؛ `/api` و `/ws` به `http://127.0.0.1:8000` می‌روند. جزئیات و تغییرات لازم در [[11-backend-notes]].

## ۶. نقشه‌ی راه

| مرحله | محتوا | وضعیت |
|---|---|---|
| F0 Setup | Tailwind/daisyUI، تم، RTL، فونت YekanBakh، environments | ✅ |
| F1 Design System | layoutها، سبک شیشه‌ای، کامپوننت‌های shared، جای‌نگهدار تصاویر | ✅ |
| F2 Core + Mock | models، API services، auth/guards، mock backend | ✅ |
| F3 Public/Auth | لندینگ، ورود، ثبت‌نام دو نقش، بارگذاری مدارک | ✅ |
| F4 Patient | داشبورد، فهرست لیستی روان‌شناسان، سوابق، پروفایل | ✅ |
| F5 Assessment | اجرای R-PAS (مرحله‌ی پاسخ + روشن‌سازی، بدون توقف)، کدگذاری روان‌شناس، متغیرها و تفسیر غیرقطعی — [[10-assessment-rpas]] | ✅ |
| F6 Psychologist | داشبورد، درخواست‌ها، مراجعان، جزئیات آزمون، افتخارات | ✅ |
| F7 Chat | گفت‌وگوی بلادرنگ (mock) | ✅ |
| F8 Admin | کاربران، تأیید روان‌شناس، روابط، نسخه‌های آزمون، اطلاعیه، رسانه، Audit | ✅ |
| F9 Polish | قرار دادن تصاویر، a11y، تست‌های بیشتر | ⏳ منتظر تصاویر |

## ۷. اجرا

```bash
cd Rorschach
npm start          # http://localhost:4200 با mock
npm run build      # production (بدون mock)
npx ng test --watch=false --browsers=ChromeHeadless
```
