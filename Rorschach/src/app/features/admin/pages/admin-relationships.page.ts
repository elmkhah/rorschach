import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@core/api/admin-api.service';
import { RelationshipStatus } from '@core/models';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { fullName } from '@shared/utils/names';

@Component({
  selector: 'app-admin-relationships-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatusBadgeComponent, LoadingComponent, EmptyStateComponent, JalaliDatePipe],
  template: `
    <app-page-header title="روابط مراجع و روان‌شناس">
      <select class="select select-sm w-40" (change)="status.set($any($event.target).value || undefined)">
        <option value="">همه‌ی وضعیت‌ها</option>
        <option value="PENDING">در انتظار</option>
        <option value="ACTIVE">فعال</option>
        <option value="REJECTED">ردشده</option>
        <option value="REVOKED">لغوشده</option>
      </select>
    </app-page-header>

    <div class="card glass-card">
      @if (list.isLoading() && !list.value()) {
        <app-loading />
      } @else {
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr><th>مراجع</th><th>روان‌شناس</th><th>وضعیت</th><th>درخواست</th><th>تأیید</th><th>لغو</th></tr>
            </thead>
            <tbody>
              @for (r of list.value() ?? []; track r.id) {
                <tr>
                  <td class="whitespace-nowrap">{{ name(r.patient) }}</td>
                  <td class="whitespace-nowrap">{{ name(r.psychologist) }}</td>
                  <td><app-status-badge [status]="r.status" /></td>
                  <td class="whitespace-nowrap text-sm">{{ r.requested_at | jalaliDate: 'short' }}</td>
                  <td class="whitespace-nowrap text-sm">{{ r.approved_at | jalaliDate: 'short' }}</td>
                  <td class="whitespace-nowrap text-sm">{{ r.revoked_at | jalaliDate: 'short' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6"><app-empty-state icon="link" title="رابطه‌ای یافت نشد" /></td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class AdminRelationshipsPage {
  private readonly api = inject(AdminApi);
  protected readonly name = fullName;
  protected readonly status = signal<RelationshipStatus | undefined>(undefined);
  protected readonly list = rxResource({
    params: () => ({ status: this.status() }),
    stream: ({ params }) => this.api.relationships(params.status),
  });
}
