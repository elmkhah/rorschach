import { Routes } from '@angular/router';
import { approvedPsychologistGuard, authGuard, roleGuard } from '@core/guards/auth.guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@layouts/public-layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'آزمون آنلاین رورشاخ',
        loadComponent: () => import('@features/landing/pages/home.page').then((m) => m.HomePage),
      },
      { path: '', loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES) },
    ],
  },
  {
    path: 'patient',
    canMatch: [authGuard, roleGuard('PATIENT')],
    loadComponent: () => import('@layouts/dashboard-layout/dashboard-layout.component').then((m) => m.DashboardLayoutComponent),
    loadChildren: () => import('@features/patient/patient.routes').then((m) => m.PATIENT_ROUTES),
  },
  {
    path: 'psychologist',
    canMatch: [authGuard, roleGuard('PSYCHOLOGIST'), approvedPsychologistGuard],
    loadComponent: () => import('@layouts/dashboard-layout/dashboard-layout.component').then((m) => m.DashboardLayoutComponent),
    loadChildren: () => import('@features/psychologist/psychologist.routes').then((m) => m.PSYCHOLOGIST_ROUTES),
  },
  {
    path: 'admin',
    canMatch: [authGuard, roleGuard('ADMIN')],
    loadComponent: () => import('@layouts/dashboard-layout/dashboard-layout.component').then((m) => m.DashboardLayoutComponent),
    loadChildren: () => import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    // Focus mode: no sidebar / notifications (docs/02 §6).
    path: 'assessment',
    canMatch: [authGuard, roleGuard('PATIENT')],
    loadComponent: () => import('@layouts/focus-layout/focus-layout.component').then((m) => m.FocusLayoutComponent),
    loadChildren: () => import('@features/assessment/assessment.routes').then((m) => m.ASSESSMENT_ROUTES),
  },
  {
    path: '**',
    title: 'صفحه یافت نشد',
    loadComponent: () => import('@shared/pages/not-found.page').then((m) => m.NotFoundPage),
  },
];
