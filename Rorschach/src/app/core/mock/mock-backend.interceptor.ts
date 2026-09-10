import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { environment } from '@env/environment';
import { delay, of, switchMap, throwError, timer } from 'rxjs';
import { adminRoutes } from './handlers/admin.handlers';
import { assessmentRoutes } from './handlers/assessments.handlers';
import { authRoutes, userFromAuthHeader } from './handlers/auth.handlers';
import { communicationRoutes } from './handlers/communication.handlers';
import { relationshipRoutes } from './handlers/relationships.handlers';
import { compileRoutes, MockError } from './mock-router';

const LATENCY_MS = 250;

const match = compileRoutes([
  ...authRoutes,
  ...relationshipRoutes,
  ...assessmentRoutes,
  ...communicationRoutes,
  ...adminRoutes,
]);

/**
 * Answers `/api/v1/**` from the in-memory mock DB. Registered last in the
 * interceptor chain (dev only), so auth/error interceptors behave exactly as
 * they will against Django.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiBaseUrl;
  if (!req.url.startsWith(base)) return next(req);

  const url = new URL(req.urlWithParams, window.location.origin);
  const path = url.pathname.slice(base.length);
  const error = (status: number, body: unknown) =>
    timer(LATENCY_MS).pipe(
      switchMap(() => throwError(() => new HttpErrorResponse({ status, error: body, url: req.url }))),
    );

  const found = match(req.method, path);
  if (!found) return error(404, { detail: `Mock route not found: ${req.method} ${path}` });

  const { route, params } = found;
  const user = userFromAuthHeader(req.headers.get('Authorization'));
  if (!route.public && !user) return error(401, { detail: 'احراز هویت لازم است.' });
  if (route.roles && (!user || !route.roles.includes(user.role))) {
    return error(403, { detail: 'به این بخش دسترسی ندارید.' });
  }

  try {
    const body = route.handler({ method: req.method, path, params, query: url.searchParams, body: req.body, user });
    // Clone so components can't mutate mock state by reference.
    const safe = body === null || body === undefined ? null : structuredClone(body);
    return of(new HttpResponse({ status: route.status ?? 200, body: safe, url: req.url })).pipe(delay(LATENCY_MS));
  } catch (e) {
    if (e instanceof MockError) return error(e.status, e.body);
    console.error('[mock-backend]', e);
    return error(500, { detail: 'Mock handler crashed' });
  }
};
