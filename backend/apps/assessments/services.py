"""
The assessment engine.

Every rule the documentation calls non-negotiable lives here:

* BR-05 the server decides the current step — the client only reports what happened
* BR-06 a submitted response is never overwritten
* BR-07 submission is idempotent through `client_response_id`
* BR-08 COMPLETED is terminal: completing twice produces one analysis, not two
* BR-09 completion is atomic; follow-up work is dispatched after commit
* BR-11 server timestamps win; client timing is an auxiliary measurement
"""
from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status

from apps.assessments.models import (
    AnalysisStatus,
    AssessmentAnalysis,
    AssessmentResponse,
    AssessmentSession,
    SessionStatus,
    empty_administration,
)
from apps.assessments.rpas.codes import normalize_coding, normalize_reasons
from apps.assessments.rpas.scoring import RPAS_ALGORITHM_VERSION, compute_rpas
from apps.assessments.state import (
    CLARIFICATION,
    RESPONSE,
    REVIEW,
    RunState,
    build_state,
    session_responses,
)
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.catalog.models import PhaseKind, TestDefinition, TestStatus
from apps.catalog.selectors import phase_of, published_version, response_cards
from apps.relationships.models import Relationship, RelationshipStatus
from common.exceptions import ApiError, Conflict

MAX_LOCATION_MARKS = 12
STALE = "وضعیت آزمون تغییر کرده است؛ صفحه را تازه کنید."


# ---- creation ---------------------------------------------------------------


