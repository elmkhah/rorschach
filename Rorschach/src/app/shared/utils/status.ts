// Persian labels + daisyUI badge tone for every status enum in the domain.
export type Tone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'ghost';

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const STATUS_META: Record<string, StatusMeta> = {
  // Relationship
  PENDING: { label: 'در انتظار', tone: 'warning' },
  ACTIVE: { label: 'فعال', tone: 'success' },
  REJECTED: { label: 'ردشده', tone: 'error' },
  REVOKED: { label: 'لغوشده', tone: 'ghost' },
  // Verification
  REGISTERED: { label: 'ثبت‌نام‌شده', tone: 'neutral' },
  PENDING_VERIFICATION: { label: 'در انتظار تأیید', tone: 'warning' },
  APPROVED: { label: 'تأییدشده', tone: 'success' },
  SUSPENDED: { label: 'تعلیق', tone: 'error' },
  // Assessment session
  CREATED: { label: 'ایجادشده', tone: 'neutral' },
  IN_PROGRESS: { label: 'در حال انجام', tone: 'info' },
  PAUSED: { label: 'متوقف', tone: 'warning' },
  COMPLETED: { label: 'تکمیل‌شده', tone: 'success' },
  ABANDONED: { label: 'رهاشده', tone: 'ghost' },
  CANCELLED: { label: 'لغوشده', tone: 'ghost' },
  // Test definition
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  ARCHIVED: { label: 'بایگانی', tone: 'ghost' },
  // Roles
  PATIENT: { label: 'مراجع', tone: 'info' },
  PSYCHOLOGIST: { label: 'روان‌شناس', tone: 'primary' },
  ADMIN: { label: 'مدیر', tone: 'neutral' },
};

export function statusMeta(status: string | null | undefined): StatusMeta {
  return (status && STATUS_META[status]) || { label: status ?? '—', tone: 'ghost' };
}

export const BADGE_TONE: Record<Tone, string> = {
  neutral: 'badge-neutral badge-soft',
  primary: 'badge-primary badge-soft',
  info: 'badge-info badge-soft',
  success: 'badge-success badge-soft',
  warning: 'badge-warning badge-soft',
  error: 'badge-error badge-soft',
  ghost: 'badge-ghost',
};
