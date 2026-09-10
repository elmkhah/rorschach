import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastService } from '@core/services/toast.service';
import { catchError, throwError } from 'rxjs';

/**
 * Global toasts for failures a page can't meaningfully handle itself.
 * 400/401/404/409 are left to the caller (form errors, auth refresh, empty states).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 0) toast.error('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.');
        else if (err.status === 403) toast.error(err.error?.detail ?? 'به این بخش دسترسی ندارید.');
        else if (err.status === 429) toast.warning('تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.');
        else if (err.status >= 500) toast.error('خطای سرور رخ داد. لطفاً دوباره تلاش کنید.');
      }
      return throwError(() => err);
    }),
  );
};
