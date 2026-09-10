import { HttpInterceptorFn } from '@angular/common/http';

export const MOCK_INTERCEPTORS: HttpInterceptorFn[] = [];

export const MOCK_DEMO: { password: string; accounts: { label: string; email: string }[] } | null = null;
