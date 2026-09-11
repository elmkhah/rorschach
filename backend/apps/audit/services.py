"""Audit recording — the only way domain code writes to `audit_logs`."""
from __future__ import annotations

import logging
from typing import Any

from apps.audit.middleware import get_request_context
from apps.audit.models import AuditLog

logger = logging.getLogger("rorschach.audit")


def record(
    actor,
    action: str,
    target_type: str,
    target_id: Any,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    ctx = get_request_context()
    entry = AuditLog.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        actor_email=getattr(actor, "email", None),
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent,
        metadata=metadata or {},
    )
    logger.info("%s by %s on %s:%s", action, entry.actor_email or "-", target_type, target_id)
    return entry
