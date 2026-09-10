import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RunState } from '@core/models';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { AssessmentRunStore } from '../services/assessment-run.store';

/** Standard R-PAS instructions — no examples, no hints about "good" answers. */
@Component({
  selector: 'app-intro-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, FaNumberPipe],
  template: `
    @let s = state();
    <div class="glass-card mx-auto max-w-2xl rounded-box p-6 lg:p-8">
      <h1 class="text-3xl font-black">{{ s.session.test_name }}</h1>
      <p class="text-base-content/60 mt-1 text-sm">
        روان‌شناس: {{ s.session.psychologist_name }} · {{ s.total_cards | faNumber }} کارت · روش اجرا: R-PAS
      </p>

      <div class="text-base-content/80 mt-6 space-y-3 leading-8">
        <p>
          در این آزمون، ده کارت با لکه‌های جوهر یکی‌یکی نمایش داده می‌شود. به هر کارت نگاه کنید و بنویسید
          <b>این چه چیزی می‌تواند باشد؟</b>
        </p>
        <p>
          سعی کنید برای هر کارت <b>دو یا شاید سه پاسخ</b> بدهید. هر پاسخ را در یک کادر جداگانه بنویسید؛ برای پاسخ بعدی از
          دکمه‌ی «پاسخ دیگر» استفاده کنید.
        </p>
        <p>پاسخ درست یا غلطی وجود ندارد. می‌توانید کارت را بچرخانید.</p>
        <p>پس از کارت دهم، مرحله‌ی دوم شروع می‌شود و پاسخ‌هایتان را با هم مرور می‌کنیم.</p>
      </div>

      <div class="bg-accent text-accent-content mt-6 flex gap-3 rounded-2xl p-4 text-sm leading-7">
        <app-icon name="alert" [size]="20" class="mt-1" />
        <div>
          <div class="font-extrabold">آزمون باید در یک نوبت و بدون وقفه انجام شود.</div>
          حدود ۳۰ تا ۴۵ دقیقه زمان لازم است. پس از شروع، امکان توقف یا ویرایش پاسخ‌های ثبت‌شده وجود ندارد؛ خروج از
          صفحه در پرونده ثبت می‌شود.
        </div>
      </div>

      <ul class="text-base-content/70 mt-4 space-y-1.5 text-sm">
        <li class="flex items-center gap-2"><app-icon name="check" [size]="16" /> جایی آرام و بدون مزاحمت</li>
        <li class="flex items-center gap-2"><app-icon name="check" [size]="16" /> اتصال اینترنت پایدار</li>
        <li class="flex items-center gap-2"><app-icon name="check" [size]="16" /> ترجیحاً رایانه یا تبلت با صفحه‌ی بزرگ</li>
      </ul>

      <label class="mt-6 flex cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" class="checkbox checkbox-sm" [checked]="ready()" (change)="ready.set(!ready())" />
        آماده‌ام و می‌توانم آزمون را بدون وقفه انجام دهم.
      </label>

      <div class="mt-6 flex items-center justify-between">
        <a routerLink="/patient" class="btn btn-ghost">بازگشت</a>
        <button class="btn btn-primary" [disabled]="!ready() || store.busy()" (click)="store.start()">
          @if (store.busy()) {
            <span class="loading loading-spinner loading-sm"></span>
          }
          شروع آزمون
        </button>
      </div>
    </div>
  `,
})
export class IntroStepComponent {
  readonly state = input.required<RunState>();
  protected readonly store = inject(AssessmentRunStore);
  protected readonly ready = signal(false);
}
