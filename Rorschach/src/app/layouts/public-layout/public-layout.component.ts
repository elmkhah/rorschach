import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { LogoComponent } from '@shared/ui/logo.component';

@Component({
  selector: 'app-public-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, LogoComponent],
  host: { class: 'flex min-h-dvh flex-col' },
  template: `
    <header class="sticky top-0 z-30 px-4 pt-3">
      <div class="glass-card mx-auto flex max-w-6xl items-center gap-4 rounded-full py-2 ps-5 pe-2">
        <a routerLink="/" aria-label="صفحه‌ی نخست"><app-logo [size]="34" /></a>
        <nav class="hidden flex-1 justify-center gap-7 text-sm font-semibold md:flex">
          <a routerLink="/" fragment="about" class="hover:text-secondary transition">درباره</a>
          <a routerLink="/" fragment="method" class="hover:text-secondary transition">روش</a>
          <a routerLink="/" fragment="steps" class="hover:text-secondary transition">مراحل</a>
          <a routerLink="/" fragment="psychologists" class="hover:text-secondary transition">روان‌شناسان</a>
        </nav>
        <div class="ms-auto flex gap-2 md:ms-0">
          @if (auth.isAuthenticated()) {
            <a class="btn btn-primary btn-sm" [routerLink]="auth.homeUrl()">ورود به پنل</a>
          } @else {
            <a routerLink="/login" class="btn btn-ghost btn-sm">ورود</a>
            <a routerLink="/register" class="btn btn-primary btn-sm">ثبت‌نام</a>
          }
        </div>
      </div>
    </header>

    <main class="flex-1">
      <router-outlet />
    </main>

    <footer class="px-4 pt-4 pb-4">
      <div class="bg-neutral text-neutral-content mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-box px-6 py-6 text-sm">
        <app-logo [inverted]="true" [size]="32" />
        <span class="opacity-60">این سامانه ادعای تشخیص روان‌شناختی ندارد؛ تفسیر نتایج بر عهده‌ی روان‌شناس است.</span>
        <span class="opacity-60">© رورشاخ</span>
      </div>
    </footer>
  `,
})
export class PublicLayoutComponent {
  protected readonly auth = inject(AuthService);
}
