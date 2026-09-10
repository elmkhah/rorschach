import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminApi } from '@core/api/admin-api.service';
import { RelativeTimePipe } from '@shared/pipes/relative-time.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { StatCardComponent } from '@shared/ui/stat-card.component';

@Component({
  selector: 'app-admin-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatCardComponent, AvatarComponent, EmptyStateComponent, RelativeTimePipe],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold">داشبورد مدیریت</h1>
      <p class="text-base-content/60 text-sm">نمای کلی سامانه</p>
    </div>

    @if (stats.value(); as s) {
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card label="کل کاربران" [value]="s.users" icon="users" />
        <app-stat-card label="در انتظار تأیید" [value]="s.pending_verifications" icon="shield" tone="warning" />
        <app-stat-card label="روابط فعال" [value]="s.active_relationships" icon="link" tone="info" />
        <app-stat-card label="آزمون‌های تکمیل‌شده" [value]="s.sessions_completed" icon="clipboard" tone="success" />
      </div>
    }

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card glass-card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">روان‌شناسان در انتظار تأیید</h2>
            <a routerLink="/admin/psychologists" class="btn btn-ghost btn-xs">بررسی</a>
          </div>
          <ul class="divide-base-200 divide-y">
            @for (row of pending.value() ?? []; track row.user.id) {
              <li class="flex items-center gap-3 py-3">
                <app-avatar [name]="row.name" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{{ row.name }}</div>
                  <div class="text-base-content/60 text-xs">{{ row.psychologist_profile?.specialty }}</div>
                </div>
                <span class="text-base-content/50 text-xs">{{ row.user.created_at | relativeTime }}</span>
              </li>
            } @empty {
              <app-empty-state icon="shield" title="موردی در انتظار نیست" />
            }
          </ul>
        </div>
      </div>

      <div class="card glass-card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">آخرین رویدادها</h2>
            <a routerLink="/admin/audit-logs" class="btn btn-ghost btn-xs">همه</a>
          </div>
          <ul class="divide-base-200 divide-y">
            @for (log of logs.value()?.results ?? []; track log.id) {
              <li class="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span class="badge badge-ghost badge-sm font-mono" dir="ltr">{{ log.action }}</span>
                <span class="text-base-content/60 truncate text-xs" dir="ltr">{{ log.actor_email }}</span>
                <span class="text-base-content/50 shrink-0 text-xs">{{ log.created_at | relativeTime }}</span>
              </li>
            }
          </ul>
        </div>
      </div>
    </div>
  `,
})
export class AdminDashboardPage {
  private readonly api = inject(AdminApi);
  protected readonly stats = rxResource({ stream: () => this.api.stats() });
  protected readonly pending = rxResource({ stream: () => this.api.psychologists({ verification_status: 'PENDING_VERIFICATION' }) });
  protected readonly logs = rxResource({ stream: () => this.api.auditLogs({ page_size: 6 }) });
}
