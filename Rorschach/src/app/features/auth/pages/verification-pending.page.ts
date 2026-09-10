import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileApi } from '@core/api/profile-api.service';
import { AuthService } from '@core/auth/auth.service';
import { ToastService } from '@core/services/toast.service';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

@Component({
  selector: 'app-verification-pending-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, StatusBadgeComponent, JalaliDatePipe],
  host: { class: 'flex justify-center px-4 py-12' },
  template: `
    <div class="card glass-card border-base-300 w-full max-w-xl border">
      <div class="card-body gap-4">
        <div class="flex items-center gap-3">
          <div class="bg-warning/20 text-warning-content grid size-12 place-items-center rounded-full">
            <app-icon name="shield" [size]="24" />
          </div>
          <div>
            <h1 class="text-xl font-bold">تأیید حساب حرفه‌ای</h1>
            <app-status-badge [status]="status()" />
          </div>
        </div>

        @switch (status()) {
          @case ('PENDING_VERIFICATION') {
            <p class="text-base-content/70 leading-7">
              مدارک شما دریافت شد و در انتظار بررسی مدیر است. پس از تأیید، به پنل روان‌شناس دسترسی خواهید داشت.
            </p>
          }
          @case ('REJECTED') {
            <div role="alert" class="alert alert-error alert-soft text-sm">
              درخواست تأیید شما رد شد. می‌توانید مدارک تکمیلی بارگذاری کنید.
            </div>
          }
          @case ('SUSPENDED') {
            <div role="alert" class="alert alert-error alert-soft text-sm">حساب حرفه‌ای شما تعلیق شده است. با پشتیبانی تماس بگیرید.</div>
          }
          @case ('APPROVED') {
            <div role="alert" class="alert alert-success alert-soft text-sm">حساب شما تأیید شد.</div>
            <button class="btn btn-primary" (click)="goToPanel()">ورود به پنل روان‌شناس</button>
          }
          @default {
            <p class="text-base-content/70 leading-7">
              برای شروع فرایند تأیید، تصویر مجوز نظام روان‌شناسی و مدرک تحصیلی خود را بارگذاری کنید.
            </p>
          }
        }

        @if (documents().length) {
          <div>
            <h2 class="mb-2 text-sm font-semibold">مدارک بارگذاری‌شده</h2>
            <ul class="bg-base-200 divide-base-300 divide-y rounded-box">
              @for (d of documents(); track d.id) {
                <li class="flex items-center gap-3 p-3 text-sm">
                  <app-icon name="file" [size]="18" class="text-primary" />
                  <span class="flex-1 truncate" dir="ltr">{{ d.name }}</span>
                  <span class="text-base-content/50 text-xs">{{ d.uploaded_at | jalaliDate: 'short' }}</span>
                </li>
              }
            </ul>
          </div>
        }

        @if (canUpload()) {
          <div class="space-y-2">
            <input
              #fileInput
              type="file"
              multiple
              accept=".pdf,image/*"
              class="file-input w-full"
              (change)="selected.set(fileInput.files ? toArray(fileInput.files) : [])"
            />
            <button class="btn btn-primary w-full" [disabled]="!selected().length || uploading()" (click)="upload()">
              @if (uploading()) {
                <span class="loading loading-spinner loading-sm"></span>
              } @else {
                <app-icon name="upload" [size]="18" />
              }
              بارگذاری مدارک
            </button>
          </div>
        }

        <div class="flex justify-between">
          <button class="btn btn-ghost btn-sm" (click)="refresh()">بررسی مجدد وضعیت</button>
          <button class="btn btn-ghost btn-sm text-error" (click)="auth.logout()">خروج</button>
        </div>
      </div>
    </div>
  `,
})
export class VerificationPendingPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ProfileApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly selected = signal<File[]>([]);
  protected readonly uploading = signal(false);
  protected readonly status = computed(() => this.auth.verificationStatus());
  protected readonly documents = computed(() => this.auth.me()?.psychologist_profile?.documents ?? []);
  protected readonly canUpload = computed(() => ['REGISTERED', 'REJECTED', 'PENDING_VERIFICATION'].includes(this.status() ?? ''));

  ngOnInit(): void {
    this.refresh();
  }

  protected toArray(list: FileList): File[] {
    return Array.from(list);
  }

  protected refresh(): void {
    this.auth.reloadMe().subscribe();
  }

  protected upload(): void {
    this.uploading.set(true);
    this.api.uploadVerificationDocuments(this.selected()).subscribe({
      next: (me) => {
        this.auth.setMe(me);
        this.selected.set([]);
        this.uploading.set(false);
        this.toast.success('مدارک با موفقیت بارگذاری شد.');
      },
      error: () => this.uploading.set(false),
    });
  }

  protected goToPanel(): void {
    void this.router.navigateByUrl('/psychologist');
  }
}
