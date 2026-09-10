import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from '@core/guards/auth.guards';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'ورود',
    canMatch: [guestGuard],
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'ثبت‌نام',
    canMatch: [guestGuard],
    loadComponent: () => import('./pages/register-role.page').then((m) => m.RegisterRolePage),
  },
  {
    path: 'register/:role',
    title: 'ثبت‌نام',
    canMatch: [guestGuard],
    loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'verification-pending',
    title: 'تأیید حساب',
    canMatch: [authGuard, roleGuard('PSYCHOLOGIST')],
    loadComponent: () => import('./pages/verification-pending.page').then((m) => m.VerificationPendingPage),
  },
];
