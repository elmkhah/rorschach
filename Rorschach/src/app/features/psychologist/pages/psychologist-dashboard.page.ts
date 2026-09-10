import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AssessmentsApi } from '@core/api/assessments-api.service';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { AuthService } from '@core/auth/auth.service';
import { Relationship } from '@core/models';
import { RelativeTimePipe } from '@shared/pipes/relative-time.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { StatCardComponent } from '@shared/ui/stat-card.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { fullName } from '@shared/utils/names';
import { RelationshipActions } from '../services/relationship-actions.service';

@Component({
  selector: 'app-psychologist-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    StatCardComponent,
    AvatarComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    RelativeTimePipe,
    JalaliDatePipe,
  ],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold">داشبورد</h1>
      <p class="text-base-content/60 text-sm">خلاصه‌ی وضعیت مراجعان و آزمون‌های شما</p>
    </div>

    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <app-stat-card label="مراجعان فعال" [value]="active().length" icon="users" />
      <app-stat-card label="درخواست‌های جدید" [value]="pending().length" icon="user-check" tone="warning" />
      <app-stat-card label="آزمون‌های تکمیل‌شده" [value]="completed().length" icon="clipboard" tone="success" />
      <app-stat-card label="آزمون‌های در جریان" [value]="inProgress()" icon="clock" tone="info" />
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card glass-card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base">درخواست‌های در انتظار</h2>
            <a routerLink="/psychologist/requests" class="btn btn-ghost btn-xs">همه</a>
          </div>
          <ul class="divide-base-200 divide-y">
            @for (r of pending(); track r.id) {
              <li class="flex items-center gap-3 py-3">
                <app-avatar [name]="name(r)" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{{ name(r) }}</div>
                  <div class="text-base-content/50 text-xs">{{ r.requested_at | relativeTime }}</div>
                </div>
                <button class="btn btn-success btn-xs" (click)="approve(r)">تأیید</button>
                <button class="btn btn-ghost btn-xs text-error" (click)="reject(r)">رد</button>
              </li>
            } @empty {
              <app-empty-state icon="user-check" title="درخواست جدیدی ندارید" />
            }
          </ul>
        </div>
      </div>

      <div class="card glass-card">
        <div class="card-body">
          <h2 class="card-title text-base">آخرین آزمون‌های تکمیل‌شده</h2>
          <ul class="divide-base-200 divide-y">
            @for (s of completed().slice(0, 5); track s.id) {
              <li>
                <a [routerLink]="['/psychologist/assessments', s.id]" class="hover:bg-base-200 -mx-2 flex items-center gap-3 rounded-lg px-2 py-3">
                  <div class="bg-success/15 text-success grid size-10 place-items-center rounded-xl">
                    <app-icon name="clipboard" [size]="18" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">{{ s.patient_name }}</div>
                    <div class="text-base-content/60 text-xs">{{ s.test_name }} · {{ s.completed_at | jalaliDate }}</div>
                  </div>
                  <app-icon name="chevron-right" [size]="18" class="text-base-content/40" />
                </a>
              </li>
            } @empty {
              <app-empty-state icon="clipboard" title="هنوز آزمون تکمیل‌شده‌ای ندارید" />
            }
          </ul>
        </div>
      </div>
    </div>

    <div class="card glass-card mt-6">
      <div class="card-body">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-base">مراجعان فعال</h2>
          <a routerLink="/psychologist/patients" class="btn btn-ghost btn-xs">همه</a>
        </div>
        <div class="flex flex-wrap gap-3">
          @for (r of active(); track r.id) {
            <a [routerLink]="['/psychologist/patients', r.patient_id]" class="bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-full py-1 ps-1 pe-4">
              <app-avatar [name]="name(r)" size="xs" />
              <span class="text-sm">{{ name(r) }}</span>
              <app-status-badge [status]="r.status" />
            </a>
          } @empty {
            <p class="text-base-content/60 text-sm">مراجع فعالی ندارید.</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class PsychologistDashboardPage {
  protected readonly auth = inject(AuthService);
  private readonly actions = inject(RelationshipActions);
  private readonly relationshipsApi = inject(RelationshipsApi);
  private readonly assessmentsApi = inject(AssessmentsApi);

  protected readonly relationships = rxResource({ stream: () => this.relationshipsApi.list() });
  protected readonly sessions = rxResource({ stream: () => this.assessmentsApi.sessions() });

  protected readonly active = computed(() => (this.relationships.value() ?? []).filter((r) => r.status === 'ACTIVE'));
  protected readonly pending = computed(() => (this.relationships.value() ?? []).filter((r) => r.status === 'PENDING'));
  protected readonly completed = computed(() => (this.sessions.value() ?? []).filter((s) => s.status === 'COMPLETED'));
  protected readonly inProgress = computed(
    () => (this.sessions.value() ?? []).filter((s) => s.status === 'IN_PROGRESS' || s.status === 'PAUSED').length,
  );

  protected name(r: Relationship): string {
    return fullName(r.patient);
  }

  protected async approve(r: Relationship): Promise<void> {
    if (await this.actions.approve(r)) this.reload();
  }

  protected async reject(r: Relationship): Promise<void> {
    if (await this.actions.reject(r)) this.reload();
  }

  private reload(): void {
    this.relationships.reload();
    this.sessions.reload();
  }
}
