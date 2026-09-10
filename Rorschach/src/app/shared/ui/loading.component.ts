import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center justify-center gap-3 py-12 text-base-content/60' },
  template: `<span class="loading loading-spinner loading-md text-primary"></span><span class="text-sm">{{ label() }}</span>`,
})
export class LoadingComponent {
  readonly label = input('در حال بارگذاری…');
}
