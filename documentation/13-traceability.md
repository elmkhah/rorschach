---
title: ماتریس ردیابی
doc_id: DOC-13
version: 1
status: as-built
architecture_version: Architecture v2 — as-built
code_revision: 10c22fe
language: fa
updated: 1405-06-23
tags:
  - traceability
  - requirements
  - verification
related:
  - "[[01-requirements]]"
  - "[[04-api-design]]"
  - "[[12-testing-and-quality]]"
---

# ۱۳ — ماتریس ردیابی

> این سند پاسخ یک پرسش است: «از کجا معلوم که این نیازمندی واقعاً پیاده شده؟»
> برای هر قاعده و هر نیازمندی، **کد** و **تستی** که آن را اثبات می‌کند نام برده شده.
> مسیرها نسبت به `backend/` هستند مگر خلاف آن گفته شود.

## ۱. قواعد کسب‌وکار

| کد | کجا اعمال می‌شود | کجا اثبات می‌شود |
|---|---|---|
| BR-01 تأیید اجباری روان‌شناس | `administration/views.py::VerifyView` · `profiles/views.py::MyDocumentsView` · `profiles/selectors.py::approved_psychologists` | `test_admin_api.py::test_approve_moves_the_psychologist_to_approved` · `test_relationships.py::test_cannot_request_an_unapproved_psychologist` · `test_profiles.py::test_uploading_documents_moves_to_pending_verification` |
| BR-02 مجوز بر پایه‌ی رابطه | `assessments/permissions.py::readable_session` · `assessments/selectors.py::sessions_for` · `relationships/views.py::PatientDetailView` | `test_review.py::test_unrelated_psychologist_is_denied`¹ · `test_review.py::test_session_list_is_scoped_by_relationship` · `test_relationships.py::test_patient_detail_is_denied_without_an_active_link` |
| BR-03 یکتایی در سطح دیتابیس | `users_email_ci_unique` · `unique_patient_psychologist` | `test_auth.py::test_duplicate_email_is_a_field_error` · `test_relationships.py::test_requesting_twice_is_409_and_creates_one_row` |
| BR-04 نسخه‌ی اجراشده تغییرناپذیر | `assessments/models.py` · `administration/views.py::CardUpdateView` | `test_engine.py::test_new_session_records_the_executed_version` · `test_admin_api.py::test_published_version_cannot_be_edited_only_cloned` |
| BR-05 سرور مرجع گام جاری | `assessments/state.py::build_state` | `test_engine.py::test_state_survives_a_reload_mid_run` · `test_engine.py::test_submitting_to_a_stale_card_is_409` |
| BR-06 پاسخ بازنویسی نمی‌شود | `services.py::clarify` · `services.py::save_coding` | `test_engine.py::test_submitted_responses_are_read_only` · `test_engine.py::test_clarification_never_touches_the_original_text` |
| BR-07 ثبت idempotent | `unique_assessment_client_response` + `services.py::submit_response` | `test_engine.py::test_duplicate_submission_creates_one_response` |
| BR-08 `COMPLETED` ترمینال | `services.py::complete` با `select_for_update` | `test_engine.py::test_completing_twice_is_terminal_and_idempotent` · `test_engine.py::test_run_endpoints_are_closed_after_completion` |
| BR-09 تکمیل اتمیک | `transaction.atomic` + `transaction.on_commit` | `test_engine.py::test_complete_finishes_the_session_and_creates_one_analysis` |
| BR-10 جدایی تراکنش آزمون از کار جانبی | `tasks.py::enqueue_analysis` بیرون از بلاک تراکنش | همان تست بالا، با `django_capture_on_commit_callbacks` |
| BR-11 سرور مرجع زمان | `services.py::submit_response` · `_previous_boundary` | `test_engine.py::test_duplicate_submission_creates_one_response` (بررسی زمان‌های سرور) |
| BR-12 حفظ تبار جلسه‌ی تاریخی | `on_delete=PROTECT` روی پنج کلید خارجی جلسه | `test_review.py::test_revoked_relationship_closes_current_access` (داده باقی می‌ماند) |
| BR-13 رابطه‌ی فعال ← دسترسی جاری | `permissions.py::has_active_link` | `test_review.py::test_revoked_relationship_closes_current_access` |
| BR-14 داده‌ی خام فقط برای روان‌شناس | `views.py::SessionDetailFullView` با `IsPsychologistOrAdmin` | `test_review.py::test_patient_cannot_read_the_protocol` |
| BR-15 فایل در دیتابیس نیست | `media/models.py::MediaAsset` · `catalog.AssessmentCard.image_asset` | `test_review.py::test_card_image_from_public_assets_stays_relative` |
| BR-16 پیام آرایه نیست | جدول `messages` با کلید خارجی | `test_chat.py::test_sending_a_message_and_reading_it_back` |
| BR-17 پارامترها hard-code نشوند | `rpas/codes.py` — جداول دارای حق نشر جاسازی نشده‌اند | `test_review.py::test_unknown_codes_are_dropped_rather_than_rejected` |
| BR-18 بدون ادعای تشخیص | دو هشدار اجباری در `compute_rpas` | `test_scoring.py::test_caveats_always_state_the_limits` |

