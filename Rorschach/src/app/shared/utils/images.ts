// Every non-test image the app expects. Drop a file at `public<src>` and it
// replaces the placeholder automatically (no code change needed).

export interface ImageSlot {
  src: string;
  hint: string;
}

export const IMAGES = {
  logo: { src: '/images/brand/logo.svg', hint: 'لوگو — SVG یا PNG شفاف، ارتفاع حدود ۴۰px' },
  landingHero: { src: '/images/landing/hero.jpg', hint: 'تصویر اصلی صفحه‌ی نخست — عمودی، حدود ۹۰۰×۱۱۰۰' },
  landingPsychologist: { src: '/images/landing/psychologists.jpg', hint: 'بخش «روان‌شناس هستید؟» — حدود ۸۰۰×۹۰۰' },
  authLogin: { src: '/images/auth/login.webp', hint: 'کنار فرم ورود — عمودی، حدود ۹۰۰×۱۱۰۰' },
  authRegister: { src: '/images/auth/register.jpg', hint: 'کنار فرم ثبت‌نام — عمودی، حدود ۹۰۰×۱۱۰۰' },
  patientDashboard: { src: '/images/dashboard/patient.jpg', hint: 'بنر داشبورد مراجع — حدود ۶۰۰×۴۰۰' },
} as const satisfies Record<string, ImageSlot>;

/** Psychologist photos (mock data): /images/avatars/psychologist-{1..5}.webp — square, 400×400. */
export const PSYCHOLOGIST_AVATAR = (n: number): string => `/images/avatars/psychologist-${n}.webp`;
