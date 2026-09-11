"""
Creates the Rorschach test structure: definition → v1.0 → two phases → ten cards.

Idempotent and safe in every environment — it is the minimum a fresh database
needs before anyone can start an assessment. The card images themselves are not
created here (BR-15): `image_path` points at the statically served files the
frontend already ships (`public/images/test/N.jpg`), and production replaces
that with a `MediaAsset` in object storage.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import (
    AssessmentCard,
    PhaseKind,
    TestDefinition,
    TestPhase,
    TestStatus,
    TestVersion,
    default_card_configuration,
)
from apps.media.models import MediaAsset

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

PHASES = [
    {
        "kind": PhaseKind.RESPONSE,
        "name": "مرحله‌ی ۱ — پاسخ (Response Phase)",
        "description": (
            "کارت‌ها یکی‌یکی نمایش داده می‌شوند و فرد بدون راهنمایی می‌نویسد چه چیزی می‌بیند."
        ),
        "display_order": 1,
    },
    {
        "kind": PhaseKind.CLARIFICATION,
        "name": "مرحله‌ی ۲ — روشن‌سازی (Clarification Phase)",
        "description": (
            "برای هر پاسخ، فرد محل آن را روی کارت مشخص و دلیل آن را توضیح می‌دهد. "
            "این مرحله روی پاسخ‌ها اجرا می‌شود، نه کارت‌ها."
        ),
        "display_order": 2,
    },
]


class Command(BaseCommand):
    help = "ایجاد ساختار آزمون رورشاخ (تعریف، نسخه، مراحل و ده کارت)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--image-base",
            default="/images/test",
            help="مسیر پایه‌ی تصاویر کارت‌ها در حالت توسعه (پیش‌فرض: /images/test)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        definition, created = TestDefinition.objects.get_or_create(
            code="RORSCHACH",
            defaults={
                "name": "آزمون رورشاخ",
                "description": "آزمون فرافکن لکه‌های جوهر؛ ده کارت، اجرا و کدگذاری به روش R-PAS.",
                "status": TestStatus.ACTIVE,
                "coding_system": "R-PAS",
                "methodology_reference": "Rorschach Performance Assessment System (R-PAS)",
                "source_document": "documentation/09-Rorshach-analysis.md",
            },
        )
        self._say("تعریف آزمون", created)

        version, created = TestVersion.objects.get_or_create(
            test_definition=definition,
            version="1.0",
            defaults={"is_published": True, "published_at": timezone.now()},
        )
        self._say("نسخه ۱.۰", created)

        phases = {}
        for spec in PHASES:
            phase, created = TestPhase.objects.get_or_create(
                test_version=version,
                kind=spec["kind"],
                defaults={
                    "name": spec["name"],
                    "description": spec["description"],
                    "display_order": spec["display_order"],
                },
            )
            phases[spec["kind"]] = phase
            self._say(f"مرحله‌ی {spec['kind']}", created)

        base = options["image_base"].rstrip("/")
        for index, roman in enumerate(ROMAN, start=1):
            asset, _ = MediaAsset.objects.get_or_create(
                storage_key=f"tests/rorschach/v1/card-{index:02d}.jpg",
                defaults={"mime_type": "image/jpeg", "size": 0},
            )
            _card, created = AssessmentCard.objects.get_or_create(
                test_version=version,
                card_number=index,
                defaults={
                    "phase": phases[PhaseKind.RESPONSE],
                    "title": f"کارت {roman}",
                    "image_asset": asset if asset.file else None,
                    "image_path": f"{base}/{index}.jpg",
                    "display_order": index,
                    "configuration": {
                        **default_card_configuration(),
                        "metadata": {"roman": roman},
                    },
                },
            )
            self._say(f"کارت {roman}", created)

        self.stdout.write(self.style.SUCCESS("ساختار آزمون رورشاخ آماده است."))

    def _say(self, label: str, created: bool) -> None:
        verb = "ایجاد شد" if created else "از قبل موجود بود"
        self.stdout.write(f"  {label}: {verb}")
