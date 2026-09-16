"""
AI-assisted content-word detection over the first round (docs/14).

What is under test is mostly *restraint*: the hints stay advisory, stay away
from the examinee, and never depend on the relay being reachable. The relay
itself is stubbed — the suite makes no network calls.
"""
import json

import pytest
from django.utils import timezone

from apps.assessments.ai import client as client_module
from apps.assessments.ai import detection as detection_module
from apps.assessments.ai import lexicon, run_detection
from apps.assessments.ai.client import GatewayError
from apps.assessments.models import (
    AnalysisStatus,
    AssessmentResponse,
    AssessmentSession,
    ContentDetection,
    SessionStatus,
)
from apps.audit.models import AuditAction, AuditLog

pytestmark = pytest.mark.django_db

BASE = "/api/v1/assessments/sessions"
URL = "content-words"

TEXTS = ("یه خفاش سیاه با بال‌های باز", "دو تا آدم که دارن دست همدیگه رو می‌کشن")


@pytest.fixture
def completed(patient, psychologist, link, rorschach):
    """A finished two-response protocol — the shape the coder actually sees."""
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
    cards = list(rorschach.cards.order_by("display_order")[:2])
    for index, (card, text) in enumerate(zip(cards, TEXTS, strict=True), start=1):
        AssessmentResponse.objects.create(
            assessment=session,
            phase=phase,
            card=card,
            card_number=card.card_number,
            client_response_id=f"seed-{index}",
            sequence=index,
            card_response_number=1,
            response_text=text,
            server_started_at=timezone.now(),
            server_submitted_at=timezone.now(),
        )
    return session


@pytest.fixture
def relay(monkeypatch, settings):
    """
    Turns the relay on and replaces the single HTTP call with a stub.

    Returns a recorder so a test can assert how many calls were spent — the
    whole point of storing a run is that a second read costs nothing.
    """
    settings.AI_ENABLED = True
    settings.AI_API_KEY = "test-key"
    calls: list[str] = []

    def install(answer):
        def fake(system, user, **kwargs):
            calls.append(user)
            if isinstance(answer, Exception):
                raise answer
            return answer

        monkeypatch.setattr(detection_module.client, "chat_json", fake)
        return calls

    return install


# ---- the local word list ----------------------------------------------------


def test_the_lexicon_finds_documented_words_through_persian_suffixes():
    found = dict(lexicon.scan(TEXTS[0]))

    assert found["خفاش"] == "A"
    # `بال‌های` — plural and a zero-width non-joiner, still the same word.
    assert found["بال"] == "Ad"


def test_spoken_possessive_endings_do_not_hide_a_word():
    # Examinees write `بال‌هاش`, not `بال‌های او`.
    assert dict(lexicon.scan("یه خفاش که بال‌هاش بازه")) == {"خفاش": "A", "بال": "Ad"}


def test_a_longer_phrase_wins_over_the_word_inside_it():
    assert dict(lexicon.scan("یک سر آدم")) == {"سر آدم": "Hd"}


def test_a_word_is_not_matched_inside_another_word():
    # `سرد` must not read as `سر`.
    assert lexicon.scan("هوای سرد") == []


def test_a_body_part_follows_the_creature_the_answer_named():
    run = run_detection(
        {
            "R1": "یه خرگوش که گوش‌هاش بلنده",
            "R2": "دو تا آدم که دارن به هم دست می‌دن",
        }
    )

    # The ear belongs to the rabbit, so it is an animal part…
    assert ("گوش", "Ad") in {(d.text, d.content) for d in run.by_response["R1"]}
    # …while the hand still belongs to the people.
    assert ("دست", "Hd") in {(d.text, d.content) for d in run.by_response["R2"]}


def test_an_answer_naming_both_leaves_the_part_where_it_was():
    """A rider and a horse: whose hand it is cannot be settled from the text."""
    run = run_detection({"R1": "یه آدم که سوار اسب شده و دست‌هاش بالاست"})

    assert ("دست", "Hd") in {(d.text, d.content) for d in run.by_response["R1"]}


# ---- the endpoint -----------------------------------------------------------


def test_detection_runs_over_the_first_round_and_is_stored(as_user, psychologist, completed):
    response = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    assert response.status_code == 200
    body = response.json()
    # No relay configured in the test settings: the lexicon answers alone.
    assert body["source"] == "LEXICON"
    assert body["status"] == AnalysisStatus.DONE
    words = {(item["text"], item["content"]) for item in body["items"]}
    assert ("خفاش", "A") in words
    assert ("آدم", "H") in words
    assert body["summary"]["A"] >= 1
    assert ContentDetection.objects.filter(assessment=completed).exists()


