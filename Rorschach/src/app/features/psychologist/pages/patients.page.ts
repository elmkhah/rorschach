import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { Relationship } from '@core/models';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { PageHeaderComponent } from '@shared/ui/page-header.component';
import { fullName } from '@shared/utils/names';
import { RelationshipActions } from '../services/relationship-actions.service';

@Component({
  selector: 'app-patients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, AvatarComponent, IconComponent, EmptyStateComponent, LoadingComponent, JalaliDatePipe],
  template: `
    <app-page-header title="مراجعان" subtitle="مراجعانی که ارتباط فعال با شما دارند.">
      <label class="input w-full sm:w-64">
        <app-icon name="search" [size]="18" class="opacity-50" />
        <input type="search" placeholder="جست‌وجوی نام…" (input)="search.set($any($event.target).value)" />
      </label>
    </app-page-header>

    @if (relationships.isLoading() && !relationships.value()) {
      <app-loading />
    } @else {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        @for (r of filtered(); track r.id) {
          <div class="card glass-card">
            <div class="card-body gap-3">
              <div class="flex items-center gap-3">
                <app-avatar [name]="name(r)" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-bold">{{ name(r) }}</div>
                  <div class="text-base-content/60 text-xs">ارتباط از {{ r.approved_at | jalaliDate }}</div>
                </div>
              </div>
              <div class="card-actions">
                <a class="btn btn-primary btn-sm flex-1" [routerLink]="['/psychologist/patients', r.patient_id]">پرونده</a>
                <a class="btn btn-outline btn-sm" routerLink="/psychologist/chat" aria-label="گفت‌وگو"><app-icon name="message" [size]="16" /></a>
                <button class="btn btn-ghost btn-sm text-error" (click)="revoke(r)">قطع ارتباط</button>
              </div>
            </div>
          </div>
        } @empty {
          <app-empty-state class="col-span-full" icon="users" title="مراجع فعالی ندارید" message="درخواست‌های ارتباط را از بخش درخواست‌ها تأیید کنید." />
        }
      </div>
    }
  `,
})
export class PatientsPage {
  private readonly api = inject(RelationshipsApi);
  private readonly actions = inject(RelationshipActions);

  protected readonly search = signal('');
  protected readonly relationships = rxResource({ stream: () => this.api.list('ACTIVE') });
  protected readonly filtered = computed(() => {
    const q = this.search().trim();
    return (this.relationships.value() ?? []).filter((r) => !q || this.name(r).includes(q));
  });

  protected name(r: Relationship): string {
    return fullName(r.patient);
  }

  protected async revoke(r: Relationship): Promise<void> {
    if (await this.actions.revoke(r)) this.relationships.reload();
  }
}
