"""
The R-PAS run, end to end, plus every error case docs/01 §8 calls a critical
test: resume, duplicate submission, empty response, prompt, complete twice.
"""
import uuid

import pytest

from apps.assessments.models import AssessmentSession, SessionStatus
from apps.relationships.models import RelationshipStatus

pytestmark = pytest.mark.django_db

BASE = "/api/v1/assessments/sessions"


class Run:
    """Small driver so the tests read like the flow they describe."""

    def __init__(self, client, session_id):
        self.client = client
        self.id = session_id
        self.state = None
        self.seq = 0

    def url(self, suffix=""):
        return f"{BASE}/{self.id}/{suffix}"

    def start(self):
        response = self.client.post(self.url("start/"), {}, format="json")
        assert response.status_code == 200, response.json()
        self.state = response.json()
        return self.state

    def submit(self, text="یک خفاش", client_response_id=None, card_id=None, turns=0):
        self.seq += 1
        response = self.client.post(
            self.url("responses/"),
            {
                "client_response_id": client_response_id or f"r-{self.seq}",
                "card_id": card_id or self.state["card"]["id"],
                "response_text": text,
                "measurements": {"reaction_time_ms": 1200, "card_turns": turns, "final_rotation": 0},
            },
            format="json",
        )
        if response.status_code == 201:
            self.state = response.json()["state"]
        return response

    def next(self):
        response = self.client.post(self.url("next/"), {}, format="json")
        if response.status_code == 200:
            self.state = response.json()["state"]
        return response

    def clarify(self, reasons=("FORM",), text="", whole=True, marks=None, response_id=None):
        response = self.client.post(
            self.url("clarifications/"),
            {
                "response_id": response_id or self.state["target"]["id"],
                "whole": whole,
                "location_marks": marks or [],
                "reasons": list(reasons),
                "text": text,
            },
            format="json",
        )
        if response.status_code == 200:
            self.state = response.json()
        return response

    def complete(self):
        response = self.client.post(self.url("complete/"), {}, format="json")
        if response.status_code == 200:
            self.state = response.json()
        return response

    def refetch(self):
        response = self.client.get(self.url("state/"))
        self.state = response.json()
        return self.state


@pytest.fixture
def run(as_user, patient, psychologist, link, rorschach):
    link(patient, psychologist)
    client = as_user(patient)
    response = client.post(
        f"{BASE}/", {"psychologist_id": str(psychologist.id)}, format="json"
    )
    assert response.status_code == 201, response.json()
    return Run(client, response.json()["id"])


def answer_all_cards(run, per_card=2):
    """Walks the Response Phase to its end."""
    run.start()
    for _ in range(10):
        assert run.state["stage"] == "RESPONSE"
        for i in range(per_card):
            assert run.submit(f"پاسخ {i + 1}").status_code == 201
        assert run.next().status_code == 200
    return run.state


# ---- creation ---------------------------------------------------------------


def test_session_requires_an_active_relationship(as_user, patient, psychologist, link, rorschach):
    link(patient, psychologist, RelationshipStatus.PENDING)

    response = as_user(patient).post(
        f"{BASE}/", {"psychologist_id": str(psychologist.id)}, format="json"
    )

    assert response.status_code == 400
    assert "ارتباط فعال" in response.json()["detail"]


def test_creating_twice_returns_the_same_open_session(as_user, patient, psychologist, link, rorschach):
    link(patient, psychologist)
    client = as_user(patient)
    payload = {"psychologist_id": str(psychologist.id)}

    first = client.post(f"{BASE}/", payload, format="json").json()
    second = client.post(f"{BASE}/", payload, format="json").json()

    assert first["id"] == second["id"]
    assert AssessmentSession.objects.count() == 1


def test_new_session_records_the_executed_version(run, rorschach):
    session = AssessmentSession.objects.get(pk=run.id)

    # BR-04: never "test = Rorschach" alone.
    assert session.test_version_id == rorschach.id
    assert session.relationship_id is not None


# ---- the run ----------------------------------------------------------------


def test_start_moves_to_the_first_card(run):
    state = run.start()

    assert state["stage"] == "RESPONSE"
    assert state["card"]["card_number"] == 1
    assert state["card_index"] == 1
    assert state["total_cards"] == 10
    assert state["min_responses"] == 2
    assert state["max_responses"] is None  # pull disabled (docs/10 §1)


def test_start_is_idempotent(run):
    run.start()
    first_card = run.state["card"]["id"]

    run.start()

    assert run.state["card"]["id"] == first_card