def test_every_hint_points_back_at_its_response(as_user, psychologist, completed):
    body = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json").json()

    ids = {str(r.id) for r in completed.responses.all()}
    assert all(item["response_id"] in ids for item in body["items"])
    assert all(item["card_number"] in (1, 2) for item in body["items"])


def test_detection_is_recorded_in_the_audit_log(as_user, psychologist, completed):
    as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    assert AuditLog.objects.filter(
        action=AuditAction.CONTENT_WORDS_DETECTED, target_id=str(completed.id)
    ).exists()


def test_reading_before_a_run_is_a_clean_404(as_user, psychologist, completed):
    response = as_user(psychologist).get(f"{BASE}/{completed.id}/{URL}/")

    assert response.status_code == 404
    assert response.json()["detail"]


def test_the_examinee_never_sees_the_hints(as_user, patient, completed):
    assert as_user(patient).get(f"{BASE}/{completed.id}/{URL}/").status_code == 403
    assert as_user(patient).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json").status_code == 403


def test_detection_waits_for_a_completed_protocol(as_user, psychologist, completed):
    completed.status = SessionStatus.IN_PROGRESS
    completed.save(update_fields=["status"])

    response = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    assert response.status_code == 409


def test_hints_never_touch_the_coding(as_user, psychologist, completed):
    as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    assert all(r.coding is None for r in completed.responses.all())


# ---- the per-answer rollup --------------------------------------------------


def test_each_answer_is_rolled_up_onto_its_category(as_user, psychologist, completed):
    body = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json").json()

    rows = body["responses"]
    assert [row["sequence"] for row in rows] == [1, 2]
    assert [row["card_number"] for row in rows] == [1, 2]
    assert rows[0]["response_text"] == TEXTS[0]
    # «یه خفاش سیاه با بال‌های باز» → حیوان کامل، به‌علاوه‌ی جزء حیوانی.
    assert rows[0]["primary_content"] == "A"
    assert rows[0]["primary_label"] == "حیوان کامل"
    assert set(rows[0]["contents"]) == {"A", "Ad"}
    assert rows[1]["primary_content"] in {"H", "Hd"}


def test_an_unrecognised_answer_is_listed_rather_than_guessed(as_user, psychologist, completed):
    card = completed.responses.order_by("sequence").first().card
    AssessmentResponse.objects.create(
        assessment=completed,
        phase=card.phase,
        card=card,
        card_number=card.card_number,
        client_response_id="seed-3",
        sequence=3,
        card_response_number=2,
        response_text="نمی‌دانم، چیزی به ذهنم نمی‌رسد",
        server_started_at=timezone.now(),
        server_submitted_at=timezone.now(),
    )

    body = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json").json()

    last = body["responses"][-1]
    assert last["sequence"] == 3
    assert last["contents"] == []
    # Not silently coded `NC`: an unread answer is the coder's to read.
    assert last["primary_content"] is None


# ---- the relay --------------------------------------------------------------


def test_the_model_answer_is_merged_with_the_lexicon(as_user, psychologist, completed, relay):
    responses = list(completed.responses.order_by("sequence"))
    # The model is addressed by short handle, never by UUID — `R1` is the first
    # answer in sequence order.
    relay(
        {
            "responses": [
                {
                    "id": "R1",
                    "items": [
                        {"text": "خفاش", "content": "A", "confidence": 0.95},
                        # Never written by the examinee — a hallucination.
                        {"text": "اژدها", "content": "(A)", "confidence": 0.9},
                        # Not an R-PAS content code.
                        {"text": "سیاه", "content": "ZZ", "confidence": 0.9},
                    ],
                }
            ]
        }
    )

    body = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json").json()

    assert body["source"] == "AI"
    assert body["model_name"]
    first = [item for item in body["items"] if item["response_id"] == str(responses[0].id)]
    bat = next(item for item in first if item["text"] == "خفاش")
    assert bat["source"] == "AI" and bat["confidence"] == 0.95
    assert not any(item["text"] in ("اژدها", "سیاه") for item in first)
    # The word the model skipped is still reported, by the lexicon.
    assert any(item["text"] == "بال" and item["source"] == "LEXICON" for item in first)
    # And the response the model ignored entirely keeps its lexicon hints.
    assert any(item["response_id"] == str(responses[1].id) for item in body["items"])


