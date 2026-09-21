"""
Machine coding of a finished protocol (`rpas/autocode.py`).

Two things are under test. The inference itself — that a marked area becomes a
location and a clarification reason becomes a determinant — and the boundary
around it: a draft is labelled as a draft, and a psychologist's coding is never
overwritten by one.

The relay is stubbed throughout; the suite makes no network calls.
"""
import pytest
from django.utils import timezone

from apps.assessments import services
from apps.assessments.ai import client as client_module
from apps.assessments.models import (
    AnalysisStatus,
    AssessmentAnalysis,
    AssessmentResponse,
    AssessmentSession,
    SessionStatus,
)
from apps.assessments.rpas.autocode import COLOR_DEFAULT, DEPTH_DEFAULT, suggest_coding
from common.exceptions import Conflict

pytestmark = pytest.mark.django_db

BASE = "/api/v1/assessments/sessions"

WHOLE = {"whole": True, "location_marks": [], "reasons": ["FORM"], "text": ""}


def _marks(w, h):
    return [{"x": 0.1, "y": 0.1, "w": w, "h": h}]


@pytest.fixture
def protocol(patient, psychologist, link, rorschach):
    """A finished protocol whose clarifications carry every inference we make."""
    relationship = link(patient, psychologist)
    phase = rorschach.phases.get(kind="RESPONSE")
    session = AssessmentSession.objects.create(
        patient=patient.patient_profile,
        psychologist=psychologist.psychologist_profile,
        relationship=relationship,
        test_definition=rorschach.test_definition,
        test_version=rorschach,
        status=SessionStatus.COMPLETED,
        completed_at=timezone.now(),
    )
    rows = [
        ("یه خفاش سیاه با بال‌های باز", WHOLE),
        (
            "دو تا آدم روبه‌روی هم",
            {"whole": False, "location_marks": _marks(0.6, 0.6), "reasons": ["MOVEMENT"], "text": ""},
        ),
        (
            "یه گل قرمز",
            {"whole": False, "location_marks": _marks(0.1, 0.1), "reasons": ["COLOR"], "text": ""},
        ),
    ]
    cards = list(rorschach.cards.order_by("display_order")[: len(rows)])
    for index, (card, (text, clarification)) in enumerate(zip(cards, rows, strict=True), start=1):
        AssessmentResponse.objects.create(
            assessment=session,
            phase=phase,
            card=card,
            card_number=card.card_number,
            client_response_id=f"seed-{index}",
            sequence=index,
            card_response_number=1,
            response_text=text,
            clarification=clarification,
            server_started_at=timezone.now(),
            server_submitted_at=timezone.now(),
        )
    return session


@pytest.fixture(autouse=True)
def offline(monkeypatch, settings):
    """
    No relay: drafting must work from the local lexicon alone.

    The kill switch is what the test exercises; `urlopen` is stubbed only so a
    settings regression fails here instead of reaching the network.
    """
    settings.AI_ENABLED = False
    settings.AI_API_KEY = ""
    monkeypatch.setattr(
        client_module.urllib.request,
        "urlopen",
        lambda *a, **k: pytest.fail("the relay must not be called when it is off"),
    )


# ---- the inference ----------------------------------------------------------


def _draft(text, clarification, contents=()):
    response = AssessmentResponse(response_text=text, clarification=clarification)
    return suggest_coding(response, list(contents))


def test_whole_blot_is_W():
    assert _draft("خفاش", WHOLE)["location"] == "W"


def test_a_large_marked_area_is_a_common_detail():
    clarification = {"whole": False, "location_marks": _marks(0.5, 0.6), "reasons": []}
    assert _draft("خفاش", clarification)["location"] == "D"


def test_a_small_marked_area_is_an_unusual_detail():
    clarification = {"whole": False, "location_marks": _marks(0.1, 0.1), "reasons": []}
    assert _draft("خفاش", clarification)["location"] == "Dd"


def test_location_stays_empty_without_a_clarification():
    assert _draft("خفاش", {})["location"] is None


def test_movement_follows_what_was_seen():
    clarification = {"whole": True, "reasons": ["MOVEMENT"]}
    assert _draft("آدم", clarification, ["H"])["determinants"] == ["M"]
    assert _draft("خفاش", clarification, ["A"])["determinants"] == ["FM"]
    # Neither human nor animal: inanimate movement.
    assert _draft("ابر", clarification, ["NC"])["determinants"] == ["m"]


def test_ambiguous_reasons_take_their_conservative_member():
    assert _draft("گل", {"reasons": ["COLOR"]})["determinants"] == [COLOR_DEFAULT]
    assert _draft("دره", {"reasons": ["DEPTH"]})["determinants"] == [DEPTH_DEFAULT]


def test_other_carries_no_determinant():
    assert _draft("چیزی", {"reasons": ["OTHER"]})["determinants"] == []


def test_two_of_something_reads_as_a_pair():
    assert _draft("دو تا آدم", {})["pair"] is True
    # A word that merely starts with «دو» is not a count.
    assert _draft("دوستم رو دیدم", {})["pair"] is False


def test_the_copyrighted_tables_are_never_guessed():
    draft = _draft("خفاش", WHOLE, ["A"])
    assert draft["form_quality"] is None
    assert draft["popular"] is False


# ---- the service boundary ---------------------------------------------------


def test_drafting_fills_every_uncoded_response(protocol):
    written = services.autocode_session(protocol)

    assert len(written) == 3
    first = protocol.responses.order_by("sequence").first()
    assert first.coding["location"] == "W"
    assert "A" in first.coding["content"]


def test_a_draft_is_not_attributed_to_anyone(protocol):
    services.autocode_session(protocol)

    for response in protocol.responses.all():
        assert response.coded_by_id is None
        assert response.coded_at is not None


def test_a_psychologist_coding_is_never_overwritten(protocol, psychologist):
    target = protocol.responses.order_by("sequence").first()
    services.save_coding(protocol, target.pk, {"location": "Dd"}, psychologist)

    services.autocode_session(protocol, refresh=True)

    target.refresh_from_db()
    assert target.coding["location"] == "Dd"
    assert target.coded_by_id == psychologist.id


def test_drafting_is_idempotent(protocol):
    services.autocode_session(protocol)
    assert services.autocode_session(protocol) == []


def test_an_unfinished_protocol_cannot_be_drafted(protocol):
    protocol.status = SessionStatus.IN_PROGRESS
    protocol.save(update_fields=["status"])

    with pytest.raises(Conflict):
        services.autocode_session(protocol)


def test_drafting_invalidates_a_stored_analysis(protocol):
    """
    An analysis computed before the drafts existed counted an uncoded protocol.
    Leaving it DONE would show the coder a zero next to a full coding panel.
    """
    AssessmentAnalysis.objects.create(
        assessment=protocol,
        algorithm_version="rpas-raw-0.1",
        status=AnalysisStatus.DONE,
        calculated_data={"coded": 0},
    )

    services.autocode_session(protocol)

    assert services.ensure_analysis(protocol).calculated_data["coded"] == 3


# ---- the endpoint -----------------------------------------------------------


def test_the_psychologist_can_redraft(api, psychologist, protocol):
    api.force_authenticate(psychologist)
    reply = api.post(f"{BASE}/{protocol.id}/auto-code/", {}, format="json")

    assert reply.status_code == 200
    assert len(reply.data) == 3


def test_the_examinee_cannot_draft(api, patient, protocol):
    api.force_authenticate(patient)
    reply = api.post(f"{BASE}/{protocol.id}/auto-code/", {}, format="json")

    assert reply.status_code == 403
