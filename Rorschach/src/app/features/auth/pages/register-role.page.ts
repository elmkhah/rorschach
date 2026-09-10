import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '@shared/ui/icon.component';
import { IMAGES } from '@shared/utils/images';
import { AuthShellComponent } from '../components/auth-shell.component';

@Component({
  selector: 'app-register-role-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, AuthShellComponent],
  template: `
    <app-auth-shell [image]="images.authRegister" title="به رورشاخ خوش آمدید" caption="نوع حساب خود را انتخاب کنید.">
      <div class="space-y-4">
        <div class="px-2">
          <h1 class="text-3xl font-black">ثبت‌نام</h1>
          <p class="text-base-content/60 mt-2">نوع حساب خود را انتخاب کنید.</p>
        </div>

        <a routerLink="/register/patient" class="glass-card group flex items-center gap-4 rounded-box p-5">
          <span class="bg-neutral text-neutral-content grid size-14 shrink-0 place-items-center rounded-full">
            <app-icon name="user" [size]="24" />
          </span>
          <span class="flex-1">
            <span class="block text-lg font-extrabold">مراجع</span>
            <span class="text-base-content/60 text-sm leading-7">روان‌شناس خود را انتخاب کنید و آزمون را آنلاین انجام دهید.</span>
          </span>
          <app-icon name="chevron-right" class="text-base-content/40" />
        </a>

        <a routerLink="/register/psychologist" class="bg-secondary text-secondary-content flex items-center gap-4 rounded-box p-5">
          <span class="bg-base-100 text-base-content grid size-14 shrink-0 place-items-center rounded-full">
            <app-icon name="stethoscope" [size]="24" />
          </span>
          <span class="flex-1">
            <span class="block text-lg font-extrabold">روان‌شناس</span>
            <span class="text-sm leading-7 opacity-90">پس از بررسی و تأیید مدارک توسط مدیر، حساب شما فعال می‌شود.</span>
          </span>
          <app-icon name="chevron-right" />
        </a>

        <p class="text-base-content/60 px-2 text-sm">
          قبلاً ثبت‌نام کرده‌اید؟ <a routerLink="/login" class="link font-bold">وارد شوید</a>
        </p>
      </div>
    </app-auth-shell>
  `,
})
export class RegisterRolePage {
  protected readonly images = IMAGES;
}
