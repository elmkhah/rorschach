"""
Carries the request's IP and user agent to the audit service.

Services must not take a `request` argument just to record an audit row — that
would leak HTTP concerns into the domain layer — so the context travels in a
ContextVar for the lifetime of the request.
"""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RequestContext:
    ip_address: str | None = None
    user_agent: str = ""


#: Used outside a request (management commands, Celery tasks): no IP, no agent.
EMPTY = RequestContext()

# Safe as a shared default: RequestContext is frozen, so it cannot be mutated
# by one request and observed by another.
_context: ContextVar[RequestContext] = ContextVar("request_context", default=EMPTY)


def get_request_context() -> RequestContext:
    return _context.get()


def client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _context.set(
            RequestContext(
                ip_address=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
            )
        )
        try:
            return self.get_response(request)
        finally:
            _context.reset(token)
