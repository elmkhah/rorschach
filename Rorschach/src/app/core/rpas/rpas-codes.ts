// R-PAS code catalog used by the psychologist coding panel (and the mock scorer).
// Definitions follow the R-PAS manual; official FQ / Popular tables are NOT
// embedded — the coder applies them.
import { ResponseCoding } from '@core/models';

export interface RpasCode {
  code: string;
  label: string;
}

export const LOCATION_CODES: RpasCode[] = [
  { code: 'W', label: 'کل لکه' },
  { code: 'D', label: 'جزء رایج' },
  { code: 'Dd', label: 'جزء غیرمعمول' },
];

export const SPACE_CODES: RpasCode[] = [
  { code: 'SR', label: 'وارونگی فضا — فضای سفید خودِ شیء است' },
  { code: 'SI', label: 'ادغام فضا — فضای سفید با لکه ترکیب شده' },
];

export const CONTENT_CODES: RpasCode[] = [
  { code: 'H', label: 'انسان کامل' },
  { code: '(H)', label: 'انسان خیالی / غیرواقعی' },
  { code: 'Hd', label: 'جزء انسانی' },
  { code: '(Hd)', label: 'جزء انسانی خیالی' },
  { code: 'Hx', label: 'تجربه‌ی انسانی (احساس، ادراک)' },
  { code: 'A', label: 'حیوان کامل' },
  { code: '(A)', label: 'حیوان خیالی' },
  { code: 'Ad', label: 'جزء حیوانی' },
  { code: '(Ad)', label: 'جزء حیوانی خیالی' },
  { code: 'An', label: 'آناتومی' },
  { code: 'Art', label: 'هنر' },
  { code: 'Ay', label: 'انسان‌شناسی / فرهنگی' },
  { code: 'Bl', label: 'خون' },
  { code: 'Cg', label: 'پوشاک' },
  { code: 'Ex', label: 'انفجار' },
  { code: 'Fi', label: 'آتش' },
  { code: 'Sx', label: 'جنسی' },
  { code: 'NC', label: 'سایر محتواها' },
];

export const FQ_CODES: RpasCode[] = [
  { code: 'o', label: 'معمول (ordinary)' },
  { code: 'u', label: 'نامعمول (unusual)' },
  { code: '-', label: 'ضعیف / نامتناسب (minus)' },
  { code: 'n', label: 'بدون فرم (none)' },
];

export const DETERMINANT_CODES: RpasCode[] = [
  { code: 'M', label: 'حرکت انسانی' },
  { code: 'FM', label: 'حرکت حیوانی' },
  { code: 'm', label: 'حرکت غیرزنده' },
  { code: 'FC', label: 'فرم غالب بر رنگ' },
  { code: 'CF', label: 'رنگ غالب بر فرم' },
  { code: 'C', label: 'رنگ خالص' },
  { code: "C'", label: 'رنگ آکروماتیک (سیاه، سفید، خاکستری)' },
  { code: 'T', label: 'بافت (Texture)' },
  { code: 'V', label: 'بُعد سایه‌ای (Vista)' },
  { code: 'Y', label: 'سایه‌ی منتشر (Diffuse shading)' },
  { code: 'r', label: 'انعکاس (Reflection)' },
  { code: 'FD', label: 'بُعد فرمی (Form Dimension)' },
  { code: 'F', label: 'فرم خالص' },
];

export const COGNITIVE_CODES: RpasCode[] = [
  { code: 'DV1', label: 'انحراف کلامی — سطح ۱' },
  { code: 'DV2', label: 'انحراف کلامی — سطح ۲' },
  { code: 'INC1', label: 'ترکیب ناسازگار — سطح ۱' },
  { code: 'INC2', label: 'ترکیب ناسازگار — سطح ۲' },
  { code: 'DR1', label: 'پاسخ انحرافی — سطح ۱' },
  { code: 'DR2', label: 'پاسخ انحرافی — سطح ۲' },
  { code: 'FAB1', label: 'ترکیب خیال‌پردازانه — سطح ۱' },
  { code: 'FAB2', label: 'ترکیب خیال‌پردازانه — سطح ۲' },
  { code: 'PEC', label: 'توضیح ادراکی غیرمنطقی' },
  { code: 'CON', label: 'آلودگی (Contamination)' },
];

