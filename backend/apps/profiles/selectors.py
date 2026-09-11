"""
Read-side queries for profiles (docs/04 §3 — complex reads bypass services).
"""
from __future__ import annotations

from django.db.models import OuterRef, Q, QuerySet, Subquery

from apps.accounts.constants import VerificationStatus
from apps.profiles.models import PsychologistProfile
from apps.relationships.models import Relationship


def approved_psychologists(search: str | None = None) -> QuerySet[PsychologistProfile]:
    qs = (
        PsychologistProfile.objects.filter(verification_status=VerificationStatus.APPROVED)
        .select_related("user")
        .prefetch_related("documents")
        .order_by("last_name", "first_name")
    )
    if search:
        term = search.strip()
        qs = qs.filter(
            Q(first_name__icontains=term)
            | Q(last_name__icontains=term)
            | Q(specialty__icontains=term)
            | Q(city__icontains=term)
        )
    return qs


def with_relationship_for(
    qs: QuerySet[PsychologistProfile], patient_id
) -> QuerySet[PsychologistProfile]:
    """
    Annotates each psychologist with the calling patient's relationship, so the
    list can show «درخواست ارسال شد» / «ارتباط فعال» without an N+1 query.
    """
    if not patient_id:
        return qs.annotate(
            relationship_id=Subquery(Relationship.objects.none().values("id")[:1]),
            relationship_status=Subquery(Relationship.objects.none().values("status")[:1]),
        )
    mine = Relationship.objects.filter(patient_id=patient_id, psychologist_id=OuterRef("pk"))
    return qs.annotate(
        relationship_id=Subquery(mine.values("id")[:1]),
        relationship_status=Subquery(mine.values("status")[:1]),
    )
