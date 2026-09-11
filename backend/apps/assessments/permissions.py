"""
Object-level access to an assessment — the single most important security rule
in the system (docs/02 §8, docs/04 §7).

`GET /assessments/{id}` must never be `AssessmentSession.objects.get(id=id)`:

    Does this user own this assessment?
    OR is this user the linked psychologist (ACTIVE relationship)?
    OR is this an admin?

`is_authenticated == True` is not an answer.
"""
from __future__ import annotations

from rest_framework import status

from apps.accounts.constants import Role
from apps.assessments.models import AssessmentSession, SessionStatus
from apps.relationships.models import Relationship, RelationshipStatus
from common.exceptions import ApiError

NOT_FOUND = "آزمون یافت نشد."
FORBIDDEN = "به این آزمون دسترسی ندارید."


def _get(session_id) -> AssessmentSession:
    session = (
        AssessmentSession.objects.select_related(
            "patient",
            "patient__user",
            "psychologist",
            "psychologist__user",
            "test_definition",
            "test_version",
            "current_phase",
            "current_card",
        )
        .filter(pk=session_id)
        .first()
    )
    if session is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return session


def has_active_link(patient_id, psychologist_id) -> bool:
    return Relationship.objects.filter(
        patient_id=patient_id,
        psychologist_id=psychologist_id,
        status=RelationshipStatus.ACTIVE,
    ).exists()


def readable_session(user, session_id) -> AssessmentSession:
    """Owner, currently linked psychologist, or admin."""
    session = _get(session_id)
    allowed = (
        user.role == Role.ADMIN
        or session.patient_id == user.id
        or (
            session.psychologist_id == user.id
            and has_active_link(session.patient_id, user.id)
        )
    )
    if not allowed:
        raise ApiError(status.HTTP_403_FORBIDDEN, FORBIDDEN)
    return session


def own_session(user, session_id) -> AssessmentSession:
    """
    Examinee endpoints: strictly the patient who owns the session.

    R-PAS administration is continuous — there is no pause button — so a session
    left in the legacy PAUSED state simply continues (docs/10 §1).
    """
    session = _get(session_id)
    if session.patient_id != user.id:
        raise ApiError(status.HTTP_403_FORBIDDEN, FORBIDDEN)
    if session.status == SessionStatus.PAUSED:
        session.status = SessionStatus.IN_PROGRESS
        session.save(update_fields=["status", "updated_at"])
    return session