¹ نام دقیق تست‌ها با `python -m pytest --collect-only -q` قابل بازبینی است.

## ۲. نیازمندی‌های کارکردی

| کد | پیاده‌سازی | تست | وضعیت |
|---|---|---|---|
| FR-01 ثبت‌نام و ورود با نقش | `accounts/{services,views,serializers}.py` | `test_auth.py` (۱۲ تست) | ✅ |
| FR-02 تأیید روان‌شناس | `profiles/views.py::MyDocumentsView` · `administration/views.py::VerifyView` | `test_profiles.py` · `test_admin_api.py` | ✅ |
| FR-03 چرخه‌ی رابطه | `relationships/services.py` | `test_relationships.py` (۱۹ تست) | ✅ |
| FR-04 ساختار آزمون با `configuration` | `catalog/models.py` · `seed_catalog.py` | `test_admin_api.py::test_version_detail_returns_phases_and_cards` | ✅ |
| FR-05 اجرای باحالت | `assessments/{state,services}.py` | `test_engine.py` (۳۳ تست) | ✅ |
| FR-06 ثبت پاسخ با زمان و اندازه‌گیری | `services.py::submit_response` | `test_engine.py` | ✅ |
| FR-07 ثبت idempotent | قید دیتابیس + منطق سرویس | `test_engine.py::test_duplicate_submission…` | ✅ |
| FR-08 ادامه پس از قطعی | `state.py::build_state` | `test_engine.py::test_state_survives_a_reload_mid_run` | ✅ |
| FR-09 تکمیل اتمیک | `services.py::complete` | `test_engine.py` | ✅ |
| FR-10 تفکیک لایه‌های داده | ستون‌های جدای `response_text` · `measurement_data` · `clarification` · `coding` | `test_engine.py::test_clarification_never_touches…` | ✅ |
| FR-11 تحلیل نسخه‌دار | `rpas/scoring.py` · `AssessmentAnalysis.algorithm_version` | `test_scoring.py` (۱۰ تست) · `test_review.py` | ✅ / ◐ گزارش |
| FR-12 نمایش پروتکل به روان‌شناس | `views.py::SessionDetailFullView` | `test_review.py::test_detail_returns_the_whole_protocol` | ✅ |
| FR-13 چت REST + WebSocket | `messaging/*` | `test_chat.py` (۷ تست) — WebSocket فقط دستی | ✅ / ⛔ تست سوکت |
| FR-14 تفکیک اعلان از اطلاعیه | `notifications/*` — فقط اطلاعیه | `test_admin_api.py::test_announcement_lifecycle` | ◐ (D-04) |
| FR-15 فایل در Object Storage | `media/models.py` · `settings/production.py` | `test_profiles.py` (بارگذاری مدارک) | ◐ |
| FR-16 پنل ادمین | `administration/*` — ۱۶ مسیر | `test_admin_api.py` (۱۸ تست) | ✅ |
| FR-17 ممیزی رویدادهای حساس | `audit/{models,services,middleware}.py` | `test_review.py::test_viewing_a_protocol_is_audited` · `test_admin_api.py::test_audit_log_filters_by_action` | ✅ |
| FR-18 نسخه‌بندی API | `config/urls.py` | تمام تست‌ها روی `/api/v1/` می‌زنند | ✅ |
| FR-19 پیشنهاد واژه‌های محتوا | `assessments/ai/*` · `services.py::detect_content_words` · `views.py::ContentWordsView` | `test_content_words.py` (۲۵ تست) | ✅ / ⛔ رابط کاربری |

## ۳. نیازمندی‌های غیرکارکردی

| نیازمندی | شاهد | وضعیت |
|---|---|---|
| مجوز سطح شیء | `assessments/permissions.py` + ۵ تست مجوز در `test_engine.py` و `test_review.py` | ✅ |
| قالب یکسان خطا | `common/exceptions.py` + `test_error_shape.py` (۹ تست) | ✅ |
| پیام‌های فارسی | `DEFAULT_DETAILS` + `test_error_shape.py::test_missing_credentials_produce_a_persian_message` | ✅ |
| عدم نشت جزئیات کتابخانه | `test_error_shape.py::test_a_malformed_token_does_not_leak_library_internals` | ✅ |
| محدودسازی نرخ | `common/throttling.py` + تنظیمات `DEFAULT_THROTTLE_RATES` | ✅ / ⛔ تست |
| صفحه‌بندی مطابق قرارداد | `common/pagination.py` + `test_admin_api.py::test_user_list_is_paginated_with_page_size_20` و `…page_size_25` | ✅ |
| یکپارچگی سطح دیتابیس | ۷ قید یکتایی + `PROTECT` | تست‌های BR-03 و BR-07 | ✅ |
| تفکیک سه لایه‌ی لاگ | `settings/base.py::LOGGING` — `rorschach.{app,audit,security}` | ✅ |
| سلامت سرویس | `common/health.py` + `test_error_shape.py::test_health_endpoint_is_public_and_checks_the_database` | ✅ |
| قابلیت اجرا روی SQLite و PostgreSQL | `settings/testing.py` + نبود نوع‌های مخصوص PostgreSQL | ✅ |
| اسرار بیرون از مخزن | `.gitignore` · فقط `.env.example` | ✅ |
| HTTPS و HSTS | `settings/production.py` | ◐ تنظیم شده، مستقر نشده |
| مانیتورینگ · پشتیبان‌گیری · CI | — | ⛔ |

