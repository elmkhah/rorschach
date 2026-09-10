import { Routes } from '@angular/router';

export const PSYCHOLOGIST_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'داشبورد',
    loadComponent: () => import('./pages/psychologist-dashboard.page').then((m) => m.PsychologistDashboardPage),
  },
  {
    path: 'requests',
    title: 'درخواست‌های ارتباط',
    loadComponent: () => import('./pages/requests.page').then((m) => m.RequestsPage),
  },
  {
    path: 'patients',
    title: 'مراجعان',
    loadComponent: () => import('./pages/patients.page').then((m) => m.PatientsPage),
  },
  {
    path: 'patients/:id',
    title: 'پرونده‌ی مراجع',
    loadComponent: () => import('./pages/patient-detail.page').then((m) => m.PatientDetailPage),
  },
  {
    path: 'assessments/:id',
    title: 'جزئیات آزمون',
    loadComponent: () => import('./pages/session-review.page').then((m) => m.SessionReviewPage),
  },
  {
    path: 'profile',
    title: 'پروفایل',
    loadComponent: () => import('@features/profile/pages/profile.page').then((m) => m.ProfilePage),
  },
  { path: 'chat', loadChildren: () => import('@features/chat/chat.routes').then((m) => m.CHAT_ROUTES) },
];
