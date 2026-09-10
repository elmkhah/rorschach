import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@core/api/admin-api.service';
import { SessionStatus } from '@core/models';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

@Component({
  selector: 'app-admin-assessments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatusBadgeComponent, LoadingComponent, EmptyStateComponent, JalaliDatePipe, FaNumberPipe],
  template: `
    <app-page-header title="جلسات آزمون">
      <select class="select select-sm w-40" (change)="status.set($any($event.target).value || undefined)">
        <option value="">همه‌ی وضعیت‌ها</option>
        <option value="CREATED">ایجادشده</option>
        <option value="IN_PROGRESS">در حال انجام</option>
        <option value="PAUSED">متوقف</option>
        <option value="COMPLETED">تکمیل‌شده</option>
        <option value="ABANDONED">رهاشده</option>
        <option value="CANCELLED">لغوشده</option>
      </select>
    </app-page-header>

    <div class="card glass-card">
      @if (list.isLoading() && !list.value()) {
        <app-loading />
      } @else {
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr><th>شناسه</th><th>مراجع</th><th>روان‌شناس</th><th>آزمون</th><th>پیشرفت</th><th>وضعیت</th><th>ایجاد</th></tr>
            </thead>
            <tbody>
              @for (s of list.value() ?? []; track s.id) {
                <tr>
                  <td class="font-mono text-xs" dir="ltr">{{ s.id }}</td>
                  <td class="whitespace-nowrap">{{ s.patient_name }}</td>
                  <td class="whitespace-nowrap">{{ s.psychologist_name }}</td>
                  <td class="whitespace-nowrap">{{ s.test_name }} <span class="text-base-content/50 text-xs">v{{ s.test_version }}</span></td>
                  <td class="text-xs">{{ s.answered_cards | faNumber }}/{{ s.total_cards | faNumber }}</td>
                  <td><app-status-badge [status]="s.status" /></td>
                  <td class="whitespace-nowrap text-sm">{{ s.created_at | jalaliDate: 'short' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7"><app-empty-state icon="clipboard" title="جلسه‌ای یافت نشد" /></td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class AdminAssessmentsPage {
  private readonly api = inject(AdminApi);
  protected readonly status = signal<SessionStatus | undefined>(undefined);
  protected readonly list = rxResource({
    params: () => ({ status: this.status() }),
    stream: ({ params }) => this.api.assessments(params.status),
  });
}
