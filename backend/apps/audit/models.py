"""
Audit log (docs/03 §9, docs/07 §6).

Application logs, audit logs and security logs are three separate things and are
never merged. This table is the audit layer: who did what to which object.
"""
from django.conf import settings
from django.db import models

from common.models import UUIDModel


class AuditAction(models.TextChoices):
    PSYCHOLOGIST_PROFILE_APPROVED = "PSYCHOLOGIST_PROFILE_APPROVED", "تأیید روان‌شناس"
    PSYCHOLOGIST_PROFILE_REJECTED = "PSYCHOLOGIST_PROFILE_REJECTED", "رد روان‌شناس"
    PSYCHOLOGIST_PROFILE_SUSPENDED = "PSYCHOLOGIST_PROFILE_SUSPENDED", "تعلیق روان‌شناس"
    PSYCHOLOGIST_DOCUMENTS_UPLOADED = "PSYCHOLOGIST_DOCUMENTS_UPLOADED", "بارگذاری مدارک"
    USER_ACTIVATED = "USER_ACTIVATED", "فعال‌سازی کاربر"
    USER_DEACTIVATED = "USER_DEACTIVATED", "غیرفعال‌سازی کاربر"
    RELATIONSHIP_CREATED = "RELATIONSHIP_CREATED", "ثبت درخواست ارتباط"
    RELATIONSHIP_APPROVED = "RELATIONSHIP_APPROVED", "تأیید ارتباط"
    RELATIONSHIP_REJECTED = "RELATIONSHIP_REJECTED", "رد ارتباط"
    RELATIONSHIP_REVOKED = "RELATIONSHIP_REVOKED", "لغو ارتباط"
    PATIENT_STARTED_ASSESSMENT = "PATIENT_STARTED_ASSESSMENT", "شروع آزمون"
    PATIENT_COMPLETED_ASSESSMENT = "PATIENT_COMPLETED_ASSESSMENT", "تکمیل آزمون"
    PSYCHOLOGIST_VIEWED_ASSESSMENT = "PSYCHOLOGIST_VIEWED_ASSESSMENT", "مشاهده آزمون"
    RESPONSE_CODED = "RESPONSE_CODED", "کدگذاری پاسخ"
    ANALYSIS_GENERATED = "ANALYSIS_GENERATED", "تولید تحلیل"
    TEST_VERSION_CREATED = "TEST_VERSION_CREATED", "ایجاد نسخه آزمون"
    TEST_VERSION_PUBLISHED = "TEST_VERSION_PUBLISHED", "انتشار نسخه آزمون"


class AuditLog(UUIDModel):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    # Kept denormalised: the log must stay readable after the account is removed.
    actor_email = models.EmailField(null=True, blank=True)
    action = models.CharField(max_length=64, db_index=True)
    target_type = models.CharField(max_length=64)
    target_id = models.CharField(max_length=64)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        verbose_name = "رویداد ممیزی"
        verbose_name_plural = "رویدادهای ممیزی"
        indexes = [models.Index(fields=["target_type", "target_id"])]

    def __str__(self) -> str:
        return f"{self.action} → {self.target_type}:{self.target_id}"
