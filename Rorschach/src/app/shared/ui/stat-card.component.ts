import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent, IconName } from './icon.component';

const TONES = {
  primary: 'bg-neutral text-neutral-content',
  secondary: 'bg-secondary text-secondary-content',
  accent: 'bg-accent text-accent-content',
  success: 'bg-success/15 text-success',
  warning: 'bg-secondary/25 text-accent-content',
  info: 'bg-base-200 text-base-content',
};

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FaNumberPipe],
  template: `
    <div class="card glass-card h-full">
      <div class="card-body flex-row items-center gap-4 p-5">
        <div class="grid size-12 shrink-0 place-items-center rounded-full" [class]="toneClass()">
          <app-icon [name]="icon()" [size]="20" />
        </div>
        <div class="min-w-0">
          <div class="text-base-content/60 text-sm">{{ label() }}</div>
          <div class="text-2xl font-black">{{ value() | faNumber }}</div>
        </div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly icon = input<IconName>('activity');
  readonly tone = input<keyof typeof TONES>('primary');
  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
