import { Role } from '@core/models';
import { IconName } from '@shared/ui/icon.component';

export interface NavItem {
  label: string;
  icon: IconName;
  path: string;
  exact?: boolean;
  /** Shown in the mobile bottom dock (max 5). */
  dock?: boolean;
}

export const ROLE_BASE: Record<Role, string> = {
  PATIENT: '/patient',
  PSYCHOLOGIST: '/psychologist',
  ADMIN: '/admin',
};

export const NAV: Record<Role, NavItem[]> = {
  PATIENT: [
    { label: 'داشبورد', icon: 'dashboard', path: '/patient', exact: true, dock: true },
    { label: 'روان‌شناسان', icon: 'stethoscope', path: '/patient/psychologists', dock: true },
    { label: 'آزمون‌ها و سوابق', icon: 'clipboard', path: '/patient/assessments', dock: true },
    { label: 'گفت‌وگو', icon: 'message', path: '/patient/chat', dock: true },
    { label: 'پروفایل', icon: 'user', path: '/patient/profile', dock: true },
  ],
  PSYCHOLOGIST: [
    { label: 'داشبورد', icon: 'dashboard', path: '/psychologist', exact: true, dock: true },
    { label: 'درخواست‌ها', icon: 'user-check', path: '/psychologist/requests', dock: true },
    { label: 'مراجعان', icon: 'users', path: '/psychologist/patients', dock: true },
    { label: 'گفت‌وگو', icon: 'message', path: '/psychologist/chat', dock: true },
    { label: 'پروفایل', icon: 'user', path: '/psychologist/profile', dock: true },
  ],
  ADMIN: [
    { label: 'داشبورد', icon: 'dashboard', path: '/admin', exact: true, dock: true },
    { label: 'کاربران', icon: 'users', path: '/admin/users', dock: true },
    { label: 'تأیید روان‌شناسان', icon: 'shield', path: '/admin/psychologists', dock: true },
    { label: 'روابط', icon: 'link', path: '/admin/relationships' },
    { label: 'آزمون‌ها', icon: 'layers', path: '/admin/tests', dock: true },
    { label: 'جلسات آزمون', icon: 'clipboard', path: '/admin/assessments' },
    { label: 'گزارش رویدادها', icon: 'history', path: '/admin/audit-logs', dock: true },
  ],
};
