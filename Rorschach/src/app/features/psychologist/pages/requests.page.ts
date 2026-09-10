import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { Relationship, RelationshipStatus } from '@core/models';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { fullName } from '@shared/utils/names';
import { RelationshipActions } from '../services/relationship-actions.service';

const TABS: { value: RelationshipStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'در انتظار' },
  { value: 'REJECTED', label: 'ردشده' },
  { value: 'REVOKED', label: 'لغوشده' },
  { value: 'ALL', label: 'همه' },
];

@Component({
  selector: 'app-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, AvatarComponent, StatusBadgeComponent, EmptyStateComponent, LoadingComponent, JalaliDatePipe],
  template: `
    <app-page-header title="درخواست‌های ارتباط" subtitle="درخواست مراجعان را بررسی و تأیید یا رد کنید." />

    <div role="tablist" class="tabs tabs-box mb-4 w-fit">
      @for (t of tabs; track t.value) {
        <button role="tab" class="tab" [class.tab-active]="tab() === t.value" (click)="tab.set(t.value)">{{ t.label }}</button>
      }
    </div>

    <div class="card glass-card">
      @if (relationships.isLoading() && !relationships.value()) {
        <app-loading />
      } @else {
        <ul class="divide-base-200 divide-y">
          @for (r of filtered(); track r.id) {
            <li class="flex flex-wrap items-center gap-3 p-4">
              <app-avatar [name]="name(r)" />
              <div class="min-w-0 flex-1">
                <div class="font-medium">{{ name(r) }}</div>
                <div class="text-base-content/60 text-xs">تاریخ درخواست: {{ r.requested_at | jalaliDate }}</div>
              </div>
              <app-status-badge [status]="r.status" />
              @if (r.status === 'PENDING') {
                <div class="flex gap-2">
                  <button class="btn btn-success btn-sm" (click)="approve(r)">تأیید</button>
                  <button class="btn btn-outline btn-error btn-sm" (click)="reject(r)">رد</button>
                </div>
              }
            </li>
          } @empty {
            <app-empty-state icon="user-check" title="موردی وجود ندارد" />
          }
        </ul>
      }
    </div>
  `,
})
export class RequestsPage {
  private readonly api = inject(RelationshipsApi);
  private readonly actions = inject(RelationshipActions);

  protected readonly tabs = TABS;
  protected readonly tab = signal<RelationshipStatus | 'ALL'>('PENDING');
  protected readonly relationships = rxResource({ stream: () => this.api.list() });
  protected readonly filtered = computed(() => {
    const t = this.tab();
    return (this.relationships.value() ?? []).filter((r) => (t === 'ALL' ? r.status !== 'ACTIVE' : r.status === t));
  });

  protected name(r: Relationship): string {
    return fullName(r.patient);
  }

  protected async approve(r: Relationship): Promise<void> {
    if (await this.actions.approve(r)) this.relationships.reload();
  }

  protected async reject(r: Relationship): Promise<void> {
    if (await this.actions.reject(r)) this.relationships.reload();
  }
}