def test_the_relay_is_addressed_by_short_handle_not_uuid(as_user, psychologist, completed, relay):
    """
    UUIDs have to be echoed back by the model, and twenty of them cost more
    output tokens than the hints they label — enough to truncate the answer.
    """
    calls = relay({"responses": []})

    as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    prompt = calls[0]
    assert '"R1"' in prompt and '"R2"' in prompt
    assert all(str(response.id) not in prompt for response in completed.responses.all())


def test_a_dead_relay_degrades_to_the_lexicon_instead_of_failing(
    as_user, psychologist, completed, relay
):
    relay(GatewayError("HTTP 401: invalid api key"))

    response = as_user(psychologist).post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "LEXICON"
    assert body["status"] == AnalysisStatus.DONE
    # The psychologist can tell "nothing found" from "the service was down".
    assert "401" in body["error"]
    assert body["items"]


def test_a_finished_run_is_reused_until_refresh_is_asked_for(
    as_user, psychologist, completed, relay
):
    calls = relay({"responses": []})
    client = as_user(psychologist)

    client.post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")
    client.post(f"{BASE}/{completed.id}/{URL}/", {}, format="json")
    assert len(calls) == 1

    client.post(f"{BASE}/{completed.id}/{URL}/", {"refresh": True}, format="json")
    assert len(calls) == 2


# ---- the transport ----------------------------------------------------------


class _Reply:
    """The shape `urlopen` hands back: a context manager with `.read()`."""

    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def read(self) -> bytes:
        return self._body


def _answer(content: str) -> str:
    return json.dumps({"choices": [{"message": {"content": content}}]})


@pytest.fixture
def transport(monkeypatch, settings):
    """Replaces `urlopen` itself, so the request we would really send is asserted."""
    settings.AI_ENABLED = True
    settings.AI_API_KEY = "test-key"
    sent: dict = {}

    def install(reply):
        def fake(request, timeout=None):
            sent["url"] = request.full_url
            sent["headers"] = {key.lower(): value for key, value in request.headers.items()}
            sent["body"] = json.loads(request.data.decode("utf-8"))
            sent["timeout"] = timeout
            if isinstance(reply, Exception):
                raise reply
            return _Reply(reply)

        monkeypatch.setattr(client_module.urllib.request, "urlopen", fake)
        return sent

    return install


def test_the_request_matches_the_openai_contract(transport, settings):
    sent = transport(_answer('{"responses": []}'))

    client_module.chat_json("نقش", "پرسش")

    assert sent["url"] == f"{settings.AI_BASE_URL}/chat/completions"
    assert sent["headers"]["authorization"] == "Bearer test-key"
    assert sent["body"]["model"] == settings.AI_MODEL
    assert sent["body"]["temperature"] == 0
    assert [message["role"] for message in sent["body"]["messages"]] == ["system", "user"]
    assert sent["timeout"] == settings.AI_TIMEOUT_SECONDS


def test_a_fenced_answer_is_still_read(transport):
    transport(_answer('```json\n{"responses": [{"id": "R1", "items": []}]}\n```'))

    assert client_module.chat_json("نقش", "پرسش") == {"responses": [{"id": "R1", "items": []}]}


def test_an_unreachable_relay_becomes_a_gateway_error(transport):
    transport(TimeoutError("timed out"))

    with pytest.raises(GatewayError):
        client_module.chat_json("نقش", "پرسش")


def test_a_relay_that_answers_prose_becomes_a_gateway_error(transport):
    transport(_answer("متأسفم، نمی‌توانم کمک کنم."))

    with pytest.raises(GatewayError):
        client_module.chat_json("نقش", "پرسش")


def test_nothing_is_sent_without_a_key(settings):
    settings.AI_API_KEY = ""

    with pytest.raises(GatewayError):
        client_module.chat_json("نقش", "پرسش")


def test_a_truncated_answer_says_so_instead_of_blaming_the_json(transport):
    transport(
        json.dumps(
            {"choices": [{"finish_reason": "length", "message": {"content": '{"responses": [{"id"'}}]}
        )
    )

    with pytest.raises(GatewayError, match="سقف توکن"):
        client_module.chat_json("نقش", "پرسش")
