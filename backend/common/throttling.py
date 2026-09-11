"""
Rate limiting that fails open.

Throttle counters live in Redis (docs/07 §7). Redis being unreachable is an
availability problem, not an authorization one — it must not turn every login
into a 500. These subclasses log the outage to the security log and let the
request through, which is the right trade-off for a cache-backed limiter.
"""
import logging

from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle

logger = logging.getLogger("rorschach.security")


class FailOpenMixin:
    def allow_request(self, request, view) -> bool:
        try:
            return super().allow_request(request, view)
        except Exception:
            logger.warning(
                "Rate limiting unavailable (cache backend down); allowing %s %s",
                request.method,
                request.path,
                exc_info=True,
            )
            return True


class ScopedThrottle(FailOpenMixin, ScopedRateThrottle):
    pass


class AnonThrottle(FailOpenMixin, AnonRateThrottle):
    pass


class UserThrottle(FailOpenMixin, UserRateThrottle):
    pass
