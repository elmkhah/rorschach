"""
Background work for the assessment engine (docs/06 §5).

Completion must not wait for scoring, so the analysis runs as a Celery task
dispatched after commit. If no broker is reachable — a developer machine
without Redis — the task falls back to running inline so the flow still
finishes; that fallback is a development convenience, never the production path.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.db import transaction

from apps.assessments.models import AnalysisStatus, AssessmentAnalysis, AssessmentSession

logger = logging.getLogger("rorschach.app")


@shared_task(name="assessments.generate_analysis")
def generate_analysis(session_id: str) -> None:
    from apps.assessments.services import run_analysis

    session = AssessmentSession.objects.filter(pk=session_id).first()
    if session is None:
        logger.warning("generate_analysis: session %s no longer exists", session_id)
        return
    try:
        run_analysis(session)
    except Exception:
        AssessmentAnalysis.objects.filter(assessment_id=session_id).update(
            status=AnalysisStatus.FAILED
        )
        logger.exception("generate_analysis failed for session %s", session_id)
        raise


def enqueue_analysis(session_id) -> None:
    def dispatch() -> None:
        try:
            generate_analysis.delay(str(session_id))
        except Exception:
            logger.warning(
                "Celery broker unavailable; running analysis inline for session %s", session_id
            )
            generate_analysis(str(session_id))

    transaction.on_commit(dispatch)
