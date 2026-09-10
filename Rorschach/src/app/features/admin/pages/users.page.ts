import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AdminApi } from '@core/api/admin-api.service';
import { AdminUserRow, Role } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { PaginationComponent } from '@shared/components/pagination.component';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { debounceTime } from 'rxjs';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, AvatarComponent, StatusBadgeComponent, IconComponent, LoadingComponent, PaginationComponent, JalaliDatePipe],
  template: `
    <app-page-header title="کاربران">
      <select class="select select-sm w-36" (change)="setRole($any($event.target).value)">
        <option value="">همه‌ی نقش‌ها</option>
        <option value="PATIENT">مراجع</option>
        <option value="PSYCHOLOGIST">روان‌شناس</option>
        <option value="ADMIN">مدیر</option>
      </select>
      <label class="input input-sm w-56">
        <app-icon name="search" [size]="16" class="opacity-50" />
        <input type="search" placeholder="نام یا ایمیل…" (input)="search.set($any($event.target).value)" />
      </label>
    </app-page-header>

    <div class="card glass-card">
      @if (users.isLoading() && !users.value()) {
        <app-loading />
      } @else if (users.value(); as page) {
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr><th>کاربر</th><th>ایمیل</th><th>نقش</th><th>عضویت</th><th>وضعیت</th><th></th></tr>
            </thead>
            <tbody>
              @for (row of page.results; track row.user.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      <app-avatar [name]="row.name" size="xs" />
                      <span class="whitespace-nowrap">{{ row.name }}</span>
                    </div>
                  </td>
                  <td dir="ltr" class="text-start text-sm">{{ row.user.email }}</td>
                  <td><app-status-badge [status]="row.user.role" /></td>
                  <td class="whitespace-nowrap text-sm">{{ row.user.created_at | jalaliDate }}</td>
                  <td>
                    <span class="badge badge-sm badge-soft" [class.badge-success]="row.user.is_active" [class.badge-error]="!row.user.is_active">
                      {{ row.user.is_active ? 'فعال' : 'غیرفعال' }}
                    </span>
                  </td>
                  <td class="text-end">
                    <button class="btn btn-ghost btn-xs" (click)="toggle(row)">{{ row.user.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex justify-center p-4">
          <app-pagination [count]="page.count" [page]="page_()" [pageSize]="pageSize" (pageChange)="page_.set($event)" />
        </div>
      }
    </div>
  `,
})
export class UsersPage {
  private readonly api = inject(AdminApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly search = signal('');
  protected readonly role = signal<Role | undefined>(undefined);
  protected readonly page_ = signal(1);
  private readonly q = toSignal(toObservable(this.search).pipe(debounceTime(300)), { initialValue: '' });

  protected readonly users = rxResource({
    params: () => ({ search: this.q(), role: this.role(), page: this.page_(), page_size: PAGE_SIZE }),
    stream: ({ params }) => this.api.users(params),
  });

  protected setRole(value: string): void {
    this.role.set((value || undefined) as Role | undefined);
    this.page_.set(1);
  }

  protected async toggle(row: AdminUserRow): Promise<void> {
    const deactivate = row.user.is_active;
    const ok = await this.confirm.confirm({
      title: deactivate ? 'غیرفعال‌سازی کاربر' : 'فعال‌سازی کاربر',
      message: `${row.name} ${deactivate ? 'غیرفعال' : 'فعال'} شود؟`,
      danger: deactivate,
    });
    if (!ok) return;
    this.api.toggleActive(row.user.id).subscribe(() => {
      this.toast.success('وضعیت کاربر به‌روزرسانی شد.');
      this.users.reload();
    });
  }
}
