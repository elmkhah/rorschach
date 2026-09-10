import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminApi } from '@core/api/admin-api.service';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

@Component({
  selector: 'app-tests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, StatusBadgeComponent, IconComponent, LoadingComponent, JalaliDatePipe],
  template: `
    <app-page-header title="تعریف آزمون‌ها" subtitle="TestDefinition → TestVersion؛ نسخه‌ی منتشرشده تغییرناپذیر است." />

    @if (tests.isLoading()) {
      <app-loading />
    }
    @for (t of tests.value() ?? []; track t.id) {
      <div class="card glass-card mb-4">
        <div class="card-body">
          <div class="flex flex-wrap items-center gap-3">
            <div class="bg-primary/10 text-primary grid size-12 place-items-center rounded-2xl"><app-icon name="layers" /></div>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-bold">{{ t.name }}</h2>
                <span class="badge badge-ghost badge-sm font-mono" dir="ltr">{{ t.code }}</span>
                <app-status-badge [status]="t.status" />
              </div>
              <p class="text-base-content/60 text-sm">{{ t.description }}</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="table table-sm mt-2">
              <thead><tr><th>نسخه</th><th>وضعیت</th><th>ایجاد</th><th>انتشار</th><th></th></tr></thead>
              <tbody>
                @for (v of t.versions; track v.id) {
                  <tr>
                    <td class="font-mono" dir="ltr">v{{ v.version }}</td>
                    <td>
                      <span class="badge badge-sm badge-soft" [class.badge-success]="v.is_published" [class.badge-neutral]="!v.is_published">
                        {{ v.is_published ? 'منتشرشده' : 'پیش‌نویس' }}
                      </span>
                    </td>
                    <td class="text-sm">{{ v.created_at | jalaliDate: 'short' }}</td>
                    <td class="text-sm">{{ v.published_at | jalaliDate: 'short' }}</td>
                    <td class="text-end"><a class="btn btn-ghost btn-xs" [routerLink]="['/admin/tests/versions', v.id]">مشاهده / ویرایش</a></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
  `,
})
export class TestsPage {
  private readonly api = inject(AdminApi);
  protected readonly tests = rxResource({ stream: () => this.api.tests() });
}
