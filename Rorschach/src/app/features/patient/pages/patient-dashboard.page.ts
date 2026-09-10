import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AssessmentsApi } from '@core/api/assessments-api.service';
import { AnnouncementsApi } from '@core/api/communication-api.service';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { AuthService } from '@core/auth/auth.service';
import { Relationship } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { ImageSlotComponent } from '@shared/ui/image-slot.component';
import { StatCardComponent } from '@shared/ui/stat-card.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { IMAGES } from '@shared/utils/images';
import { fullName } from '@shared/utils/names';
import { StartAssessmentService } from '../services/start-assessment.service';

const OPEN = ['CREATED', 'IN_PROGRESS', 'PAUSED'];

@Component({
  selector: 'app-patient-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    StatCardComponent,
    AvatarComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    ImageSlotComponent,
    JalaliDatePipe,
    FaNumberPipe,
  ],
  template: `
    <!-- Hero / next action -->
    <div class="bg-neutral text-neutral-content mb-4 grid overflow-hidden rounded-box md:grid-cols-[1fr_18rem]">
      <div class="flex flex-col justify-center gap-4 p-6 lg:p-8">
        <h1 class="text-2xl font-black lg:text-3xl">
          سلام {{ auth.profile()?.first_name }}، <span class="text-secondary">خوش آمدید</span>
        </h1>
        @if (openSession(); as s) {
          <p class="text-sm leading-7 opacity-70">
            @if (s.status === 'CREATED') {
              آزمون «{{ s.test_name }}» برای شما آماده است. آن را در زمانی آرام و در یک نوبت انجام دهید.
            } @else {
              آزمون «{{ s.test_name }}» شما ناتمام مانده است ({{ s.answered_cards | faNumber }} از {{ s.total_cards | faNumber }} کارت).
              لطفاً آن را هرچه زودتر و بدون وقفه به پایان برسانید.
            }
          </p>
        } @else if (active().length) {
          <p class="text-sm leading-7 opacity-70">ارتباط شما با روان‌شناس فعال است؛ هر زمان آماده بودید آزمون را شروع کنید.</p>
        } @else {
          <p class="text-sm leading-7 opacity-70">برای شروع، یک روان‌شناس انتخاب کنید و درخواست ارتباط بفرستید.</p>
        }
        <div>
          @if (openSession(); as s) {
            <a class="btn bg-base-100 text-base-content border-0" [routerLink]="['/assessment', s.id]">
              ادامه‌ی آزمون <app-icon name="chevron-right" [size]="14" />
            </a>
          } @else if (active().length === 1) {
            <button class="btn bg-base-100 text-base-content border-0" [disabled]="!!starter.pending()" (click)="starter.start(active()[0].psychologist_id)">
              شروع آزمون <app-icon name="chevron-right" [size]="14" />
            </button>
          } @else if (!active().length) {
            <a class="btn bg-base-100 text-base-content border-0" routerLink="/patient/psychologists">
              انتخاب روان‌شناس <app-icon name="chevron-right" [size]="14" />
            </a>
          }
        </div>
      </div>
      <div class="relative hidden min-h-52 md:block">
        <app-image-slot
          class="absolute inset-3 rounded-[1.25rem]"
          [src]="img.patientDashboard.src"
          [hint]="img.patientDashboard.hint"
          [dark]="true"
        />
      </div>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <app-stat-card label="روان‌شناسان فعال" [value]="active().length" icon="stethoscope" />
      <app-stat-card label="درخواست‌های در انتظار" [value]="pending().length" icon="clock" tone="secondary" />
      <app-stat-card label="آزمون‌های تکمیل‌شده" [value]="completedCount()" icon="clipboard" tone="accent" />
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card glass-card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base font-extrabold">روان‌شناسان من</h2>
            <a routerLink="/patient/psychologists" class="btn btn-ghost btn-xs">جست‌وجو</a>
          </div>
          <ul class="divide-base-content/10 divide-y">
            @for (r of myRelationships(); track r.id) {
              <li class="flex items-center gap-3 py-3">
                <app-avatar [name]="name(r)" [src]="r.psychologist?.avatar" size="sm" />
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/patient/psychologists', r.psychologist_id]" class="block truncate text-sm font-bold">{{ name(r) }}</a>
                  <app-status-badge [status]="r.status" />
                </div>
                @if (r.status === 'ACTIVE') {
                  <button class="btn btn-primary btn-xs" [disabled]="starter.pending() === r.psychologist_id" (click)="starter.start(r.psychologist_id)">
                    آزمون
                  </button>
                }
                <button class="btn btn-ghost btn-xs text-error" (click)="revoke(r)">
                  {{ r.status === 'PENDING' ? 'لغو درخواست' : 'قطع ارتباط' }}
                </button>
              </li>
            } @empty {
              <app-empty-state icon="stethoscope" title="هنوز روان‌شناسی ندارید">
                <a routerLink="/patient/psychologists" class="btn btn-primary btn-sm">انتخاب روان‌شناس</a>
              </app-empty-state>
            }
          </ul>
        </div>
      </div>

      <div class="card glass-card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-base font-extrabold">آخرین آزمون‌ها</h2>
            <a routerLink="/patient/assessments" class="btn btn-ghost btn-xs">همه</a>
          </div>
          <ul class="divide-base-content/10 divide-y">
            @for (s of recentSessions(); track s.id) {
              <li class="flex items-center gap-3 py-3">
                <div class="bg-accent text-accent-content grid size-10 place-items-center rounded-full">
                  <app-icon name="clipboard" [size]="18" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-bold">{{ s.test_name }} · {{ s.psychologist_name }}</div>
                  <div class="text-base-content/60 text-xs">{{ s.created_at | jalaliDate }}</div>
                </div>
                <app-status-badge [status]="s.status" />
              </li>
            } @empty {
              <app-empty-state icon="clipboard" title="هنوز آزمونی انجام نداده‌اید" />
            }
          </ul>
        </div>
      </div>
    </div>

    @for (a of announcements.value() ?? []; track a.id) {
      <div class="glass-card mt-4 flex items-start gap-3 rounded-box p-5">
        <span class="bg-secondary text-secondary-content grid size-10 shrink-0 place-items-center rounded-full"><app-icon name="megaphone" [size]="18" /></span>
        <div>
          <div class="font-extrabold">{{ a.title }}</div>
          <div class="text-base-content/70 text-sm leading-7">{{ a.body }}</div>
        </div>
      </div>
    }
  `,
})
export class PatientDashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly starter = inject(StartAssessmentService);
  private readonly relationshipsApi = inject(RelationshipsApi);
  private readonly assessmentsApi = inject(AssessmentsApi);
  private readonly announcementsApi = inject(AnnouncementsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly img = IMAGES;
  protected readonly relationships = rxResource({ stream: () => this.relationshipsApi.list() });
  protected readonly sessions = rxResource({ stream: () => this.assessmentsApi.sessions() });
  protected readonly announcements = rxResource({ stream: () => this.announcementsApi.list() });

  protected readonly myRelationships = computed(() =>
    (this.relationships.value() ?? []).filter((r) => r.status === 'ACTIVE' || r.status === 'PENDING'),
  );
  protected readonly active = computed(() => this.myRelationships().filter((r) => r.status === 'ACTIVE'));
  protected readonly pending = computed(() => this.myRelationships().filter((r) => r.status === 'PENDING'));
  protected readonly openSession = computed(() => (this.sessions.value() ?? []).find((s) => OPEN.includes(s.status)));
  protected readonly completedCount = computed(() => (this.sessions.value() ?? []).filter((s) => s.status === 'COMPLETED').length);
  protected readonly recentSessions = computed(() => (this.sessions.value() ?? []).slice(0, 4));

  protected name(r: Relationship): string {
    return fullName(r.psychologist);
  }

  protected async revoke(r: Relationship): Promise<void> {
    const ok = await this.confirm.confirm({
      title: r.status === 'PENDING' ? 'لغو درخواست' : 'قطع ارتباط',
      message: `آیا از ${r.status === 'PENDING' ? 'لغو درخواست' : 'قطع ارتباط'} با ${this.name(r)} مطمئن هستید؟ آزمون‌های قبلی حفظ می‌شوند.`,
      confirmText: 'بله',
      danger: true,
    });
    if (!ok) return;
    this.relationshipsApi.revoke(r.id).subscribe(() => {
      this.toast.success('انجام شد.');
      this.relationships.reload();
    });
  }
}
