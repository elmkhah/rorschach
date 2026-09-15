"""
The relay client — one POST, nothing more.

The Iranian gateways (AvalAI, and the others that speak the same dialect) expose
the OpenAI `/chat/completions` contract, so a single JSON request over the
standard library is enough; no SDK, no new dependency in `requirements/base.txt`.

Configuration lives in settings, which read it from the environment:

    AI_ENABLED       kill switch, default on
    AI_BASE_URL      default https://api.avalai.ir/v1
    AI_API_KEY       empty means "not configured" — detection falls back
    AI_MODEL         default gpt-4o-mini
    AI_TIMEOUT_SECONDS

The key is never logged, never serialised and never returned to a client.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger("rorschach.app")

#: Truncated so a relay's HTML error page cannot flood the log or the DB row.
MAX_ERROR_LENGTH = 300


class GatewayError(RuntimeError):
    """The relay could not be reached, or did not answer with usable JSON."""


def is_configured() -> bool:
    return bool(getattr(settings, "AI_ENABLED", False)) and bool(getattr(settings, "AI_API_KEY", ""))


def model_name() -> str:
    return str(getattr(settings, "AI_MODEL", ""))


def chat_json(system: str, user: str, *, max_tokens: int = 1200) -> dict:
    """
    Asks the model for one JSON object and returns it parsed.

    Raises `GatewayError` for every failure mode — unconfigured, HTTP error,
    timeout, malformed body. The caller decides what to do about it; nothing
    here retries, because the fallback is cheaper than a second call.
    """
    if not is_configured():
        raise GatewayError("سرویس هوش مصنوعی پیکربندی نشده است.")

    url = f"{str(settings.AI_BASE_URL).rstrip('/')}/chat/completions"
    payload = {
        "model": settings.AI_MODEL,
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.AI_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=float(settings.AI_TIMEOUT_SECONDS)) as reply:
            body = json.loads(reply.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # The body usually carries the real reason (bad key, no credit, quota).
        detail = _read(exc)
        logger.warning("AI relay returned HTTP %s: %s", exc.code, detail)
        raise GatewayError(f"HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        logger.warning("AI relay unreachable: %s", exc)
        raise GatewayError(str(exc)[:MAX_ERROR_LENGTH]) from exc

    return _content_of(body)


def _content_of(body: dict) -> dict:
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GatewayError("پاسخ سرویس هوش مصنوعی قابل خواندن نبود.") from exc

    try:
        parsed = json.loads(_unfence(content)) if isinstance(content, str) else content
    except ValueError as exc:
        raise GatewayError("پاسخ سرویس هوش مصنوعی JSON معتبر نبود.") from exc
    if not isinstance(parsed, dict):
        raise GatewayError("پاسخ سرویس هوش مصنوعی یک شیء JSON نبود.")
    return parsed


def _unfence(content: str) -> str:
    """
    Strips a ```json fence. Relays that ignore `response_format` still tend to
    answer with fenced JSON, and that is cheap to accept.
    """
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _read(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode("utf-8", "replace")[:MAX_ERROR_LENGTH]
    except Exception:  # the error path must not raise
        return str(exc.reason or "")
