import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { Role } from '@core/models';

/** Must be signed in; otherwise go to /login and come back afterwards. */
export const authGuard: CanMatchFn = (_route, segments) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  const returnUrl = '/' + segments.map((s) => s.path).join('/');
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl } });
};

/** Login/register pages: signed-in users go straight to their home. */
export const guestGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

/** UX-level role routing only — the backend enforces the real permission. */
export function roleGuard(...roles: Role[]): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const role = auth.role();
    if (role && roles.includes(role)) return true;
    return inject(Router).parseUrl(auth.homeUrl());
  };
}

/** Unverified psychologists (BR-01) only see the verification page. */
export const approvedPsychologistGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.verificationStatus() === 'APPROVED'
    ? true
    : inject(Router).parseUrl('/verification-pending');
};
