"""
Patient ↔ Psychologist relationship — the basis of authorization (BR-02).

The foreign keys point at the *profiles*, whose primary key is the user id, so
`relationship.patient_id` is exactly the `patient_id` the API contract exposes.
"""
from django.db import models

from common.models import UUIDModel


class RelationshipStatus(models.TextChoices):
    PENDING = "PENDING", "در انتظار تأیید"
    ACTIVE = "ACTIVE", "فعال"
    REJECTED = "REJECTED", "ردشده"
    REVOKED = "REVOKED", "لغوشده"


class Relationship(UUIDModel):
    patient = models.ForeignKey(
        "profiles.PatientProfile",
        on_delete=models.CASCADE,
        related_name="relationships",
        db_index=True,
    )
    psychologist = models.ForeignKey(
        "profiles.PsychologistProfile",
        on_delete=models.CASCADE,
        related_name="relationships",
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=RelationshipStatus.choices,
        default=RelationshipStatus.PENDING,
        db_index=True,
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patient_psychologist_relationships"
        ordering = ["-updated_at"]
        verbose_name = "ارتباط"
        verbose_name_plural = "ارتباط‌ها"
        constraints = [
            # BR-03: one row per pair, enforced by the database. Re-requesting
            # after a rejection reuses this row instead of creating a second one.
            models.UniqueConstraint(
                fields=["patient", "psychologist"],
                name="unique_patient_psychologist",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.patient_id} ↔ {self.psychologist_id} ({self.status})"

    @property
    def is_active(self) -> bool:
        return self.status == RelationshipStatus.ACTIVE
