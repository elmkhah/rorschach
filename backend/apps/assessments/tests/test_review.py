"""
The psychologist's side: the full protocol, coding and re-analysis.

BR-14 is the rule under test throughout — raw and coded data exist for the
psychologist, never for the examinee.
"""
import pytest

from apps.assessments.models import AssessmentResponse, AssessmentSession, SessionStatus
from apps.audit.models import AuditAction, AuditLog
from apps.relationships.models import Relationship, RelationshipStatus

pytestmark = pytest.mark.django_db

BASE = "/api/v1/assessments/sessions"

CODING = {
    "location": "W",
    "determinants": ["F"],
    "form_quality": "o",
    "content": ["A"],
    "popular": True,
    "notes": "پاسخ رایج کارت اول",
}


@pytest.fixture
def completed(patient, psychologist, link, rorschach):
    """A finished single-response protocol, built directly through the models."""
    from django.utils import timezone

    relationship = link(patient, psychologist)
    phase = rorschach.phases.get(kind="RESPONSE")
    session = AssessmentSession.objects.create(
        patient=patient.patient_profile,
        psychologist=psychologist.psychologist_profile,
        relationship=relationship,
        test_definition=rorschach.test_definition,
        test_version=rorschach,
        status=SessionStatus.COMPLETED,
        current_phase=rorschach.phases.get(kind="CLARIFICATION"),
        current_step=1,
        completed_at=timezone.now(),
    )
    card = rorschach.cards.order_by("display_order").first()
    AssessmentResponse.objects.create(
        assessment=session,
        phase=phase,
        card=card,
        card_number=card.card_number,
        client_response_id="seed-1",
        sequence=1,
        card_response_number=1,
        response_text="یک خفاش",
        server_started_at=timezone.now(),
        server_submitted_at=timezone.now(),
        measurement_data={"reaction_time_ms": 2000, "card_turns": 0, "final_rotation": 0},
    )
    return session


def test_detail_returns_the_whole_protocol(as_user, psychologist, completed):
    response = as_user(psychologist).get(f"{BASE}/{completed.id}/detail/")

    assert response.status_code == 200
    body = response.json()
    assert body["session"]["id"] == str(completed.id)
    assert len(body["cards"]) == 10
    assert body["responses"][0]["response_text"] == "یک خفاش"
    assert "analysis" in body and "report" in body


def test_viewing_a_protocol_is_audited(as_user, psychologist, completed):
    as_user(psychologist).get(f"{BASE}/{completed.id}/detail/")

    assert AuditLog.objects.filter(
        action=AuditAction.PSYCHOLOGIST_VIEWED_ASSESSMENT,
        target_id=str(completed.id),
        actor=psychologist,
    ).exists()


def test_patient_cannot_read_the_protocol(as_user, patient, completed):
    # BR-14: the examinee only ever sees "completed successfully".
    response = as_user(patient).get(f"{BASE}/{completed.id}/detail/")

    assert response.status_code == 403


def test_revoked_relationship_closes_current_access(as_user, psychologist, completed):
    Relationship.objects.filter(pk=completed.relationship_id).update(
        status=RelationshipStatus.REVOKED
    )

    response = as_user(psychologist).get(f"{BASE}/{completed.id}/detail/")

    # BR-13 default: ACTIVE relationship → current access.
    assert response.status_code == 403
    # BR-12: the session itself is untouched, not orphaned.
    assert AssessmentSession.objects.filter(pk=completed.id).exists()


def test_coding_is_saved_and_audited(as_user, psychologist, completed):
    response_id = completed.responses.first().id

    result = as_user(psychologist).put(
        f"{BASE}/{completed.id}/responses/{response_id}/coding/", CODING, format="json"
    )

    assert result.status_code == 200
    body = result.json()
    assert body["coding"]["location"] == "W"
    assert body["coding"]["popular"] is True
    assert body["coded_by"] == str(psychologist.id)
    assert body["coded_at"]
    assert AuditLog.objects.filter(action=AuditAction.RESPONSE_CODED).exists()


def test_unknown_codes_are_dropped_rather_than_rejected(as_user, psychologist, completed):
    response_id = completed.responses.first().id

    result = as_user(psychologist).put(
        f"{BASE}/{completed.id}/responses/{response_id}/coding/",
        {**CODING, "determinants": ["F", "NOT_A_CODE"], "content": ["A", "ZZZ"]},
        format="json",
    )

    assert result.status_code == 200
    assert result.json()["coding"]["determinants"] == ["F"]
    assert result.json()["coding"]["content"] == ["A"]


def test_only_the_linked_psychologist_may_code(as_user, make_psychologist, completed):
    other = make_psychologist(email="other@example.com")
    response_id = completed.responses.first().id

    result = as_user(other).put(
        f"{BASE}/{completed.id}/responses/{response_id}/coding/", CODING, format="json"
    )

    assert result.status_code == 403


def test_coding_before_completion_is_409(as_user, psychologist, completed):
    AssessmentSession.objects.filter(pk=completed.id).update(status=SessionStatus.IN_PROGRESS)
    response_id = completed.responses.first().id

    result = as_user(psychologist).put(
        f"{BASE}/{completed.id}/responses/{response_id}/coding/", CODING, format="json"
    )

    assert result.status_code == 409


def test_analysis_reflects_the_coding_just_entered(as_user, psychologist, completed):
    client = as_user(psychologist)
    response_id = completed.responses.first().id
    client.put(f"{BASE}/{completed.id}/responses/{response_id}/coding/", CODING, format="json")

    result = client.post(f"{BASE}/{completed.id}/analysis/", {}, format="json")

    assert result.status_code == 200
    body = result.json()
    assert body["status"] == "DONE"
    assert body["algorithm_version"] == "rpas-raw-0.1"
    assert body["calculated_data"]["R"] == 1
    assert body["calculated_data"]["coded"] == 1


def test_analysis_is_recomputed_not_duplicated(as_user, psychologist, completed):
    from apps.assessments.models import AssessmentAnalysis

    client = as_user(psychologist)
    client.post(f"{BASE}/{completed.id}/analysis/", {}, format="json")
    client.post(f"{BASE}/{completed.id}/analysis/", {}, format="json")

    assert AssessmentAnalysis.objects.filter(assessment=completed).count() == 1


def test_admin_can_read_any_protocol(as_user, make_admin, completed):
    response = as_user(make_admin()).get(f"{BASE}/{completed.id}/detail/")

    assert response.status_code == 200


def test_session_list_is_scoped_by_relationship(as_user, psychologist, make_psychologist, completed):
    mine = as_user(psychologist).get(f"{BASE}/").json()
    assert len(mine) == 1

    stranger = make_psychologist(email="stranger@example.com")
    assert as_user(stranger).get(f"{BASE}/").json() == []


def test_session_list_reports_progress_counters(as_user, psychologist, completed):
    row = as_user(psychologist).get(f"{BASE}/").json()[0]

    assert row["total_cards"] == 10
    assert row["answered_cards"] == 1
    assert row["patient_name"] == "سارا محمدی"
    assert row["test_version"] == "1.0"


def test_card_image_from_public_assets_stays_relative(as_user, psychologist, completed):
    """
    The ten card images ship inside the Angular app (`public/images/test/N.jpg`),
    so the URL must resolve against the frontend origin, not Django's.
    """
    cards = as_user(psychologist).get(f"{BASE}/{completed.id}/detail/").json()["cards"]

    assert cards[0]["image_url"] == "/images/test/1.jpg"
