import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'flex flex-col items-center justify-center gap-3 py-12 text-center' },
  template: `
    <div class="bg-primary/10 text-primary grid size-14 place-items-center rounded-full">
      <app-icon [name]="icon()" [size]="26" />
    </div>
    <h3 class="font-semibold">{{ title() }}</h3>
    @if (message()) {
      <p class="text-base-content/60 max-w-sm text-sm">{{ message() }}</p>
    }
    <ng-content />
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('info');
  readonly title = input.required<string>();
  readonly message = input<string>();
}
