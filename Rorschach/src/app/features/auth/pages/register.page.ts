import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { applyServerErrors, matchValidator } from '@shared/utils/forms';
import { FormFieldComponent } from '@shared/ui/form-field.component';
import { IMAGES } from '@shared/utils/images';
import { AuthShellComponent } from '../components/auth-shell.component';

type RoleParam = 'patient' | 'psychologist';

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, FormFieldComponent, AuthShellComponent],
  template: `
    <app-auth-shell [image]="images.authRegister" title="شروعی آرام و امن" caption="اطلاعات شما فقط با روان‌شناسی که انتخاب می‌کنید به اشتراک گذاشته می‌شود.">
    <div class="card glass-card w-full">
      <form class="card-body gap-1" [formGroup]="form" (ngSubmit)="submit()">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h1 class="text-2xl font-bold">ثبت‌نام {{ isPsychologist() ? 'روان‌شناس' : 'مراجع' }}</h1>
          <a routerLink="/register" class="btn btn-ghost btn-xs">تغییر نوع حساب</a>
        </div>

        @if (isPsychologist()) {
          <div role="alert" class="alert alert-info alert-soft mb-2 text-sm">
            پس از ثبت‌نام باید مدارک حرفه‌ای خود را بارگذاری کنید؛ حساب شما پس از تأیید مدیر فعال می‌شود.
          </div>
        }
        @if (error()) {
          <div role="alert" class="alert alert-error alert-soft text-sm">{{ error() }}</div>
        }

        <div class="grid gap-x-4 sm:grid-cols-2">
          <app-form-field label="نام" [control]="form.controls.first_name">
            <input class="input w-full" formControlName="first_name" autocomplete="given-name" />
          </app-form-field>
          <app-form-field label="نام خانوادگی" [control]="form.controls.last_name">
            <input class="input w-full" formControlName="last_name" autocomplete="family-name" />
          </app-form-field>
        </div>

        <app-form-field label="ایمیل" [control]="form.controls.email">
          <input class="input w-full" type="email" dir="ltr" formControlName="email" autocomplete="email" />
        </app-form-field>

        <app-form-field label="شماره‌ی موبایل" [optional]="true" [control]="form.controls.phone">
          <input class="input w-full" type="tel" dir="ltr" formControlName="phone" placeholder="09xxxxxxxxx" autocomplete="tel" />
        </app-form-field>

        @if (isPsychologist()) {
          <div class="grid gap-x-4 sm:grid-cols-2">
            <app-form-field label="حوزه‌ی تخصص" [control]="form.controls.specialty">
              <input class="input w-full" formControlName="specialty" placeholder="مثلاً روان‌شناسی بالینی" />
            </app-form-field>
            <app-form-field label="کد نظام روان‌شناسی" [control]="form.controls.professional_code">
              <input class="input w-full" dir="ltr" formControlName="professional_code" />
            </app-form-field>
          </div>
        }

        <div class="grid gap-x-4 sm:grid-cols-2">
          <app-form-field label="رمز عبور" [control]="form.controls.password" hint="حداقل ۸ کاراکتر">
            <input class="input w-full" type="password" dir="ltr" formControlName="password" autocomplete="new-password" />
          </app-form-field>
          <app-form-field label="تکرار رمز عبور" [control]="form.controls.password_confirm">
            <input class="input w-full" type="password" dir="ltr" formControlName="password_confirm" autocomplete="new-password" />
          </app-form-field>
        </div>

        <button class="btn btn-primary mt-4" [disabled]="loading()">
          @if (loading()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          ایجاد حساب
        </button>
        <p class="text-base-content/60 mt-2 text-center text-sm">
          حساب دارید؟ <a routerLink="/login" class="link link-primary">وارد شوید</a>
        </p>
      </form>
    </div>
    </app-auth-shell>
  `,
})
export class RegisterPage {
  protected readonly images = IMAGES;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Route param. */
  readonly role = input.required<string>();
  protected readonly isPsychologist = computed(() => (this.role() as RoleParam) === 'psychologist');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.pattern(/^09\d{9}$/)],
      specialty: [''],
      professional_code: [''],
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required],
    },
    { validators: matchValidator('password', 'password_confirm') },
  );

  constructor() {
    const router = this.router;
    effect(() => {
      const role = this.role();
      if (role !== 'patient' && role !== 'psychologist') void router.navigateByUrl('/register');
      const required = role === 'psychologist' ? [Validators.required] : [];
      for (const name of ['specialty', 'professional_code'] as const) {
        this.form.controls[name].setValidators(required);
        this.form.controls[name].updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .register({
        role: this.isPsychologist() ? 'PSYCHOLOGIST' : 'PATIENT',
        email: v.email,
        password: v.password,
        phone: v.phone || null,
        first_name: v.first_name,
        last_name: v.last_name,
        ...(this.isPsychologist() ? { specialty: v.specialty, professional_code: v.professional_code } : {}),
      })
      .subscribe({
        next: () => void this.router.navigateByUrl(this.auth.homeUrl()),
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(applyServerErrors(this.form, err));
        },
      });
  }
}
