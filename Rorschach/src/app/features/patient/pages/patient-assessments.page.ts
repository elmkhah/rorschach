import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AssessmentsApi } from '@core/api/assessments-api.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

const OPEN = ['CREATED', 'IN_PROGRESS', 'PAUSED'];

@Component({
  selector: 'app-patient-assessments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, StatusBadgeComponent, LoadingComponent, EmptyStateComponent, JalaliDatePipe, FaNumberPipe],
  template: `
    <app-page-header title="آزمون‌ها و سوابق" subtitle="نتایج تحلیلی فقط برای روان‌شناس شما قابل مشاهده است." />

    <div class="card glass-card">
      @if (sessions.isLoading()) {
        <app-loading />
      } @else {
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>آزمون</th>
                <th>روان‌شناس</th>
                <th>تاریخ</th>
                <th>پیشرفت</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of sessions.value() ?? []; track s.id) {
                <tr>
                  <td class="font-medium">{{ s.test_name }} <span class="text-base-content/50 text-xs">v{{ s.test_version }}</span></td>
                  <td>{{ s.psychologist_name }}</td>
                  <td class="whitespace-nowrap">{{ s.created_at | jalaliDate }}</td>
                  <td>
                    <progress class="progress progress-primary w-24" [value]="s.answered_cards" [max]="s.total_cards"></progress>
                    <span class="text-base-content/60 ms-2 text-xs">{{ s.answered_cards | faNumber }}/{{ s.total_cards | faNumber }}</span>
                  </td>
                  <td><app-status-badge [status]="s.status" /></td>
                  <td class="text-end">
                    @if (open.includes(s.status)) {
                      <a class="btn btn-primary btn-xs" [routerLink]="['/assessment', s.id]">ادامه</a>
                    } @else if (s.status === 'COMPLETED') {
                      <span class="text-base-content/60 text-xs">ارسال‌شده برای روان‌شناس</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <app-empty-state icon="clipboard" title="هنوز آزمونی ندارید" message="پس از برقراری ارتباط با روان‌شناس، آزمون را از داشبورد شروع کنید." />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PatientAssessmentsPage {
  private readonly api = inject(AssessmentsApi);
  protected readonly open = OPEN;
  protected readonly sessions = rxResource({ stream: () => this.api.sessions() });
}
