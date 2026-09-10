import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'داشبورد مدیریت',
    loadComponent: () => import('./pages/admin-dashboard.page').then((m) => m.AdminDashboardPage),
  },
  { path: 'users', title: 'کاربران', loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage) },
  {
    path: 'psychologists',
    title: 'تأیید روان‌شناسان',
    loadComponent: () => import('./pages/psychologist-verification.page').then((m) => m.PsychologistVerificationPage),
  },
  {
    path: 'relationships',
    title: 'روابط',
    loadComponent: () => import('./pages/admin-relationships.page').then((m) => m.AdminRelationshipsPage),
  },
  { path: 'tests', title: 'آزمون‌ها', loadComponent: () => import('./pages/tests.page').then((m) => m.TestsPage) },
  {
    path: 'tests/versions/:id',
    title: 'نسخه‌ی آزمون',
    loadComponent: () => import('./pages/test-version.page').then((m) => m.TestVersionPage),
  },
  {
    path: 'assessments',
    title: 'جلسات آزمون',
    loadComponent: () => import('./pages/admin-assessments.page').then((m) => m.AdminAssessmentsPage),
  },
  {
    path: 'audit-logs',
    title: 'گزارش رویدادها',
    loadComponent: () => import('./pages/audit-logs.page').then((m) => m.AuditLogsPage),
  },
];
