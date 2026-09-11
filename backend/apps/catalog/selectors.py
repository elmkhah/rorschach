"""Read-side queries for the test catalog."""
from __future__ import annotations

from django.db.models import QuerySet

from apps.catalog.models import AssessmentCard, PhaseKind, TestPhase, TestVersion


def phase_of(version_id, kind: str) -> TestPhase:
    return TestPhase.objects.get(test_version_id=version_id, kind=kind)


def response_phase(version_id) -> TestPhase:
    return phase_of(version_id, PhaseKind.RESPONSE)


def clarification_phase(version_id) -> TestPhase:
    return phase_of(version_id, PhaseKind.CLARIFICATION)


def response_cards(version_id) -> list[AssessmentCard]:
    """The ten Rorschach cards of a version, in presentation order."""
    return list(
        AssessmentCard.objects.filter(
            test_version_id=version_id, phase__kind=PhaseKind.RESPONSE
        )
        .select_related("image_asset")
        .order_by("display_order")
    )


def published_version(definition_id) -> TestVersion | None:
    return (
        TestVersion.objects.filter(test_definition_id=definition_id, is_published=True)
        .order_by("published_at", "created_at")
        .last()
    )


def versions_with_phases() -> QuerySet[TestVersion]:
    return TestVersion.objects.prefetch_related("phases__cards")
