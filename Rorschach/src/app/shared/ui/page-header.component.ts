import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-end justify-between gap-4 mb-6' },
  template: `
    <div class="min-w-0">
      <h1 class="text-2xl font-bold">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="text-base-content/60 mt-1 text-sm">{{ subtitle() }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
