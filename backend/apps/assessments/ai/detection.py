"""
Content-word detection over the Response Phase — the first round, where the
examinee says what the card looks like and nothing has been clarified yet.

The flow is one relay call for the whole protocol, then a merge:

    responses ─┬─► relay (one JSON call) ─┐
               └─► local lexicon ─────────┴─► merged, de-duplicated hints

The relay is allowed to be wrong but not to be creative: a word it reports is
dropped unless it literally appears in that response, and a category it reports
is dropped unless it is one of the eighteen R-PAS content codes. What survives
is a suggestion for the coder (docs/10 §5) — it is never written into `coding`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from apps.assessments.ai import client
from apps.assessments.ai.lexicon import LEXICON_CONFIDENCE, normalize, scan
from apps.assessments.rpas.codes import CONTENT_CODES, CONTENT_LABELS

#: Where a hint came from.
AI = "AI"
LEXICON = "LEXICON"

#: Guard rails: the prompt stays small and one response cannot flood the UI.
MAX_ITEMS_PER_RESPONSE = 12
MAX_TEXT_LENGTH = 400
MAX_WORD_LENGTH = 60

SYSTEM_PROMPT = """
تو دستیار کدگذاری آزمون رورشاخ (سیستم R-PAS) هستی.

ورودی، پاسخ‌های «دور اول» (مرحله‌ی پاسخ‌دهی) یک مراجع است: چیزی که هر کارت به نظرش
شبیه آن بوده. وظیفه‌ی تو فقط یک چیز است: در متن هر پاسخ، کلمه‌هایی را پیدا کن که
یک «محتوا»ی نام‌برده را نشان می‌دهند و آن‌ها را به یکی از کدهای محتوای R-PAS نسبت بده.

قواعد سخت‌گیرانه:
۱. فقط کلمه‌هایی را برگردان که عیناً در متن همان پاسخ آمده‌اند. کلمه نساز و مترادف ننویس.
۲. برای هر کلمه دقیقاً یکی از کدهای مجاز را انتخاب کن. کد خارج از فهرست ممنوع است.
۳. صفت، فعل، رنگ و توضیح حالت کلمه‌ی محتوا نیستند؛ فقط چیزی که دیده شده.
۴. اگر پاسخی هیچ محتوای قابل تشخیصی ندارد، فهرست آن را خالی بگذار.
۵. تشخیص تو پیشنهاد است، نه کدگذاری نهایی؛ در مواردی که مطمئن نیستی confidence پایین بده.

خروجی فقط یک شیء JSON با این شکل، بدون هیچ متن اضافه:
{"responses":[{"id":"<شناسه>","items":[{"text":"<کلمه>","content":"<کد>","confidence":<۰ تا ۱>}]}]}
""".strip()


@dataclass(slots=True)
class Detection:
    """One detected word and the content category it points at."""

    text: str
    content: str
    confidence: float
    source: str

    def as_dict(self) -> dict:
        return {
            "text": self.text,
            "content": self.content,
            "label": CONTENT_LABELS.get(self.content, ""),
            "confidence": round(self.confidence, 2),
            "source": self.source,
        }


@dataclass(slots=True)
class DetectionRun:
    """The outcome for a whole protocol."""

    by_response: dict[str, list[Detection]]
    source: str
    model: str
    error: str = ""


def run_detection(texts: dict[str, str]) -> DetectionRun:
    """
    `texts` maps a response id to its raw text; the ids come back untouched.

    Always returns a result. When the relay is off, unconfigured or failing, the
    run degrades to the lexicon and reports why in `error`.
    """
    if not texts:
        return DetectionRun(by_response={}, source=LEXICON, model="")

    lexical = {key: _from_lexicon(text) for key, text in texts.items()}

    try:
        answered = _from_relay(texts)
    except client.GatewayError as exc:
        return DetectionRun(by_response=lexical, source=LEXICON, model="", error=str(exc))

    merged = {key: _merge(answered.get(key, []), lexical[key]) for key in texts}
    return DetectionRun(by_response=merged, source=AI, model=client.model_name())


# ---- the two detectors ------------------------------------------------------


def _from_lexicon(text: str) -> list[Detection]:
    return [
        Detection(text=word, content=code, confidence=LEXICON_CONFIDENCE, source=LEXICON)
        for word, code in scan(text)
    ]


def _from_relay(texts: dict[str, str]) -> dict[str, list[Detection]]:
    payload = client.chat_json(SYSTEM_PROMPT, _user_prompt(texts))
    out: dict[str, list[Detection]] = {}

    for entry in payload.get("responses") or []:
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("id") or "")
        if key not in texts:
            # An id we never sent: the model invented it, so there is nothing
            # to attach the hint to.
            continue
        out[key] = _items_of(entry.get("items"), texts[key])

    return out


def _items_of(items: object, source_text: str) -> list[Detection]:
    haystack = normalize(source_text)
    kept: list[Detection] = []

    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        word = str(item.get("text") or "").strip()[:MAX_WORD_LENGTH]
        code = str(item.get("content") or "")
        # The hallucination guard: a word the examinee did not write is not a
        # word the examinee attributed to the card. Compared on the folded
        # spelling, kept as the model wrote it.
        if not word or code not in CONTENT_CODES or normalize(word) not in haystack:
            continue
        kept.append(
            Detection(
                text=word,
                content=code,
                confidence=_confidence(item.get("confidence")),
                source=AI,
            )
        )

    return kept


# ---- assembly ---------------------------------------------------------------


def _merge(primary: list[Detection], fallback: list[Detection]) -> list[Detection]:
    """
    The model's hints first, then the lexicon words it did not mention. A word
    is the same hint only when the category matches too: `سر` as `Hd` and `سر`
    as `Ad` are two different readings and the coder should see both.
    """
    merged: list[Detection] = []
    seen: set[tuple[str, str]] = set()
    for detection in (*primary, *fallback):
        # Folded, so `پروانه‌ی` from the model and `پروانه` from the lexicon are
        # recognised as the same hint.
        key = (normalize(detection.text), detection.content)
        if key in seen:
            continue
        seen.add(key)
        merged.append(detection)
    return merged[:MAX_ITEMS_PER_RESPONSE]


def _user_prompt(texts: dict[str, str]) -> str:
    codes = "\n".join(f"- {code}: {CONTENT_LABELS.get(code, '')}" for code in CONTENT_CODES)
    responses = [
        {"id": key, "text": str(text or "")[:MAX_TEXT_LENGTH]} for key, text in texts.items()
    ]
    return (
        "کدهای محتوای مجاز:\n"
        f"{codes}\n\n"
        "پاسخ‌های دور اول:\n"
        f"{json.dumps(responses, ensure_ascii=False, indent=1)}"
    )


def _confidence(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.5
    return min(1.0, max(0.0, number))