export const THEMATIC_CODES: RpasCode[] = [
  { code: 'ABS', label: 'بازنمایی انتزاعی' },
  { code: 'PER', label: 'شخصی‌سازی' },
  { code: 'COP', label: 'حرکت همکارانه' },
  { code: 'MAH', label: 'بازنمایی سالم رابطه' },
  { code: 'MAP', label: 'بازنمایی مرضی رابطه' },
  { code: 'AGM', label: 'حرکت پرخاشگرانه' },
  { code: 'AGC', label: 'محتوای پرخاشگرانه' },
  { code: 'MOR', label: 'آسیب، مرگ، تباهی' },
  { code: 'ODL', label: 'وابستگی دهانی' },
];

/**
 * Clarification Phase: reasons the examinee can pick for "what makes it look like that".
 * `suggests` lists the determinants a coder may consider — a hint, never an automatic code.
 */
export const CLARIFICATION_REASONS: (RpasCode & { suggests: string[] })[] = [
  { code: 'FORM', label: 'شکلش', suggests: ['F'] },
  { code: 'MOVEMENT', label: 'حرکت یا حالتی که دارد', suggests: ['M', 'FM', 'm'] },
  { code: 'COLOR', label: 'رنگش', suggests: ['FC', 'CF', 'C'] },
  { code: 'ACHROMATIC', label: 'سیاه، سفید یا خاکستری بودنش', suggests: ["C'"] },
  { code: 'TEXTURE', label: 'بافت یا زبری‌اش (مثل خز یا پوست)', suggests: ['T'] },
  { code: 'DEPTH', label: 'عمق یا دوری و نزدیکی', suggests: ['V', 'FD'] },
  { code: 'SHADING', label: 'سایه‌روشن و کم‌رنگ و پررنگی', suggests: ['Y'] },
  { code: 'REFLECTION', label: 'قرینه یا انعکاس (مثل تصویر در آب یا آینه)', suggests: ['r'] },
  { code: 'OTHER', label: 'دلیل دیگر', suggests: [] },
];

export function reasonLabel(code: string, withHint = false): string {
  const r = CLARIFICATION_REASONS.find((x) => x.code === code);
  if (!r) return code;
  return withHint && r.suggests.length ? `${r.label} (${r.suggests.join('، ')})` : r.label;
}

/** Weights for WSumCog (verify against the R-PAS manual before clinical use). */
export const COGNITIVE_WEIGHTS: Record<string, number> = {
  DV1: 1,
  DV2: 2,
  INC1: 2,
  INC2: 4,
  DR1: 3,
  DR2: 6,
  FAB1: 4,
  FAB2: 7,
  PEC: 4,
  CON: 7,
};

/** Codes counted in SevCog. */
export const SEVERE_COGNITIVE = ['DV2', 'INC2', 'DR2', 'FAB2', 'PEC', 'CON'];

export function emptyCoding(): ResponseCoding {
  return {
    location: null,
    space: [],
    content: [],
    synthesis: false,
    vague: false,
    pair: false,
    form_quality: null,
    popular: false,
    determinants: [],
    cognitive_codes: [],
    thematic_codes: [],
    notes: '',
  };
}

/** R-PAS ordered code line, e.g. "WSR  (Hd)  o  F". */
export function codeString(c: ResponseCoding | null): string {
  if (!c) return '';
  return [
    (c.location ?? '?') + c.space.join(''),
    c.content.join(','),
    c.synthesis ? 'Sy' : '',
    c.vague ? 'Vg' : '',
    c.pair ? '2' : '',
    c.form_quality ?? '',
    c.popular ? 'P' : '',
    c.determinants.join('.'),
    c.cognitive_codes.join(','),
    c.thematic_codes.join(','),
  ]
    .filter(Boolean)
    .join('  ');
}
