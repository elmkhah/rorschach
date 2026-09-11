"""
Assessment runtime (docs/03 §6, docs/10).

Layering that must not blur: raw data → measurements → coding → analysis.
A submitted response is never overwritten (BR-06); clarification and coding are
stored beside it, not on top of it.
"""
from django.conf import settings
from django.db import models

from common.models import UUIDModel


class SessionStatus(models.TextChoices):
    CREATED = "CREATED", "ایجادشده"
    IN_PROGRESS = "IN_PROGRESS", "در حال اجرا"
    # Kept for API compatibility: R-PAS administration is continuous and the UI
    # never pauses a session (docs/10 §1).
    PAUSED = "PAUSED", "متوقف‌شده"
    COMPLETED = "COMPLETED", "تکمیل‌شده"
    ABANDONED = "ABANDONED", "رهاشده"
    CANCELLED = "CANCELLED", "لغوشده"


OPEN_STATUSES = (SessionStatus.CREATED, SessionStatus.IN_PROGRESS, SessionStatus.PAUSED)
TERMINAL_STATUSES = (SessionStatus.COMPLETED, SessionStatus.ABANDONED, SessionStatus.CANCELLED)


def empty_administration() -> dict:
    """R-PAS administration behaviours and observations (docs/10 §4)."""
    return {
        "prompts": 0,
        "pulls": 0,
        "card_turns": 0,
        "interruptions": 0,
        "tab_hidden": 0,
        "prompted_cards": [],
        "pulled_cards": [],
        "response_phase_started_at": None,
        "clarification_phase_started_at": None,
        "card_started_at": None,
    }


def empty_measurements() -> dict:
    return {"reaction_time_ms": None, "card_turns": 0, "final_rotation": 0}


class AssessmentSession(UUIDModel):
    # The patient/psychologist/relationship triple is recorded at creation so a
    # later revoke never orphans a historical session (BR-12).
    patient = models.ForeignKey(
        "profiles.PatientProfile", on_delete=models.PROTECT, related_name="sessions", db_index=True
    )
    psychologist = models.ForeignKey(
        "profiles.PsychologistProfile",
        on_delete=models.PROTECT,
        related_name="sessions",
        db_index=True,
    )
    relationship = models.ForeignKey(
        "relationships.Relationship", on_delete=models.PROTECT, related_name="sessions"
    )
    test_definition = models.ForeignKey(
        "catalog.TestDefinition", on_delete=models.PROTECT, related_name="sessions"
    )
    # BR-04: the executed version is immutable and always recorded.
    test_version = models.ForeignKey(
        "catalog.TestVersion", on_delete=models.PROTECT, related_name="sessions"
    )

    status = models.CharField(
        max_length=16, choices=SessionStatus.choices, default=SessionStatus.CREATED, db_index=True
    )
    current_phase = models.ForeignKey(
        "catalog.TestPhase", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    current_card = models.ForeignKey(
        "catalog.AssessmentCard", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # Clarification Phase: index of the response being clarified.
    current_step = models.IntegerField(null=True, blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    administration = models.JSONField(default=empty_administration)

    class Meta:
        db_table = "assessment_sessions"
        ordering = ["-created_at"]
        verbose_name = "جلسه آزمون"
        verbose_name_plural = "جلسات آزمون"
        indexes = [models.Index(fields=["patient", "status"])]

    def __str__(self) -> str:
        return f"{self.test_definition_id} · {self.patient_id} · {self.status}"

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES


class AssessmentResponse(UUIDModel):
    assessment = models.ForeignKey(
        AssessmentSession, on_delete=models.CASCADE, related_name="responses", db_index=True
    )
    phase = models.ForeignKey("catalog.TestPhase", on_delete=models.PROTECT, related_name="+")
    card = models.ForeignKey(
        "catalog.AssessmentCard", on_delete=models.PROTECT, related_name="responses", db_index=True
    )
    card_number = models.PositiveSmallIntegerField()
    # BR-07: idempotency key supplied by the client.
    client_response_id = models.CharField(max_length=64)
    # Position in the protocol (the R sequence).
    sequence = models.PositiveIntegerField()
    card_response_number = models.PositiveSmallIntegerField()
    response_text = models.TextField()

    # The server is the timing authority; client times are auxiliary (BR-11).
    server_started_at = models.DateTimeField()
    server_submitted_at = models.DateTimeField()
    client_started_at = models.DateTimeField(null=True, blank=True)
    client_submitted_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(default=0)

    client_metadata = models.JSONField(default=dict, blank=True)
    measurement_data = models.JSONField(default=empty_measurements)
    # Clarification Phase data — stored separately, never merged into the text.
    clarification = models.JSONField(null=True, blank=True)

    # R-PAS coding, entered by the psychologist after completion.
    coding = models.JSONField(null=True, blank=True)
    coded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="coded_responses",
    )
    coded_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "assessment_responses"
        ordering = ["sequence"]
        verbose_name = "پاسخ آزمون"
        verbose_name_plural = "پاسخ‌های آزمون"
        constraints = [
            # Idempotency and ordering, enforced by the database (docs/03 §11).
            models.UniqueConstraint(
                fields=["assessment", "client_response_id"], name="unique_assessment_client_response"
            ),
            models.UniqueConstraint(
                fields=["assessment", "sequence"], name="unique_assessment_sequence"
            ),
        ]

    def __str__(self) -> str:
        return f"R{self.sequence} · card {self.card_number}"


class AnalysisStatus(models.TextChoices):
    PENDING = "PENDING", "در انتظار"
    PROCESSING = "PROCESSING", "در حال پردازش"
    DONE = "DONE", "انجام‌شده"
    FAILED = "FAILED", "ناموفق"


class AssessmentAnalysis(UUIDModel):
    assessment = models.OneToOneField(
        AssessmentSession, on_delete=models.CASCADE, related_name="analysis"
    )
    algorithm_version = models.CharField(max_length=32)
    status = models.CharField(
        max_length=16, choices=AnalysisStatus.choices, default=AnalysisStatus.PENDING
    )
    raw_analysis_data = models.JSONField(default=dict, blank=True)
    calculated_data = models.JSONField(null=True, blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "assessment_analyses"
        verbose_name = "تحلیل آزمون"
        verbose_name_plural = "تحلیل‌های آزمون"

    def __str__(self) -> str:
        return f"{self.assessment_id} · {self.algorithm_version}"


class AssessmentReport(UUIDModel):
    assessment = models.OneToOneField(
        AssessmentSession, on_delete=models.CASCADE, related_name="report"
    )
    summary = models.TextField(blank=True, default="")
    structured_result = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_reports",
    )
    version = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "assessment_reports"
        verbose_name = "گزارش آزمون"
        verbose_name_plural = "گزارش‌های آزمون"

    def __str__(self) -> str:
        return f"{self.assessment_id} v{self.version}"
