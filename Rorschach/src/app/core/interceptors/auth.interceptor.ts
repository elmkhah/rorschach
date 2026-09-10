import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { TokenStore } from '@core/auth/token-store';
import { environment } from '@env/environment';
import { catchError, switchMap, throwError } from 'rxjs';

const AUTH_ENDPOINTS = /\/auth\/(login|register|refresh|logout)\/$/;

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/** Attaches the access token; on 401 refreshes once and retries the request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const tokens = inject(TokenStore);
  const auth = inject(AuthService);
  const isAuthCall = AUTH_ENDPOINTS.test(req.url);

  return next(withToken(req, tokens.access())).pipe(
    catchError((err: unknown) => {
      if (isAuthCall || !(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      return auth.refresh().pipe(
        catchError((refreshErr: unknown) => {
          auth.expire();
          return throwError(() => refreshErr);
        }),
        switchMap((token) => next(withToken(req, token))),
      );
    }),
  );
};
