import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@core/api/admin-api.service';
import { AdminUserRow, VerificationDecision, VerificationStatus } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

const TABS: { value: VerificationStatus | ''; label: string }[] = [
  { value: 'PENDING_VERIFICATION', label: 'در انتظار' },
  { value: 'APPROVED', label: 'تأییدشده' },
  { value: 'REJECTED', label: 'ردشده' },
  { value: 'SUSPENDED', label: 'تعلیق' },
  { value: '', label: 'همه' },
];

const DECISION_TEXT: Record<VerificationDecision, string> = { APPROVE: 'تأیید', REJECT: 'رد', SUSPEND: 'تعلیق' };

@Component({
  selector: 'app-psychologist-verification-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, AvatarComponent, StatusBadgeComponent, IconComponent, EmptyStateComponent, LoadingComponent, JalaliDatePipe],
  template: `
    <app-page-header title="تأیید روان‌شناسان" subtitle="مدارک حرفه‌ای را بررسی و حساب را تأیید، رد یا تعلیق کنید." />

    <div role="tablist" class="tabs tabs-box mb-4 w-fit">
      @for (t of tabs; track t.value) {
        <button role="tab" class="tab" [class.tab-active]="status() === t.value" (click)="status.set(t.value)">{{ t.label }}</button>
      }
    </div>

    @if (list.isLoading() && !list.value()) {
      <app-loading />
    } @else {
      <div class="space-y-4">
        @for (row of list.value() ?? []; track row.user.id) {
          @let p = row.psychologist_profile!;
          <div class="card glass-card">
            <div class="card-body gap-4 lg:flex-row">
              <div class="flex flex-1 gap-4">
                <app-avatar [name]="row.name" size="lg" />
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-bold">{{ row.name }}</span>
                    <app-status-badge [status]="p.verification_status" />
                  </div>
                  <div class="text-base-content/70 text-sm">{{ p.specialty || '—' }}</div>
                  <div class="text-base-content/60 flex flex-wrap gap-x-4 text-xs">
                    <span dir="ltr">{{ row.user.email }}</span>
                    <span>کد نظام: <span dir="ltr">{{ p.professional_code || '—' }}</span></span>
                    <span>ثبت‌نام: {{ row.user.created_at | jalaliDate }}</span>
                  </div>
                  <div class="flex flex-wrap gap-2 pt-1">
                    @for (d of p.documents; track d.id) {
                      <span class="badge badge-outline gap-1"><app-icon name="file" [size]="12" /><span dir="ltr">{{ d.name }}</span></span>
                    } @empty {
                      <span class="text-warning text-xs">مدرکی بارگذاری نشده است.</span>
                    }
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap items-start gap-2">
                @if (p.verification_status !== 'APPROVED') {
                  <button class="btn btn-success btn-sm" (click)="decide(row, 'APPROVE')">تأیید</button>
                }
                @if (p.verification_status === 'PENDING_VERIFICATION') {
                  <button class="btn btn-outline btn-error btn-sm" (click)="decide(row, 'REJECT')">رد</button>
                }
                @if (p.verification_status === 'APPROVED') {
                  <button class="btn btn-outline btn-warning btn-sm" (click)="decide(row, 'SUSPEND')">تعلیق</button>
                }
              </div>
            </div>
          </div>
        } @empty {
          <app-empty-state icon="shield" title="موردی وجود ندارد" />
        }
      </div>
    }
  `,
})
export class PsychologistVerificationPage {
  private readonly api = inject(AdminApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly status = signal<VerificationStatus | ''>('PENDING_VERIFICATION');
  protected readonly list = rxResource({
    params: () => this.status(),
    stream: ({ params }) => this.api.psychologists({ verification_status: params || undefined }),
  });

  protected async decide(row: AdminUserRow, decision: VerificationDecision): Promise<void> {
    const note = await this.confirm.prompt({
      title: `${DECISION_TEXT[decision]} حساب ${row.name}`,
      message: 'این اقدام در گزارش رویدادها ثبت می‌شود و به کاربر اطلاع داده می‌شود.',
      confirmText: DECISION_TEXT[decision],
      danger: decision !== 'APPROVE',
      notePlaceholder: decision === 'REJECT' ? 'دلیل رد (به کاربر نمایش داده می‌شود)' : 'یادداشت داخلی (اختیاری)',
    });
    if (note === null) return;
    this.api.verify(row.user.id, decision, note || undefined).subscribe(() => {
      this.toast.success('وضعیت به‌روزرسانی شد.');
      this.list.reload();
    });
  }
}
