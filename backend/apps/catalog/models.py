"""
Test catalog: TestDefinition → TestVersion → TestPhase → AssessmentCard.

A session always records *which version it ran*, and a published version is
immutable (BR-04). Card parameters live in a JSON `configuration` instead of
dozens of nullable columns (docs/03 §5).
"""
from django.db import models

from common.models import UUIDModel


class TestStatus(models.TextChoices):
    DRAFT = "DRAFT", "پیش‌نویس"
    ACTIVE = "ACTIVE", "فعال"
    ARCHIVED = "ARCHIVED", "بایگانی‌شده"


class PhaseKind(models.TextChoices):
    """
    R-PAS runs in two phases. The Clarification Phase iterates over *responses*,
    not over cards, which is why the phase carries a kind instead of a number.
    """

    RESPONSE = "RESPONSE", "پاسخ"
    CLARIFICATION = "CLARIFICATION", "روشن‌سازی"


def default_card_configuration() -> dict:
    return {
        "required": True,
        # R-PAS "prompt for 2".
        "min_responses": 2,
        # Pull is disabled by decision: no cap on responses (docs/10 §1).
        "max_responses": None,
        "allow_rotation": True,
        "allowed_responses": [],
        "metadata": {},
    }


class TestDefinition(UUIDModel):
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=TestStatus.choices, default=TestStatus.DRAFT)
    coding_system = models.CharField(max_length=32, default="R-PAS")
    methodology_reference = models.CharField(max_length=255, null=True, blank=True)
    source_document = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "test_definitions"
        ordering = ["code"]
        verbose_name = "تعریف آزمون"
        verbose_name_plural = "تعریف آزمون‌ها"

    def __str__(self) -> str:
        return self.code


class TestVersion(UUIDModel):
    test_definition = models.ForeignKey(
        TestDefinition, on_delete=models.CASCADE, related_name="versions"
    )
    version = models.CharField(max_length=16)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "test_versions"
        ordering = ["created_at"]
        verbose_name = "نسخه آزمون"
        verbose_name_plural = "نسخه‌های آزمون"
        constraints = [
            models.UniqueConstraint(
                fields=["test_definition", "version"], name="unique_definition_version"
            )
        ]

    def __str__(self) -> str:
        return f"{self.test_definition.code} v{self.version}"


class TestPhase(UUIDModel):
    test_version = models.ForeignKey(TestVersion, on_delete=models.CASCADE, related_name="phases")
    kind = models.CharField(max_length=16, choices=PhaseKind.choices)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "test_phases"
        ordering = ["display_order"]
        verbose_name = "مرحله آزمون"
        verbose_name_plural = "مراحل آزمون"
        constraints = [
            models.UniqueConstraint(
                fields=["test_version", "kind"], name="unique_version_phase_kind"
            )
        ]

    def __str__(self) -> str:
        return self.name


class AssessmentCard(UUIDModel):
    test_version = models.ForeignKey(TestVersion, on_delete=models.CASCADE, related_name="cards")
    phase = models.ForeignKey(TestPhase, on_delete=models.CASCADE, related_name="cards")
    card_number = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=120)
    # The image itself lives in object storage (BR-15); `image_path` is the
    # development fallback that points at a statically served file.
    image_asset = models.ForeignKey(
        "media.MediaAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cards",
    )
    image_path = models.CharField(max_length=512, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=1)
    configuration = models.JSONField(default=default_card_configuration)

    class Meta:
        db_table = "test_cards"
        ordering = ["display_order"]
        verbose_name = "کارت آزمون"
        verbose_name_plural = "کارت‌های آزمون"
        constraints = [
            models.UniqueConstraint(
                fields=["test_version", "card_number"], name="unique_version_card_number"
            )
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def image_url(self) -> str | None:
        if self.image_asset and self.image_asset.url:
            return self.image_asset.url
        return self.image_path or None

    @property
    def min_responses(self) -> int:
        return int(self.configuration.get("min_responses") or 0)

    @property
    def max_responses(self) -> int | None:
        value = self.configuration.get("max_responses")
        return int(value) if value else None
