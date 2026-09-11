"""Read-side queries for assessment sessions."""
from __future__ import annotations

from django.db.models import Count, IntegerField, OuterRef, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce

from apps.accounts.constants import Role
from apps.assessments.models import AssessmentSession
from apps.catalog.models import AssessmentCard, PhaseKind
from apps.relationships.models import Relationship, RelationshipStatus


def sessions_for(user) -> QuerySet[AssessmentSession]:
    """
    What this user may list. A psychologist sees only patients they are still
    actively linked to (BR-02/BR-13 default: ACTIVE relationship → access).
    """
    qs = with_counts(
        AssessmentSession.objects.select_related(
            "patient", "psychologist", "test_definition", "test_version"
        )
    )
    if user.role == Role.PATIENT:
        return qs.filter(patient_id=user.id)
    if user.role == Role.PSYCHOLOGIST:
        active_patients = Relationship.objects.filter(
            psychologist_id=user.id, status=RelationshipStatus.ACTIVE
        ).values("patient_id")
        return qs.filter(psychologist_id=user.id, patient_id__in=Subquery(active_patients))
    return qs


def with_counts(qs: QuerySet[AssessmentSession]) -> QuerySet[AssessmentSession]:
    """Annotates the denormalised card counters the list views render."""
    cards = (
        AssessmentCard.objects.filter(
            test_version_id=OuterRef("test_version_id"), phase__kind=PhaseKind.RESPONSE
        )
        .order_by()
        .values("test_version_id")
        .annotate(total=Count("id"))
        .values("total")
    )
    return qs.annotate(
        total_cards_count=Coalesce(Subquery(cards, output_field=IntegerField()), 0),
        answered_cards_count=Count("responses__card_id", distinct=True),
    )


def filter_sessions(qs: QuerySet[AssessmentSession], params) -> QuerySet[AssessmentSession]:
    status_filter = params.get("status")
    patient_id = params.get("patient_id")
    if status_filter:
        qs = qs.filter(status=status_filter)
    if patient_id:
        qs = qs.filter(patient_id=patient_id)
    return qs


def sessions_between(patient_id, psychologist_id) -> QuerySet[AssessmentSession]:
    return with_counts(
        AssessmentSession.objects.select_related(
            "patient", "psychologist", "test_definition", "test_version"
        ).filter(Q(patient_id=patient_id) & Q(psychologist_id=psychologist_id))
    )
