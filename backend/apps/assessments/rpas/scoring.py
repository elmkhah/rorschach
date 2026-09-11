"""
R-PAS raw variable computation and the non-definitive, rule-based reading of it.

Port of `core/mock/rpas-scoring.ts`, which the documentation names as the
reference implementation (docs/10). Values are RAW: no conversion to R-PAS
standard scores, because that needs the copyrighted normative tables.

The output is versioned by RPAS_ALGORITHM_VERSION — bump it whenever a weight,
threshold or formula changes, so old analyses stay interpretable.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from typing import Any

from apps.assessments.rpas.codes import COGNITIVE_WEIGHTS, SEVERE_COGNITIVE, fa_digits

RPAS_ALGORITHM_VERSION = "rpas-raw-0.1"

Domain = str
ADMINISTRATION = "ADMINISTRATION"
ENGAGEMENT = "ENGAGEMENT"
PERCEPTION = "PERCEPTION"
SELF_OTHER = "SELF_OTHER"
STRESS = "STRESS"

HUMAN_CONTENT = ("H", "(H)", "Hd", "(Hd)", "Hx")

#: R-PAS recommends a protocol of 16–27 responses.
R_MIN, R_MAX = 16, 27


def _round2(x: float) -> float:
    value = round(x + 0.0, 2)
    return int(value) if value == int(value) else value


def _ratio(a: float, b: float) -> float | None:
    return _round2(a / b) if b > 0 else None


def _variable(
    key: str, label: str, value: float | None, fmt: str, hint: str | None = None
) -> dict[str, Any]:
    out: dict[str, Any] = {"key": key, "label": label, "value": value, "format": fmt}
    if hint:
        out["hint"] = hint
    return out


def compute_rpas(responses: Sequence[Any], administration: dict[str, Any]) -> dict[str, Any]:
    """
    `responses` may be model instances or plain dicts; only `coding` and
    `measurement_data` are read, so the analysis can also be recomputed from a
    stored protocol snapshot.
    """
    rows = [_row(r) for r in responses]
    total_responses = len(rows)
    coded: list[dict[str, Any]] = [r["coding"] for r in rows if r["coding"]]
    n = len(coded)

    def cv(value: float | None) -> float | None:
        """Coding-derived variables stay null until something is coded."""
        return value if n else None

    def count(pred: Callable[[dict[str, Any]], bool]) -> int:
        return sum(1 for c in coded if pred(c))

    def det(code: str) -> int:
        return count(lambda c: code in c["determinants"])

    def cont(code: str) -> int:
        return count(lambda c: code in c["content"])

    def them(code: str) -> int:
        return count(lambda c: code in c["thematic_codes"])

    def loc(code: str) -> int:
        return count(lambda c: c["location"] == code)

    def fq(code: str) -> int:
        return count(lambda c: c["form_quality"] == code)

    pure_f = count(lambda c: c["determinants"] == ["F"])
    blends = count(lambda c: len([d for d in c["determinants"] if d != "F"]) >= 2)
    fq_scored = count(lambda c: c["form_quality"] not in (None, "n"))
    wd = [c for c in coded if c["location"] in ("W", "D")]
    wd_scored = sum(1 for c in wd if c["form_quality"] not in (None, "n"))
    wd_minus = sum(1 for c in wd if c["form_quality"] == "-")
    wsum_cog = sum(
        COGNITIVE_WEIGHTS.get(code, 0) for c in coded for code in c["cognitive_codes"]
    )
    sev_cog = sum(
        1 for c in coded for code in c["cognitive_codes"] if code in SEVERE_COGNITIVE
    )

    m_human = det("M")
    fm = det("FM")
    m_inanimate = det("m")
    fc, cf, c_pure = det("FC"), det("CF"), det("C")
    c_achromatic = det("C'")
    t, v, y = det("T"), det("V"), det("Y")
    sum_c = fc + cf + c_pure
    wsum_c = fc * 0.5 + cf + c_pure * 1.5
    mc = m_human + wsum_c
    ppd = fm + m_inanimate + c_achromatic + t + v + y
    human_content = sum(cont(code) for code in HUMAN_CONTENT)
    popular = count(lambda c: c["popular"])

    reactions = [
        r["reaction_time_ms"] for r in rows if isinstance(r["reaction_time_ms"], int | float)
    ]
    mean_rt = round(sum(reactions) / len(reactions)) if reactions else None

    adm = {**administration}
    variables: dict[Domain, list[dict[str, Any]]] = {
        ADMINISTRATION: [
            _variable(
                "R",
                "تعداد پاسخ‌ها (R)",
                total_responses,
                "count",
                "بازه‌ی توصیه‌شده در R-PAS: ۱۶ تا ۲۷",
            ),
            _variable("Pr", "یادآوری (Pr)", adm.get("prompts", 0), "count"),
            _variable("Pu", "برداشتن کارت (Pu)", adm.get("pulls", 0), "count"),
            _variable("CT", "چرخاندن کارت (CT)", adm.get("card_turns", 0), "count"),
            _variable("Int", "وقفه در اجرا", adm.get("interruptions", 0), "count"),
            _variable("Hidden", "خروج از صفحه", adm.get("tab_hidden", 0), "count"),
            _variable("RT", "میانگین زمان واکنش", mean_rt, "ms"),
        ],
        ENGAGEMENT: [
            _variable("F%", "پاسخ‌های فرم خالص (F%)", cv(_ratio(pure_f, n)), "percent"),
            _variable("Blend", "پاسخ‌های ترکیبی (Blend)", cv(blends), "count"),
            _variable("Sy", "ترکیب/سنتز (Sy)", cv(count(lambda c: c["synthesis"])), "count"),
            _variable("W%", "پاسخ‌های کل لکه (W%)", cv(_ratio(loc("W"), n)), "percent"),
            _variable("Dd%", "جزئیات غیرمعمول (Dd%)", cv(_ratio(loc("Dd"), n)), "percent"),
            _variable("SI", "ادغام فضا (SI)", cv(count(lambda c: "SI" in c["space"])), "count"),
            _variable("MC", "منابع (MC = M + WSumC)", cv(_round2(mc)), "number"),
        ],
        PERCEPTION: [
            _variable("FQo%", "کیفیت فرم معمول (FQo%)", cv(_ratio(fq("o"), fq_scored)), "percent"),
            _variable("FQ-%", "کیفیت فرم ضعیف (FQ-%)", cv(_ratio(fq("-"), fq_scored)), "percent"),
            _variable("WD-%", "فرم ضعیف در W و D (WD-%)", cv(_ratio(wd_minus, wd_scored)), "percent"),
            _variable("P", "پاسخ‌های رایج (P)", cv(popular), "count"),
            _variable("WSumCog", "مجموع وزنی کدهای شناختی (WSumCog)", cv(wsum_cog), "count"),
            _variable("SevCog", "کدهای شناختی شدید (SevCog)", cv(sev_cog), "count"),
        ],
        SELF_OTHER: [
            _variable("M", "حرکت انسانی (M)", cv(m_human), "count"),
            _variable("H", "انسان کامل (H)", cv(cont("H")), "count"),
            _variable("SumH", "کل محتوای انسانی", cv(human_content), "count"),
            _variable("COP", "همکاری (COP)", cv(them("COP")), "count"),
            _variable("MAH", "بازنمایی سالم (MAH)", cv(them("MAH")), "count"),
            _variable("MAP", "بازنمایی مرضی (MAP)", cv(them("MAP")), "count"),
            _variable("AGM", "حرکت پرخاشگرانه (AGM)", cv(them("AGM")), "count"),
            _variable("AGC", "محتوای پرخاشگرانه (AGC)", cv(them("AGC")), "count"),
            _variable("ODL", "وابستگی دهانی (ODL)", cv(them("ODL")), "count"),
            _variable("PER", "شخصی‌سازی (PER)", cv(them("PER")), "count"),
            _variable("Pair", "جفت (2)", cv(count(lambda c: c["pair"])), "count"),
        ],
        STRESS: [
            _variable("m", "حرکت غیرزنده (m)", cv(m_inanimate), "count"),
            _variable("Y", "سایه‌ی منتشر (Y)", cv(y), "count"),
            _variable("C'", "رنگ آکروماتیک (C′)", cv(c_achromatic), "count"),
            _variable("T", "بافت (T)", cv(t), "count"),
            _variable("V", "بُعد سایه‌ای (V)", cv(v), "count"),
            _variable("MOR", "آسیب/مرگ (MOR)", cv(them("MOR")), "count"),
            _variable("WSumC", "مجموع وزنی رنگ (WSumC)", cv(_round2(wsum_c)), "number"),
            _variable(
                "CF+C/SumC",
                "سهم رنگ کمتر مهارشده ((CF+C)/SumC)",
                cv(_ratio(cf + c_pure, sum_c)),
                "ratio",
            ),
            _variable("PPD", "فشارهای درونی (PPD)", cv(ppd), "count"),
            _variable("MC-PPD", "منابع منهای فشار (MC−PPD)", cv(_round2(mc - ppd)), "number"),
        ],
    }

    findings: list[dict[str, Any]] = []
    caveats: list[str] = []

    def add(domain: Domain, text: str, basis: Iterable[str], confidence: str = "LOW") -> None:
        findings.append(
            {"domain": domain, "text": text, "basis": list(basis), "confidence": confidence}
        )

    if total_responses < R_MIN:
        add(
            ADMINISTRATION,
            "تعداد پاسخ‌ها کمتر از بازه‌ی توصیه‌شده‌ی R-PAS (۱۶ تا ۲۷) است؛ "
            "پروتکل ممکن است برای تفسیر کافی نباشد.",
            ["R"],
            "MODERATE",
        )
    if total_responses > R_MAX:
        add(
            ADMINISTRATION,
            "تعداد پاسخ‌ها بیشتر از بازه‌ی توصیه‌شده است؛ برخی شاخص‌ها ممکن است بیش‌برآورد شوند.",
            ["R"],
            "MODERATE",
        )
    if adm.get("prompts", 0) >= 4:
        add(
            ADMINISTRATION,
            "فرد در چند کارت فقط یک پاسخ داده و به یادآوری نیاز داشته است؛ "
            "ممکن است نشانه‌ی احتیاط یا درگیری کمتر با تکلیف باشد.",
            ["Pr"],
        )
    if adm.get("interruptions", 0) > 0 or adm.get("tab_hidden", 0) > 2:
        add(
            ADMINISTRATION,
            "اجرای آزمون با وقفه یا خروج از صفحه همراه بوده است؛ شرایط اجرا را در تفسیر لحاظ کنید.",
            ["Int", "Hidden"],
            "MODERATE",
        )

    if n == 0:
        caveats.append("هنوز هیچ پاسخی کدگذاری نشده است؛ فقط متغیرهای اجرایی محاسبه شده‌اند.")
    else:
        if n < total_responses:
            caveats.append(
                f"کدگذاری کامل نیست ({fa_digits(n)} از {fa_digits(total_responses)} پاسخ)؛ شاخص‌ها موقت‌اند."
            )
        f_pct = pure_f / n
        if f_pct >= 0.5:
            add(
                ENGAGEMENT,
                "سهم بالای پاسخ‌های صرفاً مبتنی بر فرم ممکن است نشان‌دهنده‌ی سبک پردازش "
                "ساده‌تر یا محتاطانه باشد.",
                ["F%"],
            )
        if blends / n >= 0.3 and f_pct < 0.3:
            add(
                ENGAGEMENT,
                "ترکیب چند عامل تعیین‌کننده در بسیاری از پاسخ‌ها می‌تواند نشانه‌ی درگیری "
                "پیچیده‌تر با محرک باشد.",
                ["Blend", "F%"],
            )
        if fq_scored > 0 and fq("-") / fq_scored >= 0.2:
            add(
                PERCEPTION,
                "نسبت قابل‌توجهی از پاسخ‌ها کیفیت فرم ضعیف دارند؛ احتمال دشواری در ادراک "
                "واقع‌بینانه باید بالینی بررسی شود.",
                ["FQ-%", "WD-%"],
                "MODERATE",
            )
        if sev_cog >= 1 or wsum_cog >= 12:
            add(
                PERCEPTION,
                "نشانه‌هایی از ناهمخوانی در استدلال یا بیان دیده می‌شود؛ تفسیر نیازمند "
                "بررسی کیفی پاسخ‌هاست.",
                ["WSumCog", "SevCog"],
                "MODERATE",
            )
        if total_responses >= 14 and popular <= 2:
            add(
                PERCEPTION,
                "تعداد پاسخ‌های رایج کم است؛ ممکن است همسویی کمتری با ادراک‌های متعارف وجود داشته باشد.",
                ["P"],
            )
        if m_human >= 3 and them("COP") > 0:
            add(
                SELF_OTHER,
                "وجود حرکت انسانی و تعامل همکارانه می‌تواند نشانه‌ی ظرفیت بازنمایی روابط انسانی باشد.",
                ["M", "COP"],
            )
        if them("MAP") > them("MAH"):
            add(
                SELF_OTHER,
                "بازنمایی‌های مرضی از روابط بیش از بازنمایی‌های سالم است؛ ممکن است انتظارات "
                "منفی از روابط وجود داشته باشد.",
                ["MAP", "MAH"],
                "MODERATE",
            )
        if them("AGM") + them("AGC") >= 3:
            add(SELF_OTHER, "مضامین پرخاشگرانه چند بار تکرار شده است.", ["AGM", "AGC"])
        if total_responses >= 14 and human_content == 0:
            add(
                SELF_OTHER,
                "محتوای انسانی در پاسخ‌ها دیده نمی‌شود؛ ممکن است توجه کمتری به دیگران وجود داشته باشد.",
                ["SumH"],
            )
        if mc - ppd <= -3:
            add(
                STRESS,
                "فشارها و تجربه‌های ناخواسته (PPD) از منابع در دسترس (MC) بیشتر است؛ "
                "ممکن است فرد تحت فشار روانی باشد.",
                ["MC-PPD"],
                "MODERATE",
            )
        if m_inanimate + y >= 3:
            add(
                STRESS,
                "حرکت غیرزنده و سایه‌ی منتشر (m و Y) بالاست؛ ممکن است با استرس موقعیتی "
                "یا احساس درماندگی مرتبط باشد.",
                ["m", "Y"],
            )
        if them("MOR") >= 2:
            add(
                STRESS,
                "مضامین آسیب یا مرگ چند بار دیده می‌شود؛ ممکن است با خلق منفی یا تصور "
                "آسیب‌دیدگی مرتبط باشد.",
                ["MOR"],
                "MODERATE",
            )
        if c_achromatic + v >= 3:
            add(
                STRESS,
                "استفاده‌ی مکرر از رنگ آکروماتیک و بُعد سایه‌ای ممکن است با عواطف دردناک "
                "یا خودانتقادی مرتبط باشد.",
                ["C'", "V"],
            )

    caveats.append(
        "مقادیر خام‌اند و با جداول هنجار R-PAS (نمره‌ی استاندارد) مقایسه نشده‌اند؛ "
        "آستانه‌ها تقریبی و اکتشافی‌اند."
    )
    caveats.append(
        "این تفسیر خودکار و غیرقطعی است، ادعای تشخیص ندارد و جایگزین قضاوت بالینی روان‌شناس نیست."
    )

    return {
        "coding_system": "R-PAS",
        "R": total_responses,
        "coded": n,
        "variables": variables,
        "findings": findings,
        "caveats": caveats,
    }


def _row(response: Any) -> dict[str, Any]:
    """Normalises a response (model or dict) to what the scorer needs."""
    if isinstance(response, dict):
        coding = response.get("coding")
        measurements = response.get("measurement_data") or {}
    else:
        coding = response.coding
        measurements = response.measurement_data or {}
    return {
        "coding": _coding(coding),
        "reaction_time_ms": measurements.get("reaction_time_ms"),
    }


def _coding(coding: Any) -> dict[str, Any] | None:
    if not coding:
        return None
    return {
        "location": coding.get("location"),
        "space": coding.get("space") or [],
        "content": coding.get("content") or [],
        "synthesis": bool(coding.get("synthesis")),
        "vague": bool(coding.get("vague")),
        "pair": bool(coding.get("pair")),
        "form_quality": coding.get("form_quality"),
        "popular": bool(coding.get("popular")),
        "determinants": coding.get("determinants") or [],
        "cognitive_codes": coding.get("cognitive_codes") or [],
        "thematic_codes": coding.get("thematic_codes") or [],
    }
