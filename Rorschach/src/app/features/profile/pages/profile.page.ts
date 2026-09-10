import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileApi, ProfilePatch } from '@core/api/profile-api.service';
import { AuthService } from '@core/auth/auth.service';
import { Gender } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { applyServerErrors } from '@shared/utils/forms';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { FormFieldComponent } from '@shared/ui/form-field.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { AchievementsSectionComponent } from '../components/achievements-section.component';

/** Shared by /patient/profile and /psychologist/profile. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FormFieldComponent,
    AvatarComponent,
    StatusBadgeComponent,
    AchievementsSectionComponent,
  ],
  template: `
    <app-page-header title="پروفایل" subtitle="اطلاعات حساب کاربری خود را مدیریت کنید." />

    <div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div class="card glass-card h-fit">
        <div class="card-body items-center text-center">
          <app-avatar [name]="auth.displayName()" size="xl" />
          <h2 class="mt-2 text-lg font-bold">{{ auth.displayName() }}</h2>
          <span class="text-base-content/60 text-sm" dir="ltr">{{ auth.user()?.email }}</span>
          <div class="mt-2 flex gap-2">
            <app-status-badge [status]="auth.role()" />
            @if (isPsychologist()) {
              <app-status-badge [status]="auth.verificationStatus()" />
            }
          </div>
          <p class="text-base-content/50 mt-4 text-xs">بارگذاری تصویر پروفایل پس از اتصال به Object Storage فعال می‌شود.</p>
        </div>
      </div>

      <form class="card glass-card" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-body gap-1">
          @if (error()) {
            <div role="alert" class="alert alert-error alert-soft text-sm">{{ error() }}</div>
          }
          <div class="grid gap-x-4 sm:grid-cols-2">
            <app-form-field label="نام" [control]="form.controls.first_name">
              <input class="input w-full" formControlName="first_name" />
            </app-form-field>
            <app-form-field label="نام خانوادگی" [control]="form.controls.last_name">
              <input class="input w-full" formControlName="last_name" />
            </app-form-field>
            <app-form-field label="شماره‌ی موبایل" [optional]="true" [control]="form.controls.phone">
              <input class="input w-full" dir="ltr" formControlName="phone" placeholder="09xxxxxxxxx" />
            </app-form-field>

            @if (isPsychologist()) {
              <app-form-field label="حوزه‌ی تخصص" [control]="form.controls.specialty">
                <input class="input w-full" formControlName="specialty" />
              </app-form-field>
              <app-form-field label="شهر" [optional]="true" [control]="form.controls.city">
                <input class="input w-full" formControlName="city" />
              </app-form-field>
              <app-form-field label="سال‌های سابقه" [control]="form.controls.years_of_experience">
                <input class="input w-full" type="number" min="0" formControlName="years_of_experience" />
              </app-form-field>
            } @else {
              <app-form-field label="تاریخ تولد" [optional]="true" [control]="form.controls.birth_date">
                <input class="input w-full" type="date" formControlName="birth_date" />
              </app-form-field>
              <app-form-field label="جنسیت" [optional]="true" [control]="form.controls.gender">
                <select class="select w-full" formControlName="gender">
                  <option value="">—</option>
                  <option value="FEMALE">زن</option>
                  <option value="MALE">مرد</option>
                  <option value="OTHER">سایر</option>
                </select>
              </app-form-field>
            }
          </div>

          <app-form-field [label]="isPsychologist() ? 'درباره‌ی من (نمایش برای مراجعان)' : 'درباره‌ی من'" [optional]="true" [control]="form.controls.bio">
            <textarea class="textarea w-full" rows="4" formControlName="bio"></textarea>
          </app-form-field>

          <div class="card-actions mt-4 justify-end">
            <button class="btn btn-primary" [disabled]="saving() || form.pristine">
              @if (saving()) {
                <span class="loading loading-spinner loading-sm"></span>
              }
              ذخیره‌ی تغییرات
            </button>
          </div>
        </div>
      </form>
    </div>

    @if (isPsychologist()) {
      <app-achievements-section class="mt-6 block" />
    }
  `,
})
export class ProfilePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ProfileApi);
  private readonly toast = inject(ToastService);

  protected readonly isPsychologist = computed(() => this.auth.role() === 'PSYCHOLOGIST');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    first_name: ['', Validators.required],
    last_name: ['', Validators.required],
    phone: ['', Validators.pattern(/^09\d{9}$/)],
    bio: ['', Validators.maxLength(1000)],
    birth_date: [''],
    gender: [''],
    specialty: [''],
    city: [''],
    years_of_experience: [0, Validators.min(0)],
  });

  ngOnInit(): void {
    const me = this.auth.me();
    const p = me?.patient_profile;
    const psy = me?.psychologist_profile;
    this.form.reset({
      first_name: p?.first_name ?? psy?.first_name ?? '',
      last_name: p?.last_name ?? psy?.last_name ?? '',
      phone: me?.user.phone ?? '',
      bio: p?.bio ?? psy?.bio ?? '',
      birth_date: p?.birth_date ?? '',
      gender: p?.gender ?? '',
      specialty: psy?.specialty ?? '',
      city: psy?.city ?? '',
      years_of_experience: psy?.years_of_experience ?? 0,
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const patch: ProfilePatch = { first_name: v.first_name, last_name: v.last_name, phone: v.phone || null, bio: v.bio };
    if (this.isPsychologist()) {
      Object.assign(patch, { specialty: v.specialty, city: v.city, years_of_experience: Number(v.years_of_experience) });
    } else {
      Object.assign(patch, { birth_date: v.birth_date || null, gender: (v.gender || null) as Gender | null });
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.updateMe(patch).subscribe({
      next: (me) => {
        this.auth.setMe(me);
        this.saving.set(false);
        this.form.markAsPristine();
        this.toast.success('پروفایل ذخیره شد.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(applyServerErrors(this.form, err));
      },
    });
  }
}
