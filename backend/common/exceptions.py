"""
One error shape for the whole API.

The Angular client parses every failure as `ApiErrorBody`
(`Rorschach/src/app/core/models/api.models.ts`):

    { detail?: string; code?: string; errors?: Record<string, string[]> }

`detail` is shown as the banner message, `errors.<field>` is mapped onto form
controls (`shared/utils/forms.ts`). DRF's own body for a ValidationError is a
bare `{field: [...]}` dict, so it must be wrapped here — otherwise the client
silently shows no message at all.
"""
from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("rorschach.app")
security_logger = logging.getLogger("rorschach.security")

# Persian replacements for DRF's built-in English defaults, keyed by status.
DEFAULT_DETAILS: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "اطلاعات نامعتبر است.",
    status.HTTP_401_UNAUTHORIZED: "احراز هویت لازم است.",
    status.HTTP_403_FORBIDDEN: "به این بخش دسترسی ندارید.",
    status.HTTP_404_NOT_FOUND: "یافت نشد.",
    status.HTTP_405_METHOD_NOT_ALLOWED: "این عملیات مجاز نیست.",
    status.HTTP_406_NOT_ACCEPTABLE: "قالب درخواستی پشتیبانی نمی‌شود.",
    status.HTTP_409_CONFLICT: "وضعیت درخواست با وضعیت فعلی سرور سازگار نیست.",
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "نوع محتوای درخواست پشتیبانی نمی‌شود.",
    status.HTTP_429_TOO_MANY_REQUESTS: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
}

CODES: dict[int, str] = {
    400: "invalid",
    401: "not_authenticated",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "throttled",
}


class ApiError(APIException):
    """
    Explicit failure with a Persian message — the server-side twin of the mock's
    `fail(status, detail, errors)` helper (`core/mock/mock-router.ts`).
    """

    def __init__(
        self,
        status_code: int,
        detail: str,
        errors: dict[str, list[str]] | None = None,
        code: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.errors = errors or {}
        self.code = code
        super().__init__(detail=detail)


class Conflict(ApiError):
    """409 — the request does not fit the current state (state machine violations)."""

    def __init__(self, detail: str, errors: dict[str, list[str]] | None = None) -> None:
        super().__init__(status.HTTP_409_CONFLICT, detail, errors, code="conflict")


def fail(status_code: int, detail: str, errors: dict[str, list[str]] | None = None) -> None:
    """Raise an ApiError. Mirrors `fail()` in the mock backend."""
    raise ApiError(status_code, detail, errors)


def _flatten(detail: Any) -> tuple[dict[str, list[str]], list[str]]:
    """Split a DRF ValidationError payload into per-field errors and non-field messages."""
    field_errors: dict[str, list[str]] = {}
    non_field: list[str] = []

    if isinstance(detail, dict):
        for key, value in detail.items():
            messages = _as_messages(value)
            if key in ("non_field_errors", "detail", "__all__"):
                non_field.extend(messages)
            else:
                field_errors[str(key)] = messages
    else:
        non_field.extend(_as_messages(detail))

    return field_errors, non_field


def _as_messages(value: Any) -> list[str]:
    if isinstance(value, list | tuple):
        out: list[str] = []
        for item in value:
            out.extend(_as_messages(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(_as_messages(item))
        return out
    return [str(value)]


def _detail_text(detail: Any) -> str:
    """
    Reduces a DRF `detail` to one sentence.

    Some exceptions carry a structure rather than a string — SimpleJWT raises
    `AuthenticationFailed({"detail": ..., "code": ...})` — and stringifying that
    dict would put `ErrorDetail(string=...)` in front of the user.
    """
    if detail is None:
        return ""
    if isinstance(detail, dict):
        for key in ("detail", "non_field_errors", "__all__"):
            if key in detail:
                return _detail_text(detail[key])
        first = next(iter(detail.values()), "")
        return _detail_text(first)
    if isinstance(detail, list | tuple):
        return _detail_text(detail[0]) if detail else ""
    return str(detail)


def _code_of(exc: Exception) -> str | None:
    """A machine-readable code, when the exception carries a usable one."""
    code = getattr(exc, "code", None)
    return code if isinstance(code, str) else None


def api_exception_handler(exc: Exception, context: dict) -> Response | None:
    if isinstance(exc, Http404):
        exc = ApiError(status.HTTP_404_NOT_FOUND, DEFAULT_DETAILS[404])
    elif isinstance(exc, DjangoPermissionDenied):
        exc = ApiError(status.HTTP_403_FORBIDDEN, DEFAULT_DETAILS[403])

    response = drf_exception_handler(exc, context)
    if response is None:
        # Unhandled exception: let Django produce a 500 and log it as an
        # application error (never an audit or security event).
        logger.exception("Unhandled API exception", exc_info=exc)
        return None

    code = response.status_code
    body: dict[str, Any] = {}

    if isinstance(exc, ValidationError):
        field_errors, non_field = _flatten(exc.detail)
        body["detail"] = non_field[0] if non_field else DEFAULT_DETAILS[400]
        if field_errors:
            body["errors"] = field_errors
        body["code"] = "invalid"
    elif isinstance(exc, ApiError):
        # Raised by our own code: the message is already the one to show.
        body["detail"] = str(exc.detail)
        body["code"] = exc.code or CODES.get(code, "error")
    else:
        text = _detail_text(getattr(exc, "detail", None))
        default = getattr(exc, "default_detail", None)
        # Third-party messages are English. A token rejection in particular
        # ("Given token not valid for any token type") means nothing to the
        # examinee, and the client handles 401 structurally anyway.
        if code == 401 or not text or (default is not None and text == str(default)):
            text = DEFAULT_DETAILS.get(code, text or "خطایی رخ داد.")
        body["detail"] = text
        body["code"] = _code_of(exc) or CODES.get(code, "error")
    extra = getattr(exc, "errors", None)
    if extra and "errors" not in body:
        body["errors"] = extra

    if code in (401, 403):
        request = context.get("request")
        security_logger.warning(
            "Access denied: %s %s (%s)",
            getattr(request, "method", "?"),
            getattr(request, "path", "?"),
            body["detail"],
        )

    response.data = body
    return response
