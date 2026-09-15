"""
The local word list — the offline half of content-word detection.

Two jobs:

1. it answers on its own when the relay is unavailable, so the endpoint never
   depends on an external service being up or funded;
2. it is the floor under the model's answer — words the lexicon knows are added
   to whatever the model returned, so a distracted model cannot silently drop
   the obvious percept of a protocol.

**What this is not.** These are ordinary Persian words for the things examinees
commonly name, grouped by the R-PAS content category they usually belong to. The
official R-PAS Form Quality and Popular tables are copyrighted and are not
embedded here, exactly as in `rpas/codes.py`. A hit means "this word usually
denotes this category", never "this response is coded this way": `سر` is `Hd` on
a human and `Ad` on an animal, and only the coder can tell which (docs/10 §5).
"""
from __future__ import annotations

import re

#: Persian words by R-PAS content code. Codes come from `rpas/codes.py`;
#: `NC` collects the recognisable percepts R-PAS gives no own content code to.
WORDS: dict[str, tuple[str, ...]] = {
    "H": (
        "آدم", "انسان", "مرد", "زن", "بچه", "کودک", "دختر", "پسر", "پیرمرد", "پیرزن",
        "نوزاد", "سرباز", "رقصنده", "دونده", "ورزشکار", "خانم", "آقا", "مادر", "پدر",
        "دوقلو", "آدمک", "کشیش", "پرستار", "خواننده", "نوازنده",
    ),
    "(H)": (
        "دیو", "جن", "غول", "هیولا", "فرشته", "شیطان", "جادوگر", "پری", "روح", "ربات",
        "زامبی", "آدم فضایی", "موجود فضایی", "ابرقهرمان", "شخصیت کارتونی", "بت",
    ),
    "Hd": (
        "سر آدم", "صورت آدم", "دست", "پا", "چشم", "انگشت", "بازو", "شانه", "دهان",
        "بینی", "گوش", "گردن", "لب", "ابرو", "مو", "کمر", "زانو", "مشت", "کف دست",
        "نیم‌تنه", "هیکل", "سایه‌ی آدم",
    ),
    "(Hd)": (
        "ماسک", "نقاب", "سر دیو", "صورت شیطان", "صورت جن", "سر غول", "چهره‌ی هیولا",
    ),
    "Hx": (
        "عشق", "خشم", "غم", "ترس", "شادی", "نفرت", "اضطراب", "افسردگی", "دلتنگی",
        "عصبانیت", "تنهایی",
    ),
    "A": (
        "خفاش", "پروانه", "پرنده", "خرس", "سگ", "گربه", "عقاب", "مورچه", "عنکبوت",
        "خرچنگ", "فیل", "موش", "گرگ", "روباه", "اسب", "شیر", "پلنگ", "ببر", "ماهی",
        "مار", "قورباغه", "سوسک", "زنبور", "لاک‌پشت", "کرم", "پشه", "مگس", "خرگوش",
        "گاو", "بز", "گوسفند", "آهو", "کانگورو", "میمون", "شتر", "جوجه", "مرغ",
        "خروس", "کبوتر", "عقرب", "حلزون", "هشت‌پا", "ملخ", "سنجاب", "جغد", "طاووس",
        "کرگدن", "اسب آبی", "دایناسور", "پنگوئن", "دلفین", "نهنگ", "کوسه", "سوسمار",
        "مارمولک", "خزنده", "حشره", "حیوان", "پرستو", "لک‌لک", "بوقلمون", "قو",
    ),
    "(A)": (
        "اژدها", "ققنوس", "سیمرغ", "اسب بالدار", "اسب تک‌شاخ", "هیولای دریایی",
        "حیوان افسانه‌ای", "حیوان خیالی",
    ),
    "Ad": (
        "بال", "پنجه", "دم", "شاخ", "منقار", "آرواره", "شاخک", "سم", "پر", "خز",
        "پوست حیوان", "سر حیوان", "سر گاو", "کله‌ی حیوان", "چنگال", "نیش", "لاک",
    ),
    "(Ad)": ("بال اژدها", "سر اژدها", "شاخ دیو", "پنجه‌ی هیولا"),
    "An": (
        "استخوان", "جمجمه", "ستون فقرات", "دنده", "قفسه سینه", "ریه", "قلب", "کلیه",
        "مغز", "روده", "معده", "کبد", "لگن", "اسکلت", "مهره", "رگ", "عضله", "رحم",
        "آناتومی", "عکس رادیولوژی", "رادیولوژی", "ام‌آر‌آی", "دستگاه گوارش",
    ),
    "Art": (
        "نقاشی", "تابلو", "مجسمه", "تندیس", "کنده‌کاری", "طرح تزئینی", "آرم", "نشان",
        "لوگو", "گلدوزی", "کاشی‌کاری", "مینیاتور",
    ),
    "Ay": (
        "توتم", "ماسک قبیله‌ای", "فسیل", "آثار باستانی", "سنگ‌نگاره", "نقش غار",
        "تاج پادشاهی", "سپر جنگی", "نیزه‌ی باستانی", "مومیایی",
    ),
    "Bl": ("خون", "خونریزی", "لخته‌ی خون", "خون‌آلود"),
    "Cg": (
        "لباس", "کلاه", "کفش", "دامن", "کت", "پیراهن", "شلوار", "جوراب", "دستکش",
        "کراوات", "پالتو", "کمربند", "روسری", "چکمه", "مانتو", "پاپیون", "شنل",
    ),
    "Ex": ("انفجار", "بمب", "قارچ اتمی", "ترکیدن", "فوران", "آتشفشان"),
    "Fi": ("آتش", "شعله", "دود", "آتش‌سوزی", "جرقه", "مشعل"),
    "Sx": ("آلت", "اندام جنسی", "سینه", "باسن", "رابطه‌ی جنسی"),
    "NC": (
        "گل", "درخت", "برگ", "بوته", "ریشه", "شاخه", "جنگل", "کوه", "تپه", "صخره",
        "ابر", "آسمان", "دریا", "رودخانه", "آبشار", "جزیره", "غار", "بیابان", "برف",
        "نقشه", "موشک", "هواپیما", "قایق", "کشتی", "ماشین", "دوچرخه", "خانه", "پل",
        "برج", "فواره", "چراغ", "لوستر", "صندلی", "میز", "فرش", "قالی", "گلدان",
        "کاسه", "لیوان", "قیچی", "چاقو", "کلید", "ساعت", "عینک", "چتر", "طناب",
        "سنگ", "شمع", "ستاره", "ماه", "خورشید", "سایه", "لکه", "جوهر", "پروانه‌ی کاغذی",
    ),
}

