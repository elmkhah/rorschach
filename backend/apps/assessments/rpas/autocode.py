"""
Machine coding — the first pass over a finished protocol.

The psychologist used to meet an empty coding panel and fill all of it by hand.
This module fills what the protocol already answers, so the panel opens with a
draft the coder corrects instead of composes.

Where each field comes from:

    location      Clarification Phase: `whole`, else the marked area
    determinants  Clarification Phase: the reasons, disambiguated by content
    content       the AI/lexicon hints (`apps.assessments.ai`)
    pair          symmetry wording in the response text
    space         left empty — needs the blot's white space, which we don't model
    form_quality  left empty — needs the official FQ table (copyrighted, docs/10 §5)
    popular       left empty — needs the official P table (same reason)

Everything here is a *draft*: `AssessmentResponse.coded_by` stays NULL until a
psychologist saves, which is how the UI tells a machine draft from a real
coding. Nothing in this module is definitive, and the two tables we cannot
embed are exactly the two that decide perceptual accuracy — so a draft is never
a substitute for a coder reading the protocol.
"""
from __future__ import annotations

import re
from typing import Any

from apps.assessments.ai.lexicon import normalize
from apps.assessments.rpas.codes import (
    CLARIFICATION_REASONS,
    empty_coding,
    normalize_coding,
)

#: Fraction of the card a marked area must cover to read as a common detail.
#: A stand-in for the official location table (docs/10 §5): D and Dd are defined
#: there by *which* area was used, not by how big it is. Size correlates with the
#: distinction well enough to seed the field, and the coder fixes the rest.
COMMON_DETAIL_AREA = 0.25

#: Reason code → determinant, when the reason names exactly one.
_UNAMBIGUOUS: dict[str, str] = {
    "FORM": "F",
    "ACHROMATIC": "C'",
    "TEXTURE": "T",
    "SHADING": "Y",
    "REFLECTION": "r",
}

#: Reason codes whose determinant depends on what was seen, not on the reason.
MOVEMENT = "MOVEMENT"
COLOR = "COLOR"
DEPTH = "DEPTH"

_HUMAN = ("H", "(H)", "Hd", "(Hd)", "Hx")
_ANIMAL = ("A", "(A)", "Ad", "(Ad)")

#: Colour is form-dominant (FC), form-secondary (CF) or pure (C) depending on how
#: much form the percept carries — a judgement the text does not settle. FC is
#: the conservative seed: it is both the most common and the least pathologising.
COLOR_DEFAULT = "FC"

#: Depth splits into vista (V, shading-based, dysphoric) and form dimension (FD).
#: V carries clinical weight that a guess should not hand out, so FD seeds it.
DEPTH_DEFAULT = "FD"

#: Symmetry wording. R-PAS scores a pair when two identical objects are seen by
#: virtue of the blot's symmetry; these are the ways an examinee says so. Matched
#: on word boundaries, because `دو` is a prefix of `دوست` and of `دور`.
_PAIR_WORDS = (
    "دو", "دوتا", "۲", "2",
    "جفت", "قرینه", "متقارن", "هردو", "دوطرف", "طرفین",
)

#: A letter for boundary purposes — the same class the lexicon uses.
_LETTER = r"ء-ۿA-Za-z0-9"
_PAIR_PATTERN = re.compile(
    rf"(?<![{_LETTER}])(?:{'|'.join(_PAIR_WORDS)})(?:تا|طرف|طرفه|شون|شان|تایی|ش)?(?![{_LETTER}])"
)

_REASON_SUGGESTS = {reason["code"]: tuple(reason["suggests"]) for reason in CLARIFICATION_REASONS}


def suggest_coding(response: Any, contents: list[str]) -> dict[str, Any]:
    """
    Builds one draft coding.

    `contents` are the R-PAS content codes the hint layer found in this
    response, already filtered and ordered; the caller owns that step because it
    runs once for the whole protocol.
    """
    clarification = response.clarification if isinstance(response.clarification, dict) else {}
    draft = empty_coding()
    draft["location"] = _location(clarification)
    draft["content"] = list(contents)
    draft["determinants"] = _determinants(clarification, contents)
    draft["pair"] = _pair(response, clarification)
    # normalize_coding is the same gate a psychologist's payload passes through,
    # so a draft can never carry a code the manual save would have rejected.
    return normalize_coding(draft)


def _location(clarification: dict[str, Any]) -> str | None:
    """W when the whole blot was used, otherwise D/Dd by how much was marked."""
    if clarification.get("whole"):
        return "W"

    marks = clarification.get("location_marks")
    if not isinstance(marks, list) or not marks:
        # No clarification yet: leave it for the coder rather than guess.
        return None

    return "D" if _area(marks) >= COMMON_DETAIL_AREA else "Dd"


def _area(marks: list[Any]) -> float:
    """
    Total marked fraction of the card.

    Overlapping marks are summed rather than unioned: a coder who drew two
    overlapping boxes meant one region, and over-counting it pushes the result
    toward D, which is the commoner code and the safer default.
    """
    total = 0.0
    for mark in marks:
        if not isinstance(mark, dict):
            continue
        try:
            total += float(mark.get("w") or 0) * float(mark.get("h") or 0)
        except (TypeError, ValueError):
            continue
    return min(total, 1.0)


def _determinants(clarification: dict[str, Any], contents: list[str]) -> list[str]:
    """
    One determinant per reason the examinee gave.

    Three reasons name a family rather than a code. Movement is settled by what
    was seen — a human moves (M), an animal moves (FM), anything else is
    inanimate movement (m). Colour and depth are not settled by anything the
    text carries, so each falls back to its conservative member.
    """
    reasons = clarification.get("reasons")
    if not isinstance(reasons, list):
        return []

    out: list[str] = []
    for reason in reasons:
        code = _determinant_for(reason, contents)
        if code and code not in out:
            out.append(code)
    return out


def _determinant_for(reason: Any, contents: list[str]) -> str | None:
    if not isinstance(reason, str):
        return None
    if reason in _UNAMBIGUOUS:
        return _UNAMBIGUOUS[reason]
    if reason == MOVEMENT:
        if any(code in _HUMAN for code in contents):
            return "M"
        if any(code in _ANIMAL for code in contents):
            return "FM"
        return "m"
    if reason == COLOR:
        return COLOR_DEFAULT
    if reason == DEPTH:
        return DEPTH_DEFAULT
    # OTHER carries no suggestion, and an unknown reason carries none either.
    return None if not _REASON_SUGGESTS.get(reason) else _REASON_SUGGESTS[reason][0]


def _pair(response: Any, clarification: dict[str, Any]) -> bool:
    """
    Symmetry wording in either round. The clarification text counts too: "چون
    دو طرفش مثل همه" is exactly the justification a pair is scored on.

    A count of two is evidence, not proof — "دو نفر" is a pair, "دو ساعت طول
    کشید" is not. The draft errs toward marking it; unticking a box is cheaper
    for the coder than spotting a pair nobody flagged.
    """
    haystack = normalize(f"{response.response_text or ''} {clarification.get('text') or ''}")
    return _PAIR_PATTERN.search(haystack) is not None