def test_empty_response_is_rejected(run):
    run.start()

    response = run.submit(text="   ")

    assert response.status_code == 400
    assert response.json()["errors"]["response_text"] == ["متن پاسخ خالی است."]


def test_duplicate_submission_creates_one_response(run):
    run.start()

    run.submit(text="یک خفاش", client_response_id="same")
    again = run.client.post(
        run.url("responses/"),
        {
            "client_response_id": "same",
            "card_id": run.state["card"]["id"],
            "response_text": "یک خفاش",
            "measurements": {"reaction_time_ms": 1, "card_turns": 0, "final_rotation": 0},
        },
        format="json",
    )

    # BR-07: same key, same row.
    assert again.status_code == 201
    assert again.json()["state"]["card_responses"] and len(again.json()["state"]["card_responses"]) == 1
    assert AssessmentSession.objects.get(pk=run.id).responses.count() == 1


def test_submitted_responses_are_read_only(run):
    run.start()
    run.submit(text="اصل پاسخ", client_response_id="x")

    # A second submission with the same key must not change the stored text (BR-06).
    run.client.post(
        run.url("responses/"),
        {
            "client_response_id": "x",
            "card_id": run.state["card"]["id"],
            "response_text": "متن دستکاری‌شده",
            "measurements": {},
        },
        format="json",
    )

    stored = AssessmentSession.objects.get(pk=run.id).responses.first()
    assert stored.response_text == "اصل پاسخ"


def test_next_without_any_response_is_rejected(run):
    run.start()

    response = run.next()

    assert response.status_code == 400
    assert "حداقل یک پاسخ" in response.json()["detail"]


def test_single_response_triggers_one_prompt_then_advances(run):
    run.start()
    run.submit()

    prompted = run.next()
    assert prompted.status_code == 200
    assert prompted.json()["prompt"] is True
    assert prompted.json()["state"]["card"]["card_number"] == 1  # did not move
    assert prompted.json()["state"]["prompted"] is True

    # The single R-PAS reminder is spent; the next attempt advances.
    advanced = run.next()
    assert advanced.json()["prompt"] is False
    assert advanced.json()["state"]["card"]["card_number"] == 2

    session = AssessmentSession.objects.get(pk=run.id)
    assert session.administration["prompts"] == 1
    assert session.administration["prompted_cards"] == [1]


def test_no_cap_on_responses_per_card(run):
    run.start()

    for i in range(6):
        assert run.submit(f"پاسخ {i}").status_code == 201

    assert len(run.state["card_responses"]) == 6
    assert run.state["pulled"] is False
    assert AssessmentSession.objects.get(pk=run.id).administration["pulls"] == 0


def test_card_turns_accumulate_on_the_session(run):
    run.start()
    run.submit(turns=2)
    run.submit(turns=1)

    assert AssessmentSession.objects.get(pk=run.id).administration["card_turns"] == 3


def test_submitting_to_a_stale_card_is_409(run):
    run.start()
    stale_card = run.state["card"]["id"]
    run.submit()
    run.submit()
    run.next()

    response = run.submit(card_id=stale_card, client_response_id="stale")

    assert response.status_code == 409


# ---- resume -----------------------------------------------------------------


def test_state_survives_a_reload_mid_run(run, as_user, patient):
    run.start()
    run.submit()
    run.submit()
    run.next()
    run.submit()

    # A brand-new client — as if the browser had been closed and reopened.
    fresh = as_user(patient)
    state = fresh.get(f"{BASE}/{run.id}/state/").json()

    assert state["stage"] == "RESPONSE"
    assert state["card"]["card_number"] == 2
    assert len(state["card_responses"]) == 1


def test_interruption_is_recorded(run):
    run.start()

    run.client.post(run.url("events/"), {"type": "INTERRUPTION"}, format="json")
    run.client.post(run.url("events/"), {"type": "TAB_HIDDEN"}, format="json")

    administration = AssessmentSession.objects.get(pk=run.id).administration
    assert administration["interruptions"] == 1
    assert administration["tab_hidden"] == 1


# ---- clarification ----------------------------------------------------------


def test_last_card_moves_into_the_clarification_phase(run):
    state = answer_all_cards(run)

    assert state["stage"] == "CLARIFICATION"
    assert state["clarification_index"] == 1
    assert state["clarification_total"] == 20
    assert state["target"]["sequence"] == 1


