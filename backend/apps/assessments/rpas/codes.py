"""
R-PAS code catalog — the Python twin of `core/rpas/rpas-codes.ts`.

Definitions follow the R-PAS manual. The official Form Quality and Popular
tables are copyrighted and are deliberately NOT embedded (docs/10 §5); the coder
applies them.
"""
from __future__ import annotations

from typing import Any

LOCATION_CODES = ("W", "D", "Dd")
SPACE_CODES = ("SR", "SI")
FORM_QUALITY_CODES = ("o", "u", "-", "n")

CONTENT_CODES = (
    "H", "(H)", "Hd", "(Hd)", "Hx",
    "A", "(A)", "Ad", "(Ad)",
    "An", "Art", "Ay", "Bl", "Cg", "Ex", "Fi", "Sx", "NC",
)

DETERMINANT_CODES = ("M", "FM", "m", "FC", "CF", "C", "C'", "T", "V", "Y", "r", "FD", "F")

COGNITIVE_CODES = ("DV1", "DV2", "INC1", "INC2", "DR1", "DR2", "FAB1", "FAB2", "PEC", "CON")

THEMATIC_CODES = ("ABS", "PER", "COP", "MAH", "MAP", "AGM", "AGC", "MOR", "ODL")

#: Weights for WSumCog. Open item (docs/10 §8): verify against the official
#: R-PAS manual before any clinical use.
COGNITIVE_WEIGHTS: dict[str, int] = {
    "DV1": 1,
    "DV2": 2,
    "INC1": 2,
    "INC2": 4,
    "DR1": 3,
    "DR2": 6,
    "FAB1": 4,
    "FAB2": 7,
    "PEC": 4,
    "CON": 7,
}

#: Codes counted in SevCog.
SEVERE_COGNITIVE = ("DV2", "INC2", "DR2", "FAB2", "PEC", "CON")

#: Clarification Phase: the reasons an examinee may pick for "what made it look
#: like that". `suggests` is a hint for the coder — it is never applied
#: automatically (docs/10 §5).
CLARIFICATION_REASONS: tuple[dict[str, Any], ...] = (
    {"code": "FORM", "label": "شکلش", "suggests": ["F"]},
    {"code": "MOVEMENT", "label": "حرکت یا حالتی که دارد", "suggests": ["M", "FM", "m"]},
    {"code": "COLOR", "label": "رنگش", "suggests": ["FC", "CF", "C"]},
    {"code": "ACHROMATIC", "label": "سیاه، سفید یا خاکستری بودنش", "suggests": ["C'"]},
    {"code": "TEXTURE", "label": "بافت یا زبری‌اش (مثل خز یا پوست)", "suggests": ["T"]},
    {"code": "DEPTH", "label": "عمق یا دوری و نزدیکی", "suggests": ["V", "FD"]},
    {"code": "SHADING", "label": "سایه‌روشن و کم‌رنگ و پررنگی", "suggests": ["Y"]},
    {"code": "REFLECTION", "label": "قرینه یا انعکاس (مثل تصویر در آب یا آینه)", "suggests": ["r"]},
    {"code": "OTHER", "label": "دلیل دیگر", "suggests": []},
)

CLARIFICATION_REASON_CODES = frozenset(r["code"] for r in CLARIFICATION_REASONS)

NOTES_MAX_LENGTH = 1000


def empty_coding() -> dict[str, Any]:
    return {
        "location": None,
        "space": [],
        "content": [],
        "synthesis": False,
        "vague": False,
        "pair": False,
        "form_quality": None,
        "popular": False,
        "determinants": [],
        "cognitive_codes": [],
        "thematic_codes": [],
        "notes": "",
    }


def _codes(value: Any, allowed: tuple[str, ...]) -> list[str]:
    """
    Keeps known codes only, de-duplicated, in the order the coder entered them —
    the order is what `codeString()` renders on the frontend.
    """
    if not isinstance(value, list | tuple):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item in allowed and item not in out:
            out.append(item)
    return out


def normalize_coding(payload: Any) -> dict[str, Any]:
    """
    Sanitises psychologist-supplied coding: unknown codes are dropped rather
    than rejected, mirroring the mock's `normalizeCoding`.
    """
    data = payload if isinstance(payload, dict) else {}
    coding = empty_coding()
    location = data.get("location")
    form_quality = data.get("form_quality")
    coding.update(
        {
            "location": location if location in LOCATION_CODES else None,
            "space": _codes(data.get("space"), SPACE_CODES),
            "content": _codes(data.get("content"), CONTENT_CODES),
            "synthesis": bool(data.get("synthesis")),
            "vague": bool(data.get("vague")),
            "pair": bool(data.get("pair")),
            "form_quality": form_quality if form_quality in FORM_QUALITY_CODES else None,
            "popular": bool(data.get("popular")),
            "determinants": _codes(data.get("determinants"), DETERMINANT_CODES),
            "cognitive_codes": _codes(data.get("cognitive_codes"), COGNITIVE_CODES),
            "thematic_codes": _codes(data.get("thematic_codes"), THEMATIC_CODES),
            "notes": str(data.get("notes") or "")[:NOTES_MAX_LENGTH],
        }
    )
    return coding


def normalize_reasons(value: Any) -> list[str]:
    """Clarification reasons: de-duplicated, unknown codes dropped."""
    if not isinstance(value, list | tuple):
        return []
    seen: list[str] = []
    for item in value:
        if isinstance(item, str) and item in CLARIFICATION_REASON_CODES and item not in seen:
            seen.append(item)
    return seen


_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa_digits(value: object) -> str:
    return str(value).translate(_FA_DIGITS)
