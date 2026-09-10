import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { PsychologistsApi } from '@core/api/psychologists-api.service';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { PsychologistSummary } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { PaginationComponent } from '@shared/components/pagination.component';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { PsychologistRowComponent } from '../components/psychologist-row.component';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-psychologists-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PsychologistRowComponent, EmptyStateComponent, LoadingComponent, IconComponent, PaginationComponent, FaNumberPipe],
  template: `
    <app-page-header title="روان‌شناسان" subtitle="روان‌شناس خود را پیدا کنید و درخواست ارتباط بفرستید.">
      <label class="input w-full rounded-full sm:w-72">
        <app-icon name="search" [size]="18" class="opacity-50" />
        <input type="search" placeholder="نام، تخصص یا شهر…" (input)="search.set($any($event.target).value)" />
      </label>
    </app-page-header>

    @if (psychologists.isLoading() && !psychologists.value()) {
      <app-loading />
    } @else if (psychologists.value(); as page) {
      <div class="text-base-content/50 mb-3 px-2 text-sm">{{ page.count | faNumber }} روان‌شناس</div>
      <div class="flex flex-col gap-3">
        @for (p of page.results; track p.user_id) {
          <app-psychologist-row [psychologist]="p" [busy]="requesting() === p.user_id" (request)="request($event)" />
        } @empty {
          <div class="glass-card rounded-box">
            <app-empty-state icon="search" title="روان‌شناسی یافت نشد" message="عبارت جست‌وجو را تغییر دهید." />
          </div>
        }
      </div>
      <div class="mt-6 flex justify-center">
        <app-pagination [count]="page.count" [page]="page_()" [pageSize]="pageSize" (pageChange)="page_.set($event)" />
      </div>
    }
  `,
})
export class PsychologistsPage {
  private readonly api = inject(PsychologistsApi);
  private readonly relationships = inject(RelationshipsApi);
  private readonly toast = inject(ToastService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly search = signal('');
  protected readonly page_ = signal(1);
  protected readonly requesting = signal<string | null>(null);
  private readonly debouncedSearch = toSignal(toObservable(this.search).pipe(debounceTime(300), distinctUntilChanged()), {
    initialValue: '',
  });

  protected readonly psychologists = rxResource({
    params: () => ({ search: this.debouncedSearch(), page: this.page_(), page_size: PAGE_SIZE }),
    stream: ({ params }) => this.api.list(params),
  });

  protected request(p: PsychologistSummary): void {
    this.requesting.set(p.user_id);
    this.relationships.request(p.user_id).subscribe({
      next: () => {
        this.requesting.set(null);
        this.toast.success(`درخواست برای ${p.first_name} ${p.last_name} ارسال شد.`);
        this.psychologists.reload();
      },
      error: () => this.requesting.set(null),
    });
  }
}
