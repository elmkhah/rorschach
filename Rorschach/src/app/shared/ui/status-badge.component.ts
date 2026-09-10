import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BADGE_TONE, statusMeta } from '@shared/utils/status';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge badge-sm whitespace-nowrap" [class]="toneClass()">{{ meta().label }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<string | null | undefined>();
  protected readonly meta = computed(() => statusMeta(this.status()));
  protected readonly toneClass = computed(() => BADGE_TONE[this.meta().tone]);
}
