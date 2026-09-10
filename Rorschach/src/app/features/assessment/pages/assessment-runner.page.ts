import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { ClarificationStepComponent } from '../components/clarification-step.component';
import { CompletedStepComponent, ReviewStepComponent } from '../components/finish-steps.component';
import { IntroStepComponent } from '../components/intro-step.component';
import { ResponseStepComponent } from '../components/response-step.component';
import { LeaveAware } from '../guards/leave-assessment.guard';
import { ACTIVE_STAGES, AssessmentRunStore } from '../services/assessment-run.store';

/** Focus-mode runner. Renders whatever stage the backend says the session is in. */
@Component({
  selector: 'app-assessment-runner-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AssessmentRunStore],
  imports: [
    RouterLink,
    LoadingComponent,
    EmptyStateComponent,
    IntroStepComponent,
    ResponseStepComponent,
    ClarificationStepComponent,
    ReviewStepComponent,
    CompletedStepComponent,
  ],
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
  template: `
    @if (store.loading()) {
      <app-loading label="در حال آماده‌سازی آزمون…" />
    } @else if (store.state(); as s) {
      @switch (s.stage) {
        @case ('INTRO') {
          <app-intro-step [state]="s" />
        }
        @case ('RESPONSE') {
          <app-response-step [state]="s" />
        }
        @case ('CLARIFICATION') {
          <app-clarification-step [state]="s" />
        }
        @case ('REVIEW') {
          <app-review-step [state]="s" />
        }
        @case ('COMPLETED') {
          <app-completed-step />
        }
      }
    } @else {
      <div class="glass-card mx-auto max-w-xl rounded-box">
        <app-empty-state icon="alert" title="آزمون در دسترس نیست" [message]="store.error() ?? undefined">
          <a routerLink="/patient" class="btn btn-primary btn-sm">بازگشت به داشبورد</a>
        </app-empty-state>
      </div>
    }
  `,
})
export class AssessmentRunnerPage implements OnInit, LeaveAware {
  readonly sessionId = input.required<string>();
  protected readonly store = inject(AssessmentRunStore);
  private readonly confirm = inject(ConfirmService);

  ngOnInit(): void {
    void this.store.load(this.sessionId());
  }

  private inProgress(): boolean {
    const stage = this.store.state()?.stage;
    return !!stage && ACTIVE_STAGES.includes(stage);
  }

  protected onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.inProgress()) e.preventDefault();
  }

  protected onVisibilityChange(): void {
    if (document.hidden && this.inProgress()) this.store.logEvent('TAB_HIDDEN');
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.inProgress()) return true;
    return this.confirm.confirm({
      title: 'خروج از آزمون',
      message:
        'آزمون باید در یک نوبت و بدون وقفه انجام شود. اگر خارج شوید، این وقفه در پرونده ثبت می‌شود و روان‌شناس آن را می‌بیند. خارج می‌شوید؟',
      confirmText: 'خروج',
      danger: true,
    });
  }
}