def test_clarification_needs_a_reason_or_a_note(run):
    answer_all_cards(run)

    response = run.clarify(reasons=(), text="")

    assert response.status_code == 400


def test_clarification_needs_a_location_unless_whole(run):
    answer_all_cards(run)

    response = run.clarify(whole=False, marks=[])

    assert response.status_code == 400
    assert "محل پاسخ" in response.json()["detail"]


def test_unknown_reasons_are_dropped_and_deduplicated(run):
    answer_all_cards(run)
    target_id = run.state["target"]["id"]

    run.clarify(reasons=("FORM", "BOGUS", "FORM"))

    session = AssessmentSession.objects.get(pk=run.id)
    assert session.responses.get(pk=target_id).clarification["reasons"] == ["FORM"]
    assert run.state["clarification_index"] == 2


def test_clarifying_the_same_response_twice_is_idempotent(run):
    answer_all_cards(run)
    target_id = run.state["target"]["id"]
    run.clarify(reasons=("FORM",))

    again = run.clarify(response_id=target_id, reasons=("COLOR",))

    assert again.status_code == 200
    assert again.json()["clarification_index"] == 2  # did not advance twice
    session = AssessmentSession.objects.get(pk=run.id)
    assert session.responses.get(pk=target_id).clarification["reasons"] == ["FORM"]


def test_clarification_never_touches_the_original_text(run):
    answer_all_cards(run)
    target_id = run.state["target"]["id"]
    original = run.state["target"]["response_text"]

    run.clarify(reasons=("FORM",), text="توضیح جدید")

    stored = AssessmentSession.objects.get(pk=run.id).responses.get(pk=target_id)
    assert stored.response_text == original
    assert stored.clarification["text"] == "توضیح جدید"


# ---- completion -------------------------------------------------------------


def complete_run(run):
    answer_all_cards(run)
    while run.state["stage"] == "CLARIFICATION":
        run.clarify(reasons=("FORM",))
    return run


def test_cannot_complete_before_review(run):
    answer_all_cards(run)

    response = run.complete()

    assert response.status_code == 409


def test_complete_finishes_the_session_and_creates_one_analysis(run, django_capture_on_commit_callbacks):
    complete_run(run)
    assert run.state["stage"] == "REVIEW"

    with django_capture_on_commit_callbacks(execute=True):
        response = run.complete()

    assert response.status_code == 200
    assert response.json()["stage"] == "COMPLETED"
    session = AssessmentSession.objects.get(pk=run.id)
    assert session.status == SessionStatus.COMPLETED
    assert session.completed_at is not None
    assert session.analysis.status == "DONE"
    assert session.analysis.calculated_data["R"] == 20


def test_completing_twice_is_terminal_and_idempotent(run, django_capture_on_commit_callbacks):
    complete_run(run)
    with django_capture_on_commit_callbacks(execute=True):
        run.complete()

    second = run.complete()

    # BR-08: no second report, no second notification.
    assert second.status_code == 200
    assert second.json()["stage"] == "COMPLETED"
    from apps.assessments.models import AssessmentAnalysis

    assert AssessmentAnalysis.objects.filter(assessment_id=run.id).count() == 1


def test_run_endpoints_are_closed_after_completion(run, django_capture_on_commit_callbacks, rorschach):
    complete_run(run)
    with django_capture_on_commit_callbacks(execute=True):
        run.complete()

    any_card = rorschach.cards.first().id
    assert run.submit(client_response_id="after", card_id=str(any_card)).status_code == 409
    assert run.next().status_code == 409


# ---- authorization ----------------------------------------------------------


def test_another_patient_cannot_touch_the_session(run, make_patient, as_user):
    intruder = make_patient(email="other@example.com")

    response = as_user(intruder).get(f"{BASE}/{run.id}/state/")

    assert response.status_code == 403


def test_unrelated_psychologist_is_denied(run, make_psychologist, as_user):
    other = make_psychologist(email="other-psy@example.com")

    response = as_user(other).get(f"{BASE}/{run.id}/")

    assert response.status_code == 403


def test_psychologist_cannot_drive_the_run(run, psychologist, as_user):
    response = as_user(psychologist).post(f"{BASE}/{run.id}/start/", {}, format="json")

    assert response.status_code == 403


def test_unknown_session_is_404(as_user, patient):
    response = as_user(patient).get(f"{BASE}/{uuid.uuid4()}/")

    assert response.status_code == 404


def test_anonymous_access_is_401(api, run):
    assert api.get(f"{BASE}/{run.id}/").status_code == 401
