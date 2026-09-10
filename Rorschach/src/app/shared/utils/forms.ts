import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ApiErrorBody } from '@core/models';

/**
 * Maps a DRF-style 400 body onto form controls (`errors.<field>` → `{ server: msg }`).
 * Returns the top-level message to show above the form.
 */
export function applyServerErrors(form: FormGroup, err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'خطای ناشناخته رخ داد.';
  const body = (err.error ?? {}) as ApiErrorBody;
  for (const [field, messages] of Object.entries(body.errors ?? {})) {
    const control = form.get(field);
    if (control && messages.length) {
      control.setErrors({ server: messages[0] });
      control.markAsTouched();
    }
  }
  if (err.status === 0) return 'ارتباط با سرور برقرار نشد.';
  return body.detail ?? 'درخواست با خطا مواجه شد.';
}

/** Group validator: `b` must equal `a`. Error is set on `b`. */
export function matchValidator(a: string, b: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const target = group.get(b);
    if (!target) return null;
    const mismatch = group.get(a)?.value !== target.value;
    if (mismatch && target.value) target.setErrors({ ...(target.errors ?? {}), mismatch: true });
    else if (target.hasError('mismatch')) {
      const { mismatch: _m, ...rest } = target.errors ?? {};
      target.setErrors(Object.keys(rest).length ? rest : null);
    }
    return null;
  };
}
