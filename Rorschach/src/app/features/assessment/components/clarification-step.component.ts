import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { LocationMark, RunState } from '@core/models';
import { CLARIFICATION_REASONS } from '@core/rpas/rpas-codes';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { LocationMarkerComponent } from '@shared/ui/location-marker.component';
import { AssessmentRunStore } from '../services/assessment-run.store';

/** Clarification Phase: the examinee's own response is read back; they show where and say why. */
@Component({
  selector: 'app-clarification-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocationMarkerComponent, IconComponent, FaNumberPipe],
  template: `
    @let s = state();
    @if (s.clarification_index === 1 && !store.cpIntroSeen()) {
      <div class="glass-card mx-auto max-w-2xl rounded-box p-6 lg:p-8">
        <span class="badge badge-soft">مرحله‌ی ۲ از ۲</span>
        <h1 class="mt-3 text-3xl font-black">مرحله‌ی روشن‌سازی</h1>
        <div class="text-base-content/80 mt-5 space-y-3 leading-8">
          <p>مرحله‌ی اول تمام شد. حالا پاسخ‌هایتان را یکی‌یکی مرور می‌کنیم.</p>
          <p>
            برای هر پاسخ، کارت و همان چیزی که گفته‌اید نمایش داده می‌شود. می‌خواهیم کمک کنید ما هم آن را همان‌طور ببینیم که
            شما دیدید: <b>کجای کارت</b> آن را دیدید و <b>چه چیزی باعث شد</b> آن‌طور به نظر برسد.
          </p>
          <p>لازم نیست پاسخ جدیدی بدهید؛ فقط پاسخ قبلی خود را توضیح دهید.</p>
        </div>
        <div class="mt-6 flex justify-end">
          <button class="btn btn-primary" (click)="store.dismissCpIntro()">
            شروع مرحله‌ی دوم <app-icon name="chevron-right" [size]="14" />
          </button>
        </div>
      </div>
    } @else {
      <div class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div class="glass-card rounded-box p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span class="font-extrabold">کارت {{ s.card_index | faNumber }}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm" [class.btn-neutral]="whole()" [class.btn-outline]="!whole()" (click)="whole.set(!whole())">
                کل تصویر
              </button>
              <button type="button" class="btn btn-ghost btn-sm" [disabled]="!marks().length" (click)="marks.set([])">پاک کردن نشانه‌ها</button>
            </div>
          </div>
          <app-location-marker [src]="s.card?.image_url ?? ''" [(marks)]="marks" [whole]="whole()" />
          <p class="text-base-content/50 mt-3 text-xs">برای مشخص کردن محل روی تصویر بزنید؛ با زدن روی هر نشانه، حذف می‌شود.</p>
        </div>

        <div class="glass-card flex flex-col gap-4 rounded-box p-5">
          <div class="text-base-content/50 text-sm">
            پاسخ {{ s.clarification_index | faNumber }} از {{ s.clarification_total | faNumber }}
          </div>
          <div class="bg-base-100/70 rounded-2xl p-4">
            <div class="text-base-content/50 mb-1 text-xs">شما گفتید:</div>
            <p class="text-lg leading-8 font-bold">«{{ s.target?.response_text }}»</p>
          </div>
          <div>
            <div class="font-extrabold">کجای کارت آن را دیدید؟</div>
            <p class="text-base-content/60 text-sm">روی تصویر مشخص کنید؛ اگر همه‌ی تصویر بود «کل تصویر» را بزنید.</p>
          </div>
          <div class="flex flex-col gap-2">
            <span class="font-extrabold">چه چیزی باعث شد این‌طور به نظر برسد؟</span>
            <span class="text-base-content/60 text-sm">هر موردی که درست است را انتخاب کنید.</span>
            <div class="flex flex-wrap gap-2">
              @for (r of reasonOptions; track r.code) {
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-neutral]="reasons().includes(r.code)"
                  [class.btn-outline]="!reasons().includes(r.code)"
                  [attr.aria-pressed]="reasons().includes(r.code)"
                  [disabled]="store.busy()"
                  (click)="toggleReason(r.code)"
                >
                  {{ r.label }}
                </button>
              }
            </div>
            <input
              #box
              type="text"
              class="input w-full"
              autocomplete="off"
              placeholder="توضیح بیشتر (اختیاری)"
              [value]="text()"
              [disabled]="store.busy()"
              (input)="text.set(box.value)"
            />
          </div>
          <div class="mt-auto flex justify-end">
            <button class="btn btn-primary" [disabled]="!canSubmit()" (click)="submit()">
              @if (store.busy()) {
                <span class="loading loading-spinner loading-sm"></span>
              }
              {{ s.clarification_index === s.clarification_total ? 'پایان مرحله‌ی دوم' : 'پاسخ بعدی' }}
              <app-icon name="chevron-right" [size]="14" />
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClarificationStepComponent {
  readonly state = input.required<RunState>();
  protected readonly store = inject(AssessmentRunStore);

  protected readonly marks = signal<LocationMark[]>([]);
  protected readonly whole = signal(false);
  protected readonly text = signal('');
  protected readonly reasons = signal<string[]>([]);
  protected readonly reasonOptions = CLARIFICATION_REASONS;
  protected readonly canSubmit = computed(
    () =>
      !this.store.busy() &&
      (this.whole() || this.marks().length > 0) &&
      (this.reasons().length > 0 || this.text().trim().length > 0),
  );
  private targetId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.state().target?.id ?? null;
      untracked(() => {
        if (id === this.targetId) return;
        this.targetId = id;
        this.marks.set([]);
        this.whole.set(false);
        this.text.set('');
        this.reasons.set([]);
      });
    });
  }

  protected toggleReason(code: string): void {
    this.reasons.update((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
  }

  protected async submit(): Promise<void> {
    const target = this.state().target;
    if (!target) return;
    await this.store.clarify({
      response_id: target.id,
      whole: this.whole(),
      location_marks: this.marks(),
      reasons: this.reasons(),
      text: this.text().trim(),
      client_submitted_at: new Date().toISOString(),
    });
  }
}
