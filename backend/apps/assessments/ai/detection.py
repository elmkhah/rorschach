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
from apps.assessments.ai.lexicon import (
    AMBIGUOUS_BODY_PARTS,
    LEXICON_CONFIDENCE,
    normalize,
    scan,
)
from apps.assessments.rpas.codes import CONTENT_CODES, CONTENT_LABELS

#: Where a hint came from.
AI = "AI"
LEXICON = "LEXICON"

#: Guard rails: the prompt stays small and one response cannot flood the UI.
MAX_ITEMS_PER_RESPONSE = 12
MAX_TEXT_LENGTH = 400
MAX_WORD_LENGTH = 60

#: Output allowance, sized from the protocol rather than fixed.
BASE_OUTPUT_TOKENS = 300
PER_RESPONSE_TOKENS = 150
MAX_OUTPUT_TOKENS = 8000

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

قاعده‌ی پرانتز — مهم‌ترین جایی که اشتباه می‌شود:
کدهای پرانتزدار «(H)» و «(Hd)» و «(A)» و «(Ad)» فقط برای موجودات **خیالی و
غیرواقعی**‌اند: اژدها، دیو، غول، فرشته، ققنوس، شخصیت کارتونی. حیوان یا انسان
**واقعی** هرگز پرانتز نمی‌گیرد. خفاش، خرس، پروانه، عنکبوت و خرگوش حیوان واقعی‌اند
و همیشه «A» هستند — اینکه در یک لکه‌ی جوهر دیده شده‌اند آن‌ها را خیالی نمی‌کند.

جزء بدن: اگر جزء به حیوان تعلق دارد «Ad» و اگر به انسان «Hd». در «یه خرگوش که
گوش‌هاش بلنده»، گوش «Ad» است نه «Hd».

نمونه:
«یه خفاش سیاه که بال‌هاش بازه» ← خفاش=A و بال=Ad
«یه اژدها با دم بلند» ← اژدها=(A) و دم=(Ad)
«دو تا آدم که دست همدیگه رو گرفتن» ← آدم=H و دست=Hd

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
        alone = {key: _merge(items, []) for key, items in lexical.items()}
        return DetectionRun(by_response=alone, source=LEXICON, model="", error=str(exc))

    merged = {key: _merge(answered.get(key, []), lexical[key]) for key in texts}
    return DetectionRun(by_response=merged, source=AI, model=client.model_name())


# ---- the two detectors ------------------------------------------------------


def _from_lexicon(text: str) -> list[Detection]:
    return [
        Detection(text=word, content=code, confidence=LEXICON_CONFIDENCE, source=LEXICON)
        for word, code in scan(text)
    ]


def _from_relay(texts: dict[str, str]) -> dict[str, list[Detection]]:
    """
    The model is addressed with short handles (`R1`, `R2`, …), never with the
    response UUIDs.

    It has to echo every id back, and a UUID costs more output tokens than the
    hint it labels: on a twenty-response protocol the echoed UUIDs alone ran the
    answer past its token ceiling and truncated the JSON mid-object.
    """
    handles = {f"R{index}": key for index, key in enumerate(texts, start=1)}
    asked = {handle: texts[key] for handle, key in handles.items()}

    payload = client.chat_json(SYSTEM_PROMPT, _user_prompt(asked), max_tokens=_budget(asked))
    out: dict[str, list[Detection]] = {}

    for entry in payload.get("responses") or []:
        if not isinstance(entry, dict):
            continue
        key = handles.get(str(entry.get("id") or ""))
        if key is None:
            # A handle we never sent: the model invented it, so there is
            # nothing to attach the hint to.
            continue
        out[key] = _items_of(entry.get("items"), texts[key])

    return out


def _budget(asked: dict[str, str]) -> int:
    """
    Output tokens to allow. A ten-card protocol answered in ~950 tokens, so the
    allowance per response is deliberately several times that, and the ceiling
    only exists to keep a runaway answer from becoming a runaway bill.
    """
    return min(MAX_OUTPUT_TOKENS, BASE_OUTPUT_TOKENS + PER_RESPONSE_TOKENS * len(asked))


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


#: An `Hd` part read as `Ad` once the answer turns out to be about an animal.
_TO_ANIMAL_PART = {"Hd": "Ad", "(Hd)": "(Ad)"}


def _settle_body_parts(detections: list[Detection]) -> list[Detection]:
    """
    A body part belongs to whatever the answer said it saw.

    «یه خرگوش که گوش‌هاش بلنده» names an animal and no human, so the ear is
    `Ad`, not the dictionary's default `Hd`. When the answer names both — a
    rider and a horse — nothing is moved: that is a genuine ambiguity and the
    coder is the one who can see the card.
    """
    codes = {detection.content for detection in detections}
    if not codes & {"A", "(A)"} or codes & {"H", "(H)"}:
        return detections

    for detection in detections:
        target = _TO_ANIMAL_PART.get(detection.content)
        if target and normalize(detection.text) in AMBIGUOUS_BODY_PARTS:
            detection.content = target
    return detections


def _merge(primary: list[Detection], fallback: list[Detection]) -> list[Detection]:
    """
    The model's hints first, then the lexicon words it did not mention, then the
    body parts settled onto the creature the answer named.

    De-duplication runs twice on purpose: settling can turn two readings that
    disagreed — the model's `Ad` and the dictionary's default `Hd` for the same
    ear — into the same hint, and the coder should see it once.
    """
    return _dedupe(_settle_body_parts(_dedupe([*primary, *fallback])))[:MAX_ITEMS_PER_RESPONSE]


def _dedupe(detections: list[Detection]) -> list[Detection]:
    """
    A word is the same hint only when the category matches too: `سر` as `Hd` and
    `سر` as `Ad` are two different readings and the coder should see both. The
    first occurrence wins, so a model hint outranks the dictionary's.
    """
    out: list[Detection] = []
    seen: set[tuple[str, str]] = set()
    for detection in detections:
        # Folded, so `پروانه‌ی` from the model and `پروانه` from the lexicon are
        # recognised as the same hint.
        key = (normalize(detection.text), detection.content)
        if key in seen:
            continue
        seen.add(key)
        out.append(detection)
    return out


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
