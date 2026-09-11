"""
Role profiles.

Both profiles use `user` as the primary key, so `profile.pk == user.id`. That is
deliberate: every profile endpoint in the contract is addressed by the *user* id
(`GET /psychologists/{user_id}/`, `GET /patients/{user_id}/`) and the frontend
models carry `user_id`, never a separate profile id.
"""
from django.conf import settings
from django.db import models

from apps.accounts.constants import Gender, VerificationStatus
from common.models import UUIDModel


class PatientProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="patient_profile",
    )
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, null=True, blank=True)
    avatar = models.ImageField(upload_to="avatars/patients/", null=True, blank=True)
    bio = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patient_profiles"
        verbose_name = "پروفایل مراجع"
        verbose_name_plural = "پروفایل‌های مراجعان"

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class PsychologistProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="psychologist_profile",
    )
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    avatar = models.ImageField(upload_to="avatars/psychologists/", null=True, blank=True)
    bio = models.TextField(blank=True, default="")
    specialty = models.CharField(max_length=160, blank=True, default="")
    professional_code = models.CharField(max_length=64, blank=True, default="")
    verification_status = models.CharField(
        max_length=32,
        choices=VerificationStatus.choices,
        default=VerificationStatus.REGISTERED,
        db_index=True,
    )
    city = models.CharField(max_length=80, blank=True, default="")
    years_of_experience = models.PositiveSmallIntegerField(default=0)
    verification_note = models.TextField(blank=True, default="")
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "psychologist_profiles"
        verbose_name = "پروفایل روان‌شناس"
        verbose_name_plural = "پروفایل‌های روان‌شناسان"

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_approved(self) -> bool:
        return self.verification_status == VerificationStatus.APPROVED


class VerificationDocument(UUIDModel):
    """
    Proof of licence uploaded by a psychologist (BR-01).

    The file lives in object storage; only metadata is kept here (BR-15).
    """

    profile = models.ForeignKey(
        PsychologistProfile,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to="verification-documents/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "psychologist_verification_documents"
        ordering = ["uploaded_at"]
        verbose_name = "مدرک تأیید"
        verbose_name_plural = "مدارک تأیید"

    def __str__(self) -> str:
        return self.name


class PsychologistAchievement(UUIDModel):
    psychologist = models.ForeignKey(
        PsychologistProfile,
        on_delete=models.CASCADE,
        related_name="achievements",
    )
    title = models.CharField(max_length=200)
    issuer = models.CharField(max_length=200, blank=True, default="")
    year = models.PositiveSmallIntegerField()
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "psychologist_achievements"
        ordering = ["-year", "title"]
        verbose_name = "افتخار"
        verbose_name_plural = "افتخارات"

    def __str__(self) -> str:
        return self.title
