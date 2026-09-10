import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { MOCK_DEMO } from '@core/mock/mock.providers';
import { applyServerErrors } from '@shared/utils/forms';
import { FormFieldComponent } from '@shared/ui/form-field.component';
import { IconComponent } from '@shared/ui/icon.component';
import { IMAGES } from '@shared/utils/images';
import { AuthShellComponent } from '../components/auth-shell.component';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, FormFieldComponent, IconComponent, AuthShellComponent],
  template: `
    <app-auth-shell [image]="images.authLogin" title="خوش برگشتید" caption="آزمون نیمه‌کاره‌ی شما از همان نقطه ادامه پیدا می‌کند.">
    <div class="card glass-card mx-auto w-full max-w-md">
      <form class="card-body gap-2" [formGroup]="form" (ngSubmit)="submit()">
        <h1 class="text-2xl font-bold">ورود به حساب</h1>
        <p class="text-base-content/60 mb-2 text-sm">
          حساب ندارید؟ <a routerLink="/register" class="link link-primary">ثبت‌نام کنید</a>
        </p>

        @if (expired()) {
          <div role="alert" class="alert alert-warning alert-soft text-sm">نشست شما منقضی شد؛ دوباره وارد شوید.</div>
        }
        @if (error()) {
          <div role="alert" class="alert alert-error alert-soft text-sm">{{ error() }}</div>
        }

        <app-form-field label="ایمیل" [control]="form.controls.email">
          <label class="input w-full">
            <app-icon name="mail" [size]="18" class="opacity-50" />
            <input type="email" dir="ltr" formControlName="email" autocomplete="email" placeholder="you@example.com" />
          </label>
        </app-form-field>

        <app-form-field label="رمز عبور" [control]="form.controls.password">
          <label class="input w-full">
            <app-icon name="lock" [size]="18" class="opacity-50" />
            <input type="password" dir="ltr" formControlName="password" autocomplete="current-password" />
          </label>
        </app-form-field>

        <button class="btn btn-primary mt-4" [disabled]="loading()">
          @if (loading()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          ورود
        </button>

        @if (isMock) {
          <div class="bg-base-200 mt-4 rounded-box p-3 text-sm">
            <div class="mb-2 font-medium">حساب‌های آزمایشی (رمز: <span dir="ltr">{{ demoPassword }}</span>)</div>
            <div class="flex flex-wrap gap-2">
              @for (a of demoAccounts; track a.email) {
                <button type="button" class="btn btn-xs btn-outline" (click)="fill(a.email)">{{ a.label }}</button>
              }
            </div>
          </div>
        }
      </form>
    </div>
    </app-auth-shell>
  `,
})
export class LoginPage {
  protected readonly images = IMAGES;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from query params. */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly isMock = MOCK_DEMO !== null;
  protected readonly demoAccounts = MOCK_DEMO?.accounts ?? [];
  protected readonly demoPassword = MOCK_DEMO?.password ?? '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected fill(email: string): void {
    this.form.setValue({ email, password: this.demoPassword });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const target = this.returnUrl();
        void this.router.navigateByUrl(target?.startsWith('/') ? target : this.auth.homeUrl());
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(applyServerErrors(this.form, err));
      },
    });
  }
}
