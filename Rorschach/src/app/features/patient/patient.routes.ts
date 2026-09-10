import { Routes } from '@angular/router';

export const PATIENT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'داشبورد',
    loadComponent: () => import('./pages/patient-dashboard.page').then((m) => m.PatientDashboardPage),
  },
  {
    path: 'psychologists',
    title: 'روان‌شناسان',
    loadComponent: () => import('./pages/psychologists.page').then((m) => m.PsychologistsPage),
  },
  {
    path: 'psychologists/:id',
    title: 'پروفایل روان‌شناس',
    loadComponent: () => import('./pages/psychologist-detail.page').then((m) => m.PsychologistDetailPage),
  },
  {
    path: 'assessments',
    title: 'آزمون‌ها و سوابق',
    loadComponent: () => import('./pages/patient-assessments.page').then((m) => m.PatientAssessmentsPage),
  },
  {
    path: 'profile',
    title: 'پروفایل',
    loadComponent: () => import('@features/profile/pages/profile.page').then((m) => m.ProfilePage),
  },
  { path: 'chat', loadChildren: () => import('@features/chat/chat.routes').then((m) => m.CHAT_ROUTES) },
];
