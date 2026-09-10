import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PsychologistsApi } from '@core/api/psychologists-api.service';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { ToastService } from '@core/services/toast.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { StartAssessmentService } from '../services/start-assessment.service';

@Component({
  selector: 'app-psychologist-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, IconComponent, LoadingComponent, StatusBadgeComponent, EmptyStateComponent, FaNumberPipe],
  template: `
    <a routerLink="/patient/psychologists" class="btn btn-ghost btn-sm mb-4">
      <app-icon name="arrow-left" [size]="16" /> بازگشت به فهرست
    </a>

    @if (detail.isLoading()) {
      <app-loading />
    } @else if (detail.error()) {
      <app-empty-state icon="alert" title="روان‌شناس یافت نشد" />
    } @else if (detail.value(); as d) {
      @let p = d.psychologist;
      <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div class="space-y-6">
          <div class="card glass-card">
            <div class="card-body gap-4 sm:flex-row sm:items-center">
              <app-avatar [name]="p.first_name + ' ' + p.last_name" [src]="p.avatar" size="xl" />
              <div class="flex-1 space-y-1">
                <h1 class="text-2xl font-bold">{{ p.first_name }} {{ p.last_name }}</h1>
                <div class="text-base-content/70">{{ p.specialty }}</div>
                <div class="text-base-content/60 flex flex-wrap gap-4 text-sm">
                  @if (p.city) {
                    <span class="inline-flex items-center gap-1"><app-icon name="map-pin" [size]="16" />{{ p.city }}</span>
                  }
                  <span class="inline-flex items-center gap-1"><app-icon name="award" [size]="16" />{{ p.years_of_experience | faNumber }} سال سابقه</span>
                  <span class="inline-flex items-center gap-1" dir="ltr"><app-icon name="shield" [size]="16" />{{ p.professional_code }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card glass-card">
            <div class="card-body">
              <h2 class="card-title text-base">درباره</h2>
              <p class="text-base-content/70 leading-8">{{ p.bio || 'توضیحی ثبت نشده است.' }}</p>
            </div>
          </div>

          <div class="card glass-card">
            <div class="card-body">
              <h2 class="card-title text-base">سوابق و افتخارات</h2>
              <ul class="timeline timeline-vertical timeline-compact timeline-snap-icon">
                @for (a of d.achievements; track a.id; let last = $last) {
                  <li>
                    <div class="timeline-middle text-primary"><app-icon name="award" [size]="18" /></div>
                    <div class="timeline-end mb-6">
                      <div class="font-medium">{{ a.title }}</div>
                      <div class="text-base-content/60 text-sm">{{ a.issuer }} · {{ a.year.toString() | faNumber }}</div>
                      @if (a.description) {
                        <p class="text-base-content/70 mt-1 text-sm">{{ a.description }}</p>
                      }
                    </div>
                    @if (!last) {
                      <hr class="bg-base-300" />
                    }
                  </li>
                } @empty {
                  <p class="text-base-content/60 text-sm">موردی ثبت نشده است.</p>
                }
              </ul>
            </div>
          </div>
        </div>

        <div class="card glass-card h-fit">
          <div class="card-body gap-3">
            <h2 class="card-title text-base">ارتباط</h2>
            @switch (p.relationship_status) {
              @case ('ACTIVE') {
                <app-status-badge status="ACTIVE" />
                <p class="text-base-content/70 text-sm">ارتباط شما فعال است و می‌توانید آزمون را شروع کنید.</p>
                <button class="btn btn-primary" [disabled]="starter.pending() === p.user_id" (click)="starter.start(p.user_id)">
                  @if (starter.pending() === p.user_id) {
                    <span class="loading loading-spinner loading-sm"></span>
                  } @else {
                    <app-icon name="play" [size]="16" />
                  }
                  شروع / ادامه‌ی آزمون
                </button>
                <a class="btn btn-outline" routerLink="/patient/chat"><app-icon name="message" [size]="16" /> گفت‌وگو</a>
              }
              @case ('PENDING') {
                <app-status-badge status="PENDING" />
                <p class="text-base-content/70 text-sm">درخواست شما در انتظار تأیید روان‌شناس است.</p>
              }
              @default {
                <p class="text-base-content/70 text-sm">برای انجام آزمون زیر نظر این روان‌شناس، درخواست ارتباط ارسال کنید.</p>
                <button class="btn btn-primary" [disabled]="requesting()" (click)="request(p.user_id)">
                  @if (requesting()) {
                    <span class="loading loading-spinner loading-sm"></span>
                  }
                  ارسال درخواست ارتباط
                </button>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class PsychologistDetailPage {
  private readonly api = inject(PsychologistsApi);
  private readonly relationships = inject(RelationshipsApi);
  private readonly toast = inject(ToastService);
  protected readonly starter = inject(StartAssessmentService);

  readonly id = input.required<string>();
  protected readonly requesting = signal(false);

  protected readonly detail = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  protected request(psychologistId: string): void {
    this.requesting.set(true);
    this.relationships.request(psychologistId).subscribe({
      next: () => {
        this.requesting.set(false);
        this.toast.success('درخواست ارتباط ارسال شد.');
        this.detail.reload();
      },
      error: () => this.requesting.set(false),
    });
  }
}
