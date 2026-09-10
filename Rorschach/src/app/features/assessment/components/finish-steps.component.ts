import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RunState } from '@core/models';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { AssessmentRunStore } from '../services/assessment-run.store';

@Component({
  selector: 'app-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FaNumberPipe],
  template: `
    <div class="glass-card mx-auto max-w-xl rounded-box p-6 text-center lg:p-8">
      <div class="bg-secondary text-secondary-content mx-auto grid size-14 place-items-center rounded-full">
        <app-icon name="check" [size]="26" />
      </div>
      <h1 class="mt-4 text-2xl font-black">هر دو مرحله انجام شد</h1>
      <p class="text-base-content/70 mt-3 leading-8">
        {{ state().clarification_total | faNumber }} پاسخ ثبت شد. با ثبت نهایی، آزمون برای روان‌شناس شما ارسال می‌شود و دیگر
        قابل تغییر نیست.
      </p>
      <button class="btn btn-primary mt-6" [disabled]="store.busy()" (click)="store.complete()">
        @if (store.busy()) {
          <span class="loading loading-spinner loading-sm"></span>
        }
        ثبت نهایی آزمون
      </button>
    </div>
  `,
})
export class ReviewStepComponent {
  readonly state = input.required<RunState>();
  protected readonly store = inject(AssessmentRunStore);
}

/** Patients only ever see this — raw/coded data is for the psychologist (BR-14). */
@Component({
  selector: 'app-completed-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="glass-card mx-auto max-w-xl rounded-box p-6 text-center lg:p-8">
      <div class="bg-success/15 text-success mx-auto grid size-14 place-items-center rounded-full">
        <app-icon name="check" [size]="26" />
      </div>
      <h1 class="mt-4 text-2xl font-black">آزمون با موفقیت ثبت شد</h1>
      <p class="text-base-content/70 mt-3 leading-8">
        از همکاری شما سپاسگزاریم. نتایج فقط در اختیار روان‌شناس شما قرار می‌گیرد و او درباره‌ی آن با شما گفت‌وگو خواهد کرد.
      </p>
      <a routerLink="/patient" class="btn btn-primary mt-6">بازگشت به داشبورد</a>
    </div>
  `,
})
export class CompletedStepComponent {}
