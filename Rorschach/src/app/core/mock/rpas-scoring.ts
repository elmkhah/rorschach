// Reference implementation of the R-PAS raw variable computation and the
// non-definitive, rule-based interpretation. Lives in the mock backend because
// in production this runs server-side (versioned by RPAS_ALGORITHM_VERSION).
// Values are RAW — no R-PAS normative (standard score) conversion.
import {
  AdministrationRecord,
  AssessmentResponse,
  ResponseCoding,
  RpasDomain,
  RpasFinding,
  RpasResult,
  RpasVariable,
} from '@core/models';
import { COGNITIVE_WEIGHTS, SEVERE_COGNITIVE } from '@core/rpas/rpas-codes';
import { toFaDigits } from '@shared/pipes/fa-number.pipe';

export const RPAS_ALGORITHM_VERSION = 'rpas-raw-0.1';

const round2 = (x: number): number => Math.round(x * 100) / 100;
const ratio = (a: number, b: number): number | null => (b > 0 ? round2(a / b) : null);
const v = (key: string, label: string, value: number | null, format: RpasVariable['format'], hint?: string): RpasVariable => ({
  key,
  label,
  value,
  format,
  hint,
});

export function computeRpas(responses: AssessmentResponse[], adm: AdministrationRecord): RpasResult {
  const R = responses.length;
  const coded = responses.map((r) => r.coding).filter((c): c is ResponseCoding => !!c);
  const n = coded.length;
  const cv = (x: number | null): number | null => (n ? x : null);

  const count = (pred: (c: ResponseCoding) => boolean) => coded.filter(pred).length;
  const det = (code: string) => count((c) => c.determinants.includes(code));
  const cont = (code: string) => count((c) => c.content.includes(code));
  const them = (code: string) => count((c) => c.thematic_codes.includes(code));
  const loc = (code: string) => count((c) => c.location === code);
  const fq = (code: string) => count((c) => c.form_quality === code);

  const pureF = count((c) => c.determinants.length === 1 && c.determinants[0] === 'F');
  const blends = count((c) => c.determinants.filter((d) => d !== 'F').length >= 2);
  const fqScored = count((c) => !!c.form_quality && c.form_quality !== 'n');
  const wd = coded.filter((c) => c.location === 'W' || c.location === 'D');
  const wdScored = wd.filter((c) => !!c.form_quality && c.form_quality !== 'n').length;
  const wdMinus = wd.filter((c) => c.form_quality === '-').length;
  const wsumCog = coded.reduce((s, c) => s + c.cognitive_codes.reduce((t, k) => t + (COGNITIVE_WEIGHTS[k] ?? 0), 0), 0);
  const sevCog = coded.reduce((s, c) => s + c.cognitive_codes.filter((k) => SEVERE_COGNITIVE.includes(k)).length, 0);

  const M = det('M');
  const FM = det('FM');
  const m = det('m');
  const FC = det('FC');
  const CF = det('CF');
  const C = det('C');
  const Cp = det("C'");
  const T = det('T');
  const V = det('V');
  const Y = det('Y');
  const sumC = FC + CF + C;
  const wsumC = FC * 0.5 + CF + C * 1.5;
  const MC = M + wsumC;
  const PPD = FM + m + Cp + T + V + Y;
  const humanContent = ['H', '(H)', 'Hd', '(Hd)', 'Hx'].reduce((s, k) => s + cont(k), 0);
  const P = count((c) => c.popular);

  const reactions = responses
    .map((r) => r.measurement_data?.reaction_time_ms)
    .filter((x): x is number => typeof x === 'number');
  const meanRt = reactions.length ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length) : null;

  const variables: Record<RpasDomain, RpasVariable[]> = {
    ADMINISTRATION: [
      v('R', 'تعداد پاسخ‌ها (R)', R, 'count', 'بازه‌ی توصیه‌شده در R-PAS: ۱۶ تا ۲۷'),
      v('Pr', 'یادآوری (Pr)', adm.prompts, 'count'),
      v('Pu', 'برداشتن کارت (Pu)', adm.pulls, 'count'),
      v('CT', 'چرخاندن کارت (CT)', adm.card_turns, 'count'),
      v('Int', 'وقفه در اجرا', adm.interruptions, 'count'),
      v('Hidden', 'خروج از صفحه', adm.tab_hidden, 'count'),
      v('RT', 'میانگین زمان واکنش', meanRt, 'ms'),
    ],
    ENGAGEMENT: [
      v('F%', 'پاسخ‌های فرم خالص (F%)', cv(ratio(pureF, n)), 'percent'),
      v('Blend', 'پاسخ‌های ترکیبی (Blend)', cv(blends), 'count'),
      v('Sy', 'ترکیب/سنتز (Sy)', cv(count((c) => c.synthesis)), 'count'),
      v('W%', 'پاسخ‌های کل لکه (W%)', cv(ratio(loc('W'), n)), 'percent'),
      v('Dd%', 'جزئیات غیرمعمول (Dd%)', cv(ratio(loc('Dd'), n)), 'percent'),
      v('SI', 'ادغام فضا (SI)', cv(count((c) => c.space.includes('SI'))), 'count'),
      v('MC', 'منابع (MC = M + WSumC)', cv(round2(MC)), 'number'),
    ],
    PERCEPTION: [
      v('FQo%', 'کیفیت فرم معمول (FQo%)', cv(ratio(fq('o'), fqScored)), 'percent'),
      v('FQ-%', 'کیفیت فرم ضعیف (FQ-%)', cv(ratio(fq('-'), fqScored)), 'percent'),
      v('WD-%', 'فرم ضعیف در W و D (WD-%)', cv(ratio(wdMinus, wdScored)), 'percent'),
      v('P', 'پاسخ‌های رایج (P)', cv(P), 'count'),
      v('WSumCog', 'مجموع وزنی کدهای شناختی (WSumCog)', cv(wsumCog), 'count'),
      v('SevCog', 'کدهای شناختی شدید (SevCog)', cv(sevCog), 'count'),
    ],
    SELF_OTHER: [
      v('M', 'حرکت انسانی (M)', cv(M), 'count'),
      v('H', 'انسان کامل (H)', cv(cont('H')), 'count'),
      v('SumH', 'کل محتوای انسانی', cv(humanContent), 'count'),
      v('COP', 'همکاری (COP)', cv(them('COP')), 'count'),
      v('MAH', 'بازنمایی سالم (MAH)', cv(them('MAH')), 'count'),
      v('MAP', 'بازنمایی مرضی (MAP)', cv(them('MAP')), 'count'),
      v('AGM', 'حرکت پرخاشگرانه (AGM)', cv(them('AGM')), 'count'),
      v('AGC', 'محتوای پرخاشگرانه (AGC)', cv(them('AGC')), 'count'),
      v('ODL', 'وابستگی دهانی (ODL)', cv(them('ODL')), 'count'),
      v('PER', 'شخصی‌سازی (PER)', cv(them('PER')), 'count'),
      v('Pair', 'جفت (2)', cv(count((c) => c.pair)), 'count'),
    ],
    STRESS: [
      v('m', 'حرکت غیرزنده (m)', cv(m), 'count'),
      v('Y', 'سایه‌ی منتشر (Y)', cv(Y), 'count'),
      v("C'", 'رنگ آکروماتیک (C′)', cv(Cp), 'count'),
      v('T', 'بافت (T)', cv(T), 'count'),
      v('V', 'بُعد سایه‌ای (V)', cv(V), 'count'),
      v('MOR', 'آسیب/مرگ (MOR)', cv(them('MOR')), 'count'),
      v('WSumC', 'مجموع وزنی رنگ (WSumC)', cv(round2(wsumC)), 'number'),
      v('CF+C/SumC', 'سهم رنگ کمتر مهارشده ((CF+C)/SumC)', cv(ratio(CF + C, sumC)), 'ratio'),
      v('PPD', 'فشارهای درونی (PPD)', cv(PPD), 'count'),
      v('MC-PPD', 'منابع منهای فشار (MC−PPD)', cv(round2(MC - PPD)), 'number'),
    ],
  };

  const findings: RpasFinding[] = [];
  const caveats: string[] = [];
  const add = (domain: RpasDomain, text: string, basis: string[], confidence: RpasFinding['confidence'] = 'LOW') =>
    findings.push({ domain, text, basis, confidence });

  if (R < 16) add('ADMINISTRATION', 'تعداد پاسخ‌ها کمتر از بازه‌ی توصیه‌شده‌ی R-PAS (۱۶ تا ۲۷) است؛ پروتکل ممکن است برای تفسیر کافی نباشد.', ['R'], 'MODERATE');
  if (R > 27) add('ADMINISTRATION', 'تعداد پاسخ‌ها بیشتر از بازه‌ی توصیه‌شده است؛ برخی شاخص‌ها ممکن است بیش‌برآورد شوند.', ['R'], 'MODERATE');
  if (adm.prompts >= 4) add('ADMINISTRATION', 'فرد در چند کارت فقط یک پاسخ داده و به یادآوری نیاز داشته است؛ ممکن است نشانه‌ی احتیاط یا درگیری کمتر با تکلیف باشد.', ['Pr']);
  if (adm.interruptions > 0 || adm.tab_hidden > 2) add('ADMINISTRATION', 'اجرای آزمون با وقفه یا خروج از صفحه همراه بوده است؛ شرایط اجرا را در تفسیر لحاظ کنید.', ['Int', 'Hidden'], 'MODERATE');

  if (n === 0) {
    caveats.push('هنوز هیچ پاسخی کدگذاری نشده است؛ فقط متغیرهای اجرایی محاسبه شده‌اند.');
  } else {
    if (n < R) caveats.push(`کدگذاری کامل نیست (${toFaDigits(n)} از ${toFaDigits(R)} پاسخ)؛ شاخص‌ها موقت‌اند.`);
    const fPct = pureF / n;
    if (fPct >= 0.5) add('ENGAGEMENT', 'سهم بالای پاسخ‌های صرفاً مبتنی بر فرم ممکن است نشان‌دهنده‌ی سبک پردازش ساده‌تر یا محتاطانه باشد.', ['F%']);
    if (blends / n >= 0.3 && fPct < 0.3) add('ENGAGEMENT', 'ترکیب چند عامل تعیین‌کننده در بسیاری از پاسخ‌ها می‌تواند نشانه‌ی درگیری پیچیده‌تر با محرک باشد.', ['Blend', 'F%']);
    if (fqScored > 0 && fq('-') / fqScored >= 0.2) add('PERCEPTION', 'نسبت قابل‌توجهی از پاسخ‌ها کیفیت فرم ضعیف دارند؛ احتمال دشواری در ادراک واقع‌بینانه باید بالینی بررسی شود.', ['FQ-%', 'WD-%'], 'MODERATE');
    if (sevCog >= 1 || wsumCog >= 12) add('PERCEPTION', 'نشانه‌هایی از ناهمخوانی در استدلال یا بیان دیده می‌شود؛ تفسیر نیازمند بررسی کیفی پاسخ‌هاست.', ['WSumCog', 'SevCog'], 'MODERATE');
    if (R >= 14 && P <= 2) add('PERCEPTION', 'تعداد پاسخ‌های رایج کم است؛ ممکن است همسویی کمتری با ادراک‌های متعارف وجود داشته باشد.', ['P']);
    if (M >= 3 && them('COP') > 0) add('SELF_OTHER', 'وجود حرکت انسانی و تعامل همکارانه می‌تواند نشانه‌ی ظرفیت بازنمایی روابط انسانی باشد.', ['M', 'COP']);
    if (them('MAP') > them('MAH')) add('SELF_OTHER', 'بازنمایی‌های مرضی از روابط بیش از بازنمایی‌های سالم است؛ ممکن است انتظارات منفی از روابط وجود داشته باشد.', ['MAP', 'MAH'], 'MODERATE');
    if (them('AGM') + them('AGC') >= 3) add('SELF_OTHER', 'مضامین پرخاشگرانه چند بار تکرار شده است.', ['AGM', 'AGC']);
    if (R >= 14 && humanContent === 0) add('SELF_OTHER', 'محتوای انسانی در پاسخ‌ها دیده نمی‌شود؛ ممکن است توجه کمتری به دیگران وجود داشته باشد.', ['SumH']);
    if (MC - PPD <= -3) add('STRESS', 'فشارها و تجربه‌های ناخواسته (PPD) از منابع در دسترس (MC) بیشتر است؛ ممکن است فرد تحت فشار روانی باشد.', ['MC-PPD'], 'MODERATE');
    if (m + Y >= 3) add('STRESS', 'حرکت غیرزنده و سایه‌ی منتشر (m و Y) بالاست؛ ممکن است با استرس موقعیتی یا احساس درماندگی مرتبط باشد.', ['m', 'Y']);
    if (them('MOR') >= 2) add('STRESS', 'مضامین آسیب یا مرگ چند بار دیده می‌شود؛ ممکن است با خلق منفی یا تصور آسیب‌دیدگی مرتبط باشد.', ['MOR'], 'MODERATE');
    if (Cp + V >= 3) add('STRESS', 'استفاده‌ی مکرر از رنگ آکروماتیک و بُعد سایه‌ای ممکن است با عواطف دردناک یا خودانتقادی مرتبط باشد.', ["C'", 'V']);
  }

  caveats.push('مقادیر خام‌اند و با جداول هنجار R-PAS (نمره‌ی استاندارد) مقایسه نشده‌اند؛ آستانه‌ها تقریبی و اکتشافی‌اند.');
  caveats.push('این تفسیر خودکار و غیرقطعی است، ادعای تشخیص ندارد و جایگزین قضاوت بالینی روان‌شناس نیست.');

  return { coding_system: 'R-PAS', R, coded: n, variables, findings, caveats };
}
