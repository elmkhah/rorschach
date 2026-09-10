import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { fullName } from '@shared/utils/names';

const GENDER: Record<string, string> = { MALE: 'مرد', FEMALE: 'زن', OTHER: 'سایر' };

@Component({
  selector: 'app-patient-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, IconComponent, LoadingComponent, EmptyStateComponent, StatusBadgeComponent, JalaliDatePipe, FaNumberPipe],
  template: `
    <a routerLink="/psychologist/patients" class="btn btn-ghost btn-sm mb-4">
      <app-icon name="arrow-left" [size]="16" /> مراجعان
    </a>

    @if (detail.isLoading()) {
      <app-loading />
    } @else if (detail.error()) {
      <app-empty-state icon="lock" title="دسترسی ندارید" message="فقط در صورت ارتباط فعال می‌توانید پرونده‌ی این مراجع را ببینید." />
    } @else if (detail.value(); as d) {
      <div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div class="card glass-card h-fit">
          <div class="card-body items-center text-center">
            <app-avatar [name]="name()" size="xl" />
            <h1 class="mt-2 text-lg font-bold">{{ name() }}</h1>
            <span class="text-base-content/60 text-sm" dir="ltr">{{ d.email }}</span>
            <div class="divider my-2"></div>
            <dl class="w-full space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-base-content/60">تاریخ تولد</dt><dd>{{ d.patient.birth_date | jalaliDate }}</dd></div>
              <div class="flex justify-between"><dt class="text-base-content/60">جنسیت</dt><dd>{{ genderLabel(d.patient.gender) }}</dd></div>
              <div class="flex justify-between"><dt class="text-base-content/60">ارتباط از</dt><dd>{{ d.relationship.approved_at | jalaliDate }}</dd></div>
            </dl>
            <a routerLink="/psychologist/chat" class="btn btn-outline btn-sm mt-4 w-full"><app-icon name="message" [size]="16" /> گفت‌وگو</a>
          </div>
        </div>

        <div class="card glass-card">
          <div class="card-body">
            <h2 class="card-title text-base">آزمون‌ها</h2>
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr><th>آزمون</th><th>تاریخ</th><th>پیشرفت</th><th>وضعیت</th><th></th></tr>
                </thead>
                <tbody>
                  @for (s of d.sessions; track s.id) {
                    <tr>
                      <td>{{ s.test_name }} <span class="text-base-content/50 text-xs">v{{ s.test_version }}</span></td>
                      <td class="whitespace-nowrap">{{ s.created_at | jalaliDate }}</td>
                      <td class="whitespace-nowrap text-xs">{{ s.answered_cards | faNumber }}/{{ s.total_cards | faNumber }}</td>
                      <td><app-status-badge [status]="s.status" /></td>
                      <td class="text-end">
                        @if (s.status === 'COMPLETED') {
                          <a class="btn btn-primary btn-xs" [routerLink]="['/psychologist/assessments', s.id]">مشاهده‌ی نتایج</a>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5"><app-empty-state icon="clipboard" title="هنوز آزمونی ثبت نشده است" /></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PatientDetailPage {
  private readonly api = inject(RelationshipsApi);
  readonly id = input.required<string>();

  protected readonly detail = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.patient(params),
  });

  protected name(): string {
    return fullName(this.detail.value()?.patient);
  }

  protected genderLabel(g: string | null): string {
    return (g && GENDER[g]) || '—';
  }
}