@transaction.atomic
def create_session(patient_user, psychologist_id) -> AssessmentSession:
    """
    BR-02: an assessment can only exist inside an ACTIVE relationship, and the
    triple (patient, psychologist, relationship) is frozen onto the session.
    """
    relationship = (
        Relationship.objects.filter(
            patient_id=patient_user.id,
            psychologist_id=psychologist_id,
            status=RelationshipStatus.ACTIVE,
        )
        .select_related("psychologist")
        .first()
    )
    if relationship is None:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "برای شروع آزمون باید با یک روان‌شناس ارتباط فعال داشته باشید.",
        )

    # One open session per pair: re-entering the flow resumes instead of forking.
    existing = (
        AssessmentSession.objects.select_related("test_definition", "test_version")
        .filter(
            patient_id=patient_user.id,
            psychologist_id=psychologist_id,
            status__in=(SessionStatus.CREATED, SessionStatus.IN_PROGRESS, SessionStatus.PAUSED),
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing

    definition = TestDefinition.objects.filter(status=TestStatus.ACTIVE).order_by("code").first()
    if definition is None:
        raise ApiError(status.HTTP_409_CONFLICT, "هیچ آزمون فعالی تعریف نشده است.")
    version = published_version(definition.id)
    if version is None:
        raise ApiError(status.HTTP_409_CONFLICT, "نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد.")

    return AssessmentSession.objects.create(
        patient=patient_user.patient_profile,
        psychologist=relationship.psychologist,
        relationship=relationship,
        test_definition=definition,
        test_version=version,
        status=SessionStatus.CREATED,
        administration=empty_administration(),
    )


# ---- runtime ----------------------------------------------------------------


@transaction.atomic
def start(session: AssessmentSession) -> RunState:
    if session.status == SessionStatus.CREATED:
        cards = response_cards(session.test_version_id)
        if not cards:
            raise Conflict("این نسخه‌ی آزمون هیچ کارتی ندارد.")
        now = timezone.now()
        session.status = SessionStatus.IN_PROGRESS
        session.current_phase = phase_of(session.test_version_id, PhaseKind.RESPONSE)
        session.current_card = cards[0]
        session.current_step = 0
        session.started_at = now
        session.administration["response_phase_started_at"] = now.isoformat()
        session.administration["card_started_at"] = now.isoformat()
        session.save(
            update_fields=[
                "status",
                "current_phase",
                "current_card",
                "current_step",
                "started_at",
                "administration",
                "updated_at",
            ]
        )
        record(
            session.patient.user,
            AuditAction.PATIENT_STARTED_ASSESSMENT,
            "AssessmentSession",
            session.pk,
        )
    elif session.status != SessionStatus.IN_PROGRESS:
        raise Conflict("این آزمون قابل شروع نیست.")
    return build_state(session)


@transaction.atomic
def submit_response(session: AssessmentSession, data: dict[str, Any]) -> tuple[AssessmentResponse, RunState]:
    client_response_id = data["client_response_id"]

    # BR-07: a retried submission returns the original row, never a duplicate.
    existing = session.responses.filter(client_response_id=client_response_id).first()
    if existing:
        return existing, build_state(session)

    state = _require_stage(session, RESPONSE)
    card = state.card
    if data["card_id"] != card.id:
        raise Conflict("کارت فعلی تغییر کرده است؛ صفحه را تازه کنید.")
    if state.max_responses is not None and len(state.card_responses) >= state.max_responses:
        raise Conflict("برای این کارت پاسخ کافی ثبت شده است.")

    measurements = {
        "reaction_time_ms": (data.get("measurements") or {}).get("reaction_time_ms"),
        "card_turns": (data.get("measurements") or {}).get("card_turns") or 0,
        "final_rotation": (data.get("measurements") or {}).get("final_rotation") or 0,
    }

    now = timezone.now()
    # The response clock starts at the previous submission on this card, or at
    # the moment the card was presented — server time, not the client's (BR-11).
    started = _previous_boundary(session, state, now)

    try:
        response = AssessmentResponse.objects.create(
            assessment=session,
            phase=card.phase,
            card=card,
            card_number=card.card_number,
            client_response_id=client_response_id,
            sequence=session.responses.count() + 1,
            card_response_number=len(state.card_responses) + 1,
            response_text=data["response_text"],
            server_started_at=started,
            server_submitted_at=now,
            client_started_at=data.get("client_started_at"),
            client_submitted_at=data.get("client_submitted_at"),
            duration_ms=max(0, int((now - started).total_seconds() * 1000)),
            client_metadata={},
            measurement_data=measurements,
        )
    except IntegrityError:
        # Two concurrent retries of the same submission: the loser reads the winner's row.
        existing = session.responses.filter(client_response_id=client_response_id).first()
        if existing:
            return existing, build_state(session)
        raise

    administration = session.administration
    administration["card_turns"] = (administration.get("card_turns") or 0) + measurements["card_turns"]
    if state.max_responses is not None and response.card_response_number >= state.max_responses:
        # R-PAS "pull": the card is withdrawn after the maximum number of responses.
        administration["pulls"] = (administration.get("pulls") or 0) + 1
        administration.setdefault("pulled_cards", []).append(card.card_number)
    session.save(update_fields=["administration", "updated_at"])

    return response, build_state(session)


@transaction.atomic
def advance(session: AssessmentSession) -> tuple[bool, RunState]:
    """
    `POST /next/` — returns `(prompted, state)`.

    When the examinee gave only one response on a card, the first attempt does
    not advance: it spends the single standard R-PAS reminder (Pr) instead.
    """
    state = _require_stage(session, RESPONSE)
    card = state.card
    given = len(state.card_responses)
    if given == 0:
        raise ApiError(status.HTTP_400_BAD_REQUEST, "برای ادامه حداقل یک پاسخ لازم است.")

    if given < state.min_responses and not state.prompted:
        session.administration["prompts"] = (session.administration.get("prompts") or 0) + 1
        session.administration.setdefault("prompted_cards", []).append(card.card_number)
        session.save(update_fields=["administration", "updated_at"])
        return True, build_state(session)

    cards = response_cards(session.test_version_id)
    index = next(i for i, c in enumerate(cards) if c.id == card.id)
    now = timezone.now()

    if index == len(cards) - 1:
        # Last card: the Clarification Phase runs over responses, not cards.
        session.current_phase = phase_of(session.test_version_id, PhaseKind.CLARIFICATION)
        session.current_card = None
        session.current_step = 0
        session.administration["clarification_phase_started_at"] = now.isoformat()
        session.administration["card_started_at"] = None
    else:
        session.current_card = cards[index + 1]
        session.administration["card_started_at"] = now.isoformat()

    session.save(
        update_fields=["current_phase", "current_card", "current_step", "administration", "updated_at"]
    )
    return False, build_state(session)


@transaction.atomic
def clarify(session: AssessmentSession, data: dict[str, Any]) -> RunState:
    target = session.responses.filter(pk=data["response_id"]).first()
    if target is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "پاسخ یافت نشد.")
    if target.clarification:
        # Idempotent retry: the clarification is already recorded.
        return build_state(session)

    state = _require_stage(session, CLARIFICATION)
    if state.target is None or state.target.id != target.id:
        raise Conflict(STALE)

    marks = list(data.get("location_marks") or [])[:MAX_LOCATION_MARKS]
    whole = bool(data.get("whole"))
    if not whole and not marks:
        raise ApiError(status.HTTP_400_BAD_REQUEST, "محل پاسخ را روی کارت مشخص کنید.")

    reasons = normalize_reasons(data.get("reasons"))
    text = (data.get("text") or "").strip()
    if not reasons and not text:
        raise ApiError(status.HTTP_400_BAD_REQUEST, "دلیل را انتخاب کنید یا توضیح دهید.")

    # BR-06: stored beside the response; `response_text` is untouched.
    target.clarification = {
        "whole": whole,
        "location_marks": [{"x": m["x"], "y": m["y"]} for m in marks],
        "reasons": reasons,
        "text": text,
        "submitted_at": timezone.now().isoformat(),
    }
    target.save(update_fields=["clarification", "updated_at"])

    session.current_step = (session.current_step or 0) + 1
    session.save(update_fields=["current_step", "updated_at"])
    return build_state(session)


def complete(session: AssessmentSession) -> RunState:
    """
    BR-08/BR-09: one atomic transition, then the analysis job is dispatched
    *after* commit so the examinee never waits for it.
    """
    if session.status == SessionStatus.COMPLETED:
        return build_state(session)

    with transaction.atomic():
        locked = AssessmentSession.objects.select_for_update().get(pk=session.pk)
        if locked.status == SessionStatus.COMPLETED:
            return build_state(locked)
        _require_stage(locked, REVIEW)

        now = timezone.now()
        locked.status = SessionStatus.COMPLETED
        locked.completed_at = now
        locked.save(update_fields=["status", "completed_at", "updated_at"])

        AssessmentAnalysis.objects.get_or_create(
            assessment=locked,
            defaults={
                "algorithm_version": RPAS_ALGORITHM_VERSION,
                "status": AnalysisStatus.PENDING,
            },
        )
        record(
            locked.patient.user,
            AuditAction.PATIENT_COMPLETED_ASSESSMENT,
            "AssessmentSession",
            locked.pk,
        )
        session_id = locked.pk

    # Assessment and notification/chat work never share a transaction (BR-10).
    from apps.assessments.tasks import enqueue_analysis

    enqueue_analysis(session_id)

    session.refresh_from_db()
    return build_state(session)


def log_event(session: AssessmentSession, event_type: str) -> None:
    """Administration observations: interruptions and leaving the page."""
    if session.status != SessionStatus.IN_PROGRESS:
        return
    key = "interruptions" if event_type == "INTERRUPTION" else "tab_hidden"
    session.administration[key] = (session.administration.get(key) or 0) + 1
    session.save(update_fields=["administration", "updated_at"])


# ---- coding and analysis ----------------------------------------------------


@transaction.atomic
def save_coding(
    session: AssessmentSession, response_id, payload: Any, psychologist_user
) -> AssessmentResponse:
    if session.psychologist_id != psychologist_user.id:
        raise ApiError(status.HTTP_403_FORBIDDEN, "فقط روان‌شناس مرتبط می‌تواند کدگذاری کند.")
    if session.status != SessionStatus.COMPLETED:
        raise Conflict("کدگذاری پس از تکمیل آزمون ممکن است.")

    response = session.responses.filter(pk=response_id).first()
    if response is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "پاسخ یافت نشد.")

    response.coding = normalize_coding(payload)
    response.coded_by = psychologist_user
    response.coded_at = timezone.now()
    response.save(update_fields=["coding", "coded_by", "coded_at", "updated_at"])
    record(psychologist_user, AuditAction.RESPONSE_CODED, "AssessmentResponse", response.pk)
    return response