## ۴. موارد خطا

| مورد ([[01-requirements]] §۸) | تست |
|---|---|
| تازه‌سازی مرورگر | `test_engine.py::test_state_survives_a_reload_mid_run` |
| ارسال تکراری پاسخ | `test_engine.py::test_duplicate_submission_creates_one_response` |
| پاسخ خالی | `test_engine.py::test_empty_response_is_rejected` |
| چند پاسخ روی یک کارت | `test_engine.py::test_no_cap_on_responses_per_card` |
| کارت بدون پاسخ | `test_engine.py::test_next_without_any_response_is_rejected` |
| کارت کهنه | `test_engine.py::test_submitting_to_a_stale_card_is_409` |
| روشن‌سازی بدون محل | `test_engine.py::test_clarification_needs_a_location_unless_whole` |
| روشن‌سازی بدون دلیل | `test_engine.py::test_clarification_needs_a_reason_or_a_note` |
| روشن‌سازی تکراری | `test_engine.py::test_clarifying_the_same_response_twice_is_idempotent` |
| تکمیل زودهنگام | `test_engine.py::test_cannot_complete_before_review` |
| تکمیل دوباره | `test_engine.py::test_completing_twice_is_terminal_and_idempotent` |
| روان‌شناس نامرتبط | `test_engine.py::test_unrelated_psychologist_is_denied` |
| رابطه‌ی لغوشده | `test_review.py::test_revoked_relationship_closes_current_access` |
| کدگذاری پیش از تکمیل | `test_review.py::test_coding_before_completion_is_409` |
| کدگذار غیرمجاز | `test_review.py::test_only_the_linked_psychologist_may_code` |
| نشست منقضی | `test_auth.py::test_refresh_without_cookie_is_401` |
| حساب غیرفعال | `test_auth.py::test_login_to_deactivated_account_is_403` |
| دسترسی ناشناس | `test_engine.py::test_anonymous_access_is_401` |

## ۵. قواعد اجرای R-PAS

| قاعده ([[10-assessment-rpas]] §۱) | شاهد |
|---|---|
| یادآوری (Pr) | `services.py::advance` · `test_engine.py::test_single_response_triggers_one_prompt_then_advances` |
| غیرفعال بودن Pu | `default_card_configuration()` با `max_responses = None` · `test_engine.py::test_no_cap_on_responses_per_card` |
| ثبت چرخش کارت | `test_engine.py::test_card_turns_accumulate_on_the_session` |
| گذار به مرحله‌ی روشن‌سازی | `test_engine.py::test_last_card_moves_into_the_clarification_phase` |
| ثبت وقفه | `test_engine.py::test_interruption_is_recorded` |
| بدون توقف | نبود اندپوینت `pause`/`resume` (D-12) |
| وزن‌های `WSumCog` | `rpas/codes.py::COGNITIVE_WEIGHTS` · `test_scoring.py::test_cognitive_codes_are_weighted…` |
| فرمول `WSumC` و `MC` | `test_scoring.py::test_colour_responses_are_weighted_into_wsumc_and_mc` |
| فرمول `PPD` و `MC−PPD` | `test_scoring.py::test_ppd_and_the_resource_balance` |
| بازه‌ی توصیه‌شده‌ی R | `test_scoring.py::test_short_protocol_is_flagged_against_the_recommended_range` |

## ۶. شکاف‌های ردیابی

مواردی که نیازمندی دارند ولی شاهد خودکار ندارند:

| مورد | وضعیت |
|---|---|
| تحویل رویداد WebSocket | فقط تأیید دستی در مرورگر ([[11-backend-notes]] §۵) |
| رفتار fail-open محدودکننده‌ی نرخ | کد دارد، تست ندارد |
| روان‌شناس تعلیق‌شده (D-13) | رفتار مطلوب هنوز تعریف نشده، پس تستی هم نوشته نشده |
| رندر کامپوننت‌های Angular | تست فرانت‌اند روی سرویس‌هاست، نه رندر |
| مسیر end-to-end در مرورگر واقعی | ابزار e2e راه‌اندازی نشده |

## ۷. چگونه این ماتریس را دوباره بسنجیم

```bash
cd backend
python -m pytest --collect-only -q        # فهرست کامل تست‌ها
python -m pytest -k "br_or_topic"         # اجرای یک بخش
python -m pytest --cov                    # پوشش کد
python -m ruff check .
```

هر بار که قاعده‌ای عوض شد یا اندپوینتی اضافه شد، این سند و [[01-requirements]] باید
در همان کامیت به‌روز شوند — وگرنه ردیابی از کد عقب می‌افتد و همان چیزی می‌شود که این
بازنویسی برای رفعش انجام شد.