#: Confidence reported for a dictionary hit. Deliberately middling: the word is
#: certain, the category is only usual (see the module docstring).
LEXICON_CONFIDENCE = 0.7

# ---- normalisation ---------------------------------------------------------

#: Arabic letters typed on Persian keyboards, and the marks that survive a paste.
_FOLD = str.maketrans(
    {
        "ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه",
        "أ": "ا", "إ": "ا", "ٱ": "ا", "ؤ": "و", "ئ": "ی",
        "‌": "", "‏": "", "‎": "",  # ZWNJ and direction marks
        "ً": "", "ٌ": "", "ٍ": "", "َ": "",
        "ُ": "", "ِ": "", "ّ": "", "ْ": "",
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
        "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
        "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    }
)

_WHITESPACE = re.compile(r"\s+")


def normalize(text: str) -> str:
    """
    Folds a response into one comparable spelling.

    The zero-width non-joiner is dropped rather than turned into a space, so
    `لاک‌پشت` and `لاکپشت` — the same word typed two ways — become one string.
    """
    return _WHITESPACE.sub(" ", str(text or "").translate(_FOLD)).strip()


# A letter for boundary purposes: Arabic-script block plus Latin word characters.
_LETTER = r"ء-ۿA-Za-z0-9"
#: Persian noun endings that must not block a match (`خفاش‌ها`, `پروانه‌ای`).
_SUFFIX = r"(?:هایی|های|ها|ای|ی|ان|ات)?"


def _pattern(word: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![{_LETTER}]){re.escape(word)}{_SUFFIX}(?![{_LETTER}])")


def _build() -> tuple[tuple[str, str, re.Pattern[str]], ...]:
    """
    `(word as written above, content code, matcher)`, longest first: `سر آدم`
    must win over `سر`, and `بال اژدها` over `بال`.
    """
    entries = [
        (word, code, _pattern(normalized))
        for code, words in WORDS.items()
        for word in words
        if (normalized := normalize(word))
    ]
    entries.sort(key=lambda entry: len(normalize(entry[0])), reverse=True)
    return tuple(entries)


ENTRIES = _build()


def scan(text: str) -> list[tuple[str, str]]:
    """
    Returns `(word, content_code)` for every known word in `text`, in reading
    order and without overlaps — a phrase match consumes the words inside it.

    The word reported is the dictionary spelling, not the inflected form found
    in the response: the coder reads `بال`, not `بال‌های`, and two inflections
    of one word in a single response collapse into one hint.
    """
    haystack = normalize(text)
    if not haystack:
        return []

    taken: list[tuple[int, int]] = []
    found: list[tuple[int, str, str]] = []
    for word, code, pattern in ENTRIES:
        for match in pattern.finditer(haystack):
            start, end = match.span()
            if any(start < t_end and t_start < end for t_start, t_end in taken):
                continue
            taken.append((start, end))
            found.append((start, word, code))

    found.sort(key=lambda item: item[0])
    return [(word, code) for _start, word, code in found]
