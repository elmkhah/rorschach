"""
Where the examinee is — computed, never trusted from the client (BR-05).

`RunState` is derived on every request from `status`, `current_phase`,
`current_card` and `current_step`, so a refresh, a crash or a second tab always
converge on the same answer. This is the server-side twin of `stateOf()` in
`core/mock/handlers/assessments.handlers.ts`.

    INTRO → RESPONSE (cards 1..10) → CLARIFICATION (responses 1..R) → REVIEW → COMPLETED
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from apps.assessments.models import AssessmentResponse, AssessmentSession, SessionStatus
from apps.catalog.models import AssessmentCard, PhaseKind
from apps.catalog.selectors import response_cards

INTRO = "INTRO"
RESPONSE = "RESPONSE"
CLARIFICATION = "CLARIFICATION"
REVIEW = "REVIEW"
COMPLETED = "COMPLETED"

#: Fallback used outside the Response Phase, where no card is in scope.
DEFAULT_MIN_RESPONSES = 2


@dataclass(slots=True)
class RunState:
    session: AssessmentSession
    stage: str
    card: AssessmentCard | None = None
    card_index: int = 0
    total_cards: int = 0
    card_responses: list[AssessmentResponse] = field(default_factory=list)
    prompted: bool = False
    pulled: bool = False
    target: AssessmentResponse | None = None
    clarification_index: int = 0
    clarification_total: int = 0
    min_responses: int = DEFAULT_MIN_RESPONSES
    max_responses: int | None = None


def session_responses(session: AssessmentSession) -> list[AssessmentResponse]:
    return list(session.responses.select_related("card").order_by("sequence"))


def build_state(
    session: AssessmentSession,
    responses: list[AssessmentResponse] | None = None,
    cards: list[AssessmentCard] | None = None,
) -> RunState:
    cards = cards if cards is not None else response_cards(session.test_version_id)
    responses = responses if responses is not None else session_responses(session)

    base: dict[str, Any] = {
        "session": session,
        "total_cards": len(cards),
        "clarification_total": len(responses),
    }

    if session.status == SessionStatus.CREATED:
        return RunState(stage=INTRO, **base)
    if session.status in (SessionStatus.COMPLETED, SessionStatus.ABANDONED, SessionStatus.CANCELLED):
        return RunState(stage=COMPLETED, **base)

    if _is_response_phase(session):
        card = _current_card(session, cards)
        on_card = [r for r in responses if r.card_id == card.id]
        max_responses = card.max_responses
        return RunState(
            stage=RESPONSE,
            card=card,
            card_index=cards.index(card) + 1,
            card_responses=on_card,
            prompted=card.card_number in (session.administration.get("prompted_cards") or []),
            pulled=max_responses is not None and len(on_card) >= max_responses,
            min_responses=card.min_responses,
            max_responses=max_responses,
            **base,
        )

    index = session.current_step or 0
    if index >= len(responses):
        return RunState(stage=REVIEW, clarification_index=len(responses), **base)

    target = responses[index]
    card = next((c for c in cards if c.id == target.card_id), None)
    return RunState(
        stage=CLARIFICATION,
        card=card,
        card_index=(cards.index(card) + 1) if card else 0,
        target=target,
        clarification_index=index + 1,
        **base,
    )


def _is_response_phase(session: AssessmentSession) -> bool:
    phase = session.current_phase
    return phase is not None and phase.kind == PhaseKind.RESPONSE


def _current_card(session: AssessmentSession, cards: list[AssessmentCard]) -> AssessmentCard:
    """Falls back to the first card if the pointer is missing — never returns None."""
    for card in cards:
        if card.id == session.current_card_id:
            return card
    return cards[0]
