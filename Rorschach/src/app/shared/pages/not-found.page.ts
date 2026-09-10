import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'grid min-h-dvh place-items-center p-6 text-center' },
  template: `
    <div class="space-y-4">
      <div class="text-primary text-7xl font-black">۴۰۴</div>
      <h1 class="text-xl font-bold">صفحه‌ای که دنبالش بودید پیدا نشد.</h1>
      <a class="btn btn-primary" [routerLink]="auth.isAuthenticated() ? auth.homeUrl() : '/'">بازگشت</a>
    </div>
  `,
})
export class NotFoundPage {
  protected readonly auth = inject(AuthService);
}
