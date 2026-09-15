"""
Runs first-round content-word detection from the shell (docs/14).

Two ways in:

    python manage.py detect_content_words --text "یه خفاش سیاه با بال‌های باز"
    python manage.py detect_content_words --session <uuid> [--refresh]

`--text` is the quick check: it calls the relay exactly the way the endpoint
does, prints what came back, and stores nothing. Use it after setting
`AI_API_KEY` to confirm the gateway answers before wiring anything to it.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.assessments.ai import run_detection
from apps.assessments.ai.client import is_configured, model_name
from apps.assessments.models import AssessmentSession
from apps.assessments.rpas.codes import fa_digits
from apps.assessments.serializers import ContentDetectionSerializer
from apps.assessments.services import detect_content_words


class Command(BaseCommand):
    help = "تشخیص واژه‌های محتوا در پاسخ‌های دور اول"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--text", help="یک متن آزمایشی به‌جای پاسخ‌های یک جلسه")
        parser.add_argument("--session", help="شناسه‌ی جلسه‌ی تکمیل‌شده")
        parser.add_argument(
            "--refresh", action="store_true", help="اجرای دوباره حتی وقتی نتیجه ذخیره شده است"
        )

    def handle(self, *args, **options) -> None:
        gateway = f"{model_name()} (پیکربندی‌شده)" if is_configured() else "غیرفعال — واژه‌نامه‌ی محلی"
        self.stdout.write(f"سرویس: {gateway}")

        if options["text"]:
            self._ad_hoc(options["text"])
        elif options["session"]:
            self._session(options["session"], refresh=options["refresh"])
        else:
            raise CommandError("یکی از --text یا --session را بدهید.")

    def _ad_hoc(self, text: str) -> None:
        run = run_detection({"R1": text})
        self._report(run.source, run.error)
        for detection in run.by_response.get("R1", []):
            self._item(detection.as_dict())

    def _session(self, session_id: str, *, refresh: bool) -> None:
        session = AssessmentSession.objects.filter(pk=session_id).first()
        if session is None:
            raise CommandError(f"جلسه‌ی {session_id} یافت نشد.")

        detection = detect_content_words(session, refresh=refresh)
        self._report(detection.source, detection.error)

        # The same rollup the endpoint returns, so the shell and the API can
        # never disagree about which category an answer fell into.
        data = ContentDetectionSerializer(detection).data
        for row in data["responses"]:
            self.stdout.write("")
            self.stdout.write(
                f"کارت {fa_digits(row['card_number'])} · پاسخ {fa_digits(row['sequence'])} — "
                f"«{row['response_text']}»"
            )
            if row["primary_content"]:
                codes = " · ".join(row["contents"])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  دسته: {row['primary_content']} ({row['primary_label']})  ←  {codes}"
                    )
                )
            else:
                self.stdout.write(self.style.WARNING("  دسته: تشخیص داده نشد — با کدگذار"))
            for item in row["words"]:
                self._item(item)

        summary = " · ".join(f"{code}×{fa_digits(count)}" for code, count in data["summary"].items())
        self.stdout.write("")
        self.stdout.write(f"جمع‌بندی پروتکل: {summary or '—'}")

    def _report(self, source: str, error: str) -> None:
        self.stdout.write(f"منبع: {source}")
        if error:
            self.stdout.write(self.style.WARNING(f"هشدار: {error}"))

    def _item(self, item: dict) -> None:
        self.stdout.write(
            f"    {item['text']} → {item['content']} ({item['label']}) "
            f"[{item['source']} {item['confidence']}]"
        )