def analyze(session: AssessmentSession, actor=None) -> AssessmentAnalysis:
    """Recomputes the raw R-PAS variables and the non-definitive findings."""
    if session.status != SessionStatus.COMPLETED:
        raise Conflict("تحلیل پس از تکمیل آزمون ممکن است.")
    return run_analysis(session, actor)


def ensure_analysis(session: AssessmentSession) -> AssessmentAnalysis | None:
    """
    Guarantees the psychologist never opens a completed protocol and finds the
    analysis stuck at PENDING because the Celery worker was down when the
    examinee finished. Computing the raw variables is pure arithmetic over at
    most a few dozen rows, so doing it on read costs nothing; the task remains
    the normal path so that completion itself never waits (BR-09).
    """
    analysis = AssessmentAnalysis.objects.filter(assessment=session).first()
    if session.status != SessionStatus.COMPLETED:
        return analysis
    if analysis is None or analysis.status != AnalysisStatus.DONE:
        return run_analysis(session)
    return analysis


def run_analysis(session: AssessmentSession, actor=None) -> AssessmentAnalysis:
    calculated = compute_rpas(session_responses(session), session.administration)
    analysis, _created = AssessmentAnalysis.objects.update_or_create(
        assessment=session,
        defaults={
            "algorithm_version": RPAS_ALGORITHM_VERSION,
            "status": AnalysisStatus.DONE,
            "calculated_data": calculated,
            "generated_at": timezone.now(),
        },
    )
    if actor is not None:
        record(actor, AuditAction.ANALYSIS_GENERATED, "AssessmentSession", session.pk)
    return analysis


# ---- helpers ----------------------------------------------------------------


def _require_stage(session: AssessmentSession, stage: str) -> RunState:
    state = build_state(session)
    if state.stage != stage:
        raise Conflict(STALE)
    return state


def _previous_boundary(session: AssessmentSession, state: RunState, now):
    if state.card_responses:
        return state.card_responses[-1].server_submitted_at
    started = session.administration.get("card_started_at")
    if started:
        from django.utils.dateparse import parse_datetime

        parsed = parse_datetime(started)
        if parsed is not None:
            return parsed
    return now
