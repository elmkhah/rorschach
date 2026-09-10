import { HttpInterceptorFn } from '@angular/common/http';
import { mockBackendInterceptor } from './mock-backend.interceptor';
import { MOCK_PASSWORD } from './mock-db';

// Swapped for mock.providers.prod.ts in production builds (angular.json
// fileReplacements), so no mock code or fixtures ship to users.
export const MOCK_INTERCEPTORS: HttpInterceptorFn[] = [mockBackendInterceptor];

/** Demo credentials shown on the login page in mock mode only (null in production). */
export const MOCK_DEMO: { password: string; accounts: { label: string; email: string }[] } | null = {
  password: MOCK_PASSWORD,
  accounts: [
    { label: 'مراجع', email: 'patient@test.com' },
    { label: 'روان‌شناس', email: 'psych@test.com' },
    { label: 'روان‌شناس (در انتظار تأیید)', email: 'pending@test.com' },
    { label: 'مدیر', email: 'admin@test.com' },
  ],
};
