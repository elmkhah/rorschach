from django.db import models


class Role(models.TextChoices):
    """docs/01 §1 — ADMIN is not a normal site user."""

    PATIENT = "PATIENT", "مراجع"
    PSYCHOLOGIST = "PSYCHOLOGIST", "روان‌شناس"
    ADMIN = "ADMIN", "مدیر"


class VerificationStatus(models.TextChoices):
    """
    Psychologist verification (BR-01, docs/03 §3).

    SUSPENDED is not part of the documented state diagram but the admin panel
    exposes it as a decision (`VerificationDecision = APPROVE | REJECT | SUSPEND`),
    so it is a real terminal state the model has to carry.
    """

    REGISTERED = "REGISTERED", "ثبت‌نام‌شده"
    PENDING_VERIFICATION = "PENDING_VERIFICATION", "در انتظار تأیید"
    APPROVED = "APPROVED", "تأییدشده"
    REJECTED = "REJECTED", "ردشده"
    SUSPENDED = "SUSPENDED", "تعلیق‌شده"


class Gender(models.TextChoices):
    MALE = "MALE", "مرد"
    FEMALE = "FEMALE", "زن"
    OTHER = "OTHER", "سایر"
