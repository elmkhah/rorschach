"""
Relationship state transitions (docs/05 §2).

    PENDING → ACTIVE (approve) | REJECTED (reject)
    PENDING | ACTIVE → REVOKED (revoke)

Only the psychologist decides on a request; either party (or an admin) may
revoke an established link.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from apps.accounts.constants import Role, VerificationStatus
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.messaging.models import Conversation, ConversationParticipant
from apps.profiles.models import PsychologistProfile
from apps.relationships.models import Relationship, RelationshipStatus
from common.exceptions import ApiError


@transaction.atomic
def request_relationship(patient_user, psychologist_id) -> Relationship:
    psychologist = (
        PsychologistProfile.objects.filter(
            pk=psychologist_id, verification_status=VerificationStatus.APPROVED
        )
        .select_related("user")
        .first()
    )
    if psychologist is None or not psychologist.user.is_active:
        raise ApiError(status.HTTP_400_BAD_REQUEST, "روان‌شناس نامعتبر است.")

    # UNIQUE(patient, psychologist): a repeat request reuses the existing row.
    relationship = (
        Relationship.objects.select_for_update()
        .filter(patient_id=patient_user.id, psychologist_id=psychologist_id)
        .first()
    )
    if relationship and relationship.status in (
        RelationshipStatus.PENDING,
        RelationshipStatus.ACTIVE,
    ):
        raise ApiError(status.HTTP_409_CONFLICT, "درخواست شما قبلاً ثبت شده است.")

    now = timezone.now()
    if relationship:
        relationship.status = RelationshipStatus.PENDING
        relationship.requested_at = now
        relationship.approved_at = None
        relationship.revoked_at = None
        relationship.save(update_fields=["status", "requested_at", "approved_at", "revoked_at", "updated_at"])
    else:
        relationship = Relationship.objects.create(
            patient=patient_user.patient_profile,
            psychologist=psychologist,
            status=RelationshipStatus.PENDING,
        )

    record(patient_user, AuditAction.RELATIONSHIP_CREATED, "Relationship", relationship.pk)
    return relationship


def ensure_conversation(relationship: Relationship) -> Conversation:
    """A chat channel exists for every active link (created on approval)."""
    existing = (
        Conversation.objects.filter(participants__user_id=relationship.patient_id)
        .filter(participants__user_id=relationship.psychologist_id)
        .first()
    )
    if existing:
        return existing
    conversation = Conversation.objects.create()
    ConversationParticipant.objects.bulk_create(
        [
            ConversationParticipant(conversation=conversation, user_id=relationship.patient_id),
            ConversationParticipant(conversation=conversation, user_id=relationship.psychologist_id),
        ]
    )
    return conversation


@transaction.atomic
def transition(user, relationship: Relationship, action: str) -> Relationship:
    is_psychologist = relationship.psychologist_id == user.id
    is_patient = relationship.patient_id == user.id
    if not (is_psychologist or is_patient or user.role == Role.ADMIN):
        raise ApiError(status.HTTP_403_FORBIDDEN, "به این رابطه دسترسی ندارید.")

    now = timezone.now()

    if action in ("approve", "reject"):
        if not is_psychologist:
            raise ApiError(status.HTTP_403_FORBIDDEN, "فقط روان‌شناس می‌تواند درخواست را بررسی کند.")
        if relationship.status != RelationshipStatus.PENDING:
            raise ApiError(status.HTTP_409_CONFLICT, "این درخواست قبلاً بررسی شده است.")
        if action == "approve":
            relationship.status = RelationshipStatus.ACTIVE
            relationship.approved_at = now
            relationship.save(update_fields=["status", "approved_at", "updated_at"])
            ensure_conversation(relationship)
            record(user, AuditAction.RELATIONSHIP_APPROVED, "Relationship", relationship.pk)
        else:
            relationship.status = RelationshipStatus.REJECTED
            relationship.approved_at = None
            relationship.save(update_fields=["status", "approved_at", "updated_at"])
            record(user, AuditAction.RELATIONSHIP_REJECTED, "Relationship", relationship.pk)
        return relationship

    if relationship.status not in (RelationshipStatus.ACTIVE, RelationshipStatus.PENDING):
        raise ApiError(status.HTTP_409_CONFLICT, "این رابطه فعال نیست.")
    relationship.status = RelationshipStatus.REVOKED
    relationship.revoked_at = now
    relationship.save(update_fields=["status", "revoked_at", "updated_at"])
    # BR-12: historical sessions keep their provenance; nothing is deleted here.
    record(user, AuditAction.RELATIONSHIP_REVOKED, "Relationship", relationship.pk)
    return relationship
