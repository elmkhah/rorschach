import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PsychologistSummary } from '@core/models';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { IconComponent } from '@shared/ui/icon.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';

/** One psychologist as a horizontal list row. */
@Component({
  selector: 'app-psychologist-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, IconComponent, StatusBadgeComponent, FaNumberPipe],
  template: `
    @let p = psychologist();
    <div class="glass-card flex flex-col gap-4 rounded-box p-4 sm:flex-row sm:items-center sm:p-5">
      <div class="flex min-w-0 flex-1 items-center gap-4">
        <app-avatar [name]="p.first_name + ' ' + p.last_name" [src]="p.avatar" size="lg" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <a [routerLink]="['/patient/psychologists', p.user_id]" class="hover:text-secondary truncate text-base font-extrabold transition">
              {{ p.first_name }} {{ p.last_name }}
            </a>
            @if (p.relationship_status) {
              <app-status-badge [status]="p.relationship_status" />
            }
          </div>
          <div class="text-base-content/60 text-sm">{{ p.specialty }}</div>
          <div class="text-base-content/50 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            @if (p.city) {
              <span class="inline-flex items-center gap-1"><app-icon name="map-pin" [size]="13" />{{ p.city }}</span>
            }
            <span class="inline-flex items-center gap-1"><app-icon name="award" [size]="13" />{{ p.years_of_experience | faNumber }} سال سابقه</span>
          </div>
        </div>
      </div>

      <div class="hidden max-w-xs xl:block">
        <p class="text-base-content/60 line-clamp-2 text-sm leading-6">{{ p.bio }}</p>
      </div>

      <div class="flex shrink-0 gap-2">
        <a class="btn btn-outline btn-sm" [routerLink]="['/patient/psychologists', p.user_id]">پروفایل</a>
        @switch (p.relationship_status) {
          @case ('ACTIVE') {
            <a class="btn btn-primary btn-sm" [routerLink]="['/patient/psychologists', p.user_id]">
              <app-icon name="check" [size]="14" /> ارتباط فعال
            </a>
          }
          @case ('PENDING') {
            <button class="btn btn-sm" disabled>درخواست ارسال شد</button>
          }
          @default {
            <button class="btn btn-primary btn-sm" [disabled]="busy()" (click)="request.emit(p)">
              @if (busy()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              ارسال درخواست
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class PsychologistRowComponent {
  readonly psychologist = input.required<PsychologistSummary>();
  readonly busy = input(false);
  readonly request = output<PsychologistSummary>();
}
