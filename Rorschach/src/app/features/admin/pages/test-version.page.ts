import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AdminApi } from '@core/api/admin-api.service';
import { AssessmentCard } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';

@Component({
  selector: 'app-test-version-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, LoadingComponent, FaNumberPipe],
  template: `
    <a routerLink="/admin/tests" class="btn btn-ghost btn-sm mb-4">
      <app-icon name="arrow-left" [size]="16" /> آزمون‌ها
    </a>

    @if (version.isLoading() && !version.value()) {
      <app-loading />
    } @else if (version.value(); as v) {
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">نسخه‌ی <span dir="ltr">v{{ v.version }}</span></h1>
          <p class="text-base-content/60 text-sm">
            {{ v.is_published ? 'این نسخه منتشر شده و قابل ویرایش نیست (BR-04).' : 'پیش‌نویس — تغییرات تا پیش از انتشار مجاز است.' }}
          </p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" (click)="clone(v.id)"><app-icon name="copy" [size]="16" /> ساخت نسخه‌ی جدید</button>
          @if (!v.is_published) {
            <button class="btn btn-primary btn-sm" (click)="publish(v.id)">انتشار</button>
          }
        </div>
      </div>

      @for (phase of v.phases ?? []; track phase.id) {
        <div class="card glass-card mb-4">
          <div class="card-body">
            <h2 class="card-title text-base">{{ phase.name }}</h2>
            <p class="text-base-content/60 text-sm">{{ phase.description }}</p>
            <div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              @for (card of phase.cards; track card.id) {
                <div class="border-base-300 rounded-box border p-3">
                  <div class="bg-base-200 text-base-content/40 mb-2 grid aspect-[4/3] place-items-center rounded-lg">
                    @if (card.image_url) {
                      <img [src]="card.image_url" [alt]="card.title" class="h-full w-full rounded-lg object-contain" />
                    } @else {
                      <app-icon name="image" [size]="28" />
                    }
                  </div>
                  <div class="text-base-content/50 text-xs">کارت {{ card.card_number | faNumber }}</div>
                  @if (v.is_published) {
                    <div class="text-sm font-medium">{{ card.title }}</div>
                  } @else {
                    <input
                      class="input input-sm mt-1 w-full"
                      [value]="card.title"
                      (change)="rename(card, $any($event.target).value)"
                    />
                  }
                  <label class="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      class="toggle toggle-xs toggle-primary"
                      [checked]="card.configuration.required"
                      [disabled]="v.is_published"
                      (change)="setRequired(card, $any($event.target).checked)"
                    />
                    الزامی
                  </label>
                </div>
              }
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class TestVersionPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly version = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.testVersion(params),
  });

  protected rename(card: AssessmentCard, title: string): void {
    this.api.updateCard(card.id, { title }).subscribe(() => this.toast.success('ذخیره شد.'));
  }

  protected setRequired(card: AssessmentCard, required: boolean): void {
    this.api
      .updateCard(card.id, { configuration: { ...card.configuration, required } })
      .subscribe(() => this.version.reload());
  }

  protected async clone(id: string): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'ساخت نسخه‌ی جدید',
      message: 'یک پیش‌نویس جدید از روی این نسخه ساخته می‌شود. جلسات قبلی همچنان به نسخه‌ی خودشان متصل می‌مانند.',
    });
    if (!ok) return;
    this.api.cloneVersion(id).subscribe((v) => {
      this.toast.success(`نسخه‌ی v${v.version} ساخته شد.`);
      void this.router.navigate(['/admin/tests/versions', v.id]);
    });
  }

  protected async publish(id: string): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'انتشار نسخه',
      message: 'پس از انتشار، این نسخه تغییرناپذیر است. ادامه می‌دهید؟',
      confirmText: 'انتشار',
    });
    if (!ok) return;
    this.api.publishVersion(id).subscribe(() => {
      this.toast.success('نسخه منتشر شد.');
      this.version.reload();
    });
  }
}
