import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

const MESSAGES: Record<string, (e: unknown) => string> = {
  required: () => 'این فیلد الزامی است.',
  email: () => 'ایمیل معتبر نیست.',
  minlength: (e) => `حداقل ${(e as { requiredLength: number }).requiredLength} کاراکتر وارد کنید.`,
  maxlength: (e) => `حداکثر ${(e as { requiredLength: number }).requiredLength} کاراکتر مجاز است.`,
  pattern: () => 'قالب وارد‌شده معتبر نیست.',
  min: (e) => `حداقل مقدار ${(e as { min: number }).min} است.`,
  max: (e) => `حداکثر مقدار ${(e as { max: number }).max} است.`,
  mismatch: () => 'مقادیر یکسان نیستند.',
  server: (e) => String(e),
};

/**
 * daisyUI fieldset wrapper: label + projected control + first validation error.
 * Default change detection on purpose — control state changes come from projected content.
 */
@Component({
  selector: 'app-form-field',
  host: { class: 'block' },
  template: `
    <fieldset class="fieldset py-1">
      <legend class="fieldset-legend text-sm font-medium">
        {{ label() }}
        @if (optional()) {
          <span class="text-base-content/50 font-normal">(اختیاری)</span>
        }
      </legend>
      <ng-content />
      @if (error()) {
        <p class="label text-error whitespace-normal">{{ error() }}</p>
      } @else if (hint()) {
        <p class="label whitespace-normal">{{ hint() }}</p>
      }
    </fieldset>
  `,
})
export class FormFieldComponent {
  readonly label = input.required<string>();
  readonly control = input<AbstractControl | null>(null);
  readonly hint = input<string>();
  readonly optional = input(false);

  protected error(): string | null {
    const c = this.control();
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    const [key, value] = Object.entries(c.errors)[0];
    return (MESSAGES[key] ?? (() => 'مقدار نامعتبر است.'))(value);
  }
}
