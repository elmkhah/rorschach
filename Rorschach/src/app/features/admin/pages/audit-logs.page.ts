import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@core/api/admin-api.service';
import { PaginationComponent } from '@shared/components/pagination.component';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';

const PAGE_SIZE = 25;
const ACTIONS = [
  'PATIENT_STARTED_ASSESSMENT',
  'PATIENT_COMPLETED_ASSESSMENT',
  'PSYCHOLOGIST_VIEWED_ASSESSMENT',
  'RELATIONSHIP_CREATED',
  'RELATIONSHIP_APPROVED',
  'RELATIONSHIP_REVOKED',
  'PSYCHOLOGIST_PROFILE_APPROVED',
  'PSYCHOLOGIST_PROFILE_REJECTED',
  'PSYCHOLOGIST_PROFILE_SUSPENDED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'TEST_VERSION_CREATED',
  'TEST_VERSION_PUBLISHED',
];

@Component({
  selector: 'app-audit-logs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, LoadingComponent, EmptyStateComponent, PaginationComponent, JalaliDatePipe, JsonPipe],
  template: `
    <app-page-header title="گزارش رویدادها (Audit Log)" subtitle="رویدادهای حساس سامانه؛ جدا از لاگ برنامه و لاگ امنیتی.">
      <select class="select select-sm w-72" dir="ltr" (change)="setAction($any($event.target).value)">
        <option value="">All actions</option>
        @for (a of actions; track a) {
          <option [value]="a">{{ a }}</option>
        }
      </select>
    </app-page-header>

    <div class="card glass-card">
      @if (logs.isLoading() && !logs.value()) {
        <app-loading />
      } @else if (logs.value(); as page) {
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>هدف</th><th>IP</th><th>متادیتا</th></tr></thead>
            <tbody>
              @for (l of page.results; track l.id) {
                <tr>
                  <td class="whitespace-nowrap text-xs">{{ l.created_at | jalaliDate: 'datetime' }}</td>
                  <td class="text-xs" dir="ltr">{{ l.actor_email ?? 'system' }}</td>
                  <td><span class="badge badge-ghost badge-sm font-mono" dir="ltr">{{ l.action }}</span></td>
                  <td class="font-mono text-xs" dir="ltr">{{ l.target_type }}:{{ l.target_id }}</td>
                  <td class="font-mono text-xs" dir="ltr">{{ l.ip_address }}</td>
                  <td class="max-w-48 truncate font-mono text-xs" dir="ltr">{{ l.metadata | json }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6"><app-empty-state icon="history" title="رویدادی یافت نشد" /></td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex justify-center p-4">
          <app-pagination [count]="page.count" [page]="page_()" [pageSize]="pageSize" (pageChange)="page_.set($event)" />
        </div>
      }
    </div>
  `,
})
export class AuditLogsPage {
  private readonly api = inject(AdminApi);
  protected readonly actions = ACTIONS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly action = signal<string | undefined>(undefined);
  protected readonly page_ = signal(1);

  protected readonly logs = rxResource({
    params: () => ({ action: this.action(), page: this.page_(), page_size: PAGE_SIZE }),
    stream: ({ params }) => this.api.auditLogs(params),
  });

  protected setAction(value: string): void {
    this.action.set(value || undefined);
    this.page_.set(1);
  }
}
