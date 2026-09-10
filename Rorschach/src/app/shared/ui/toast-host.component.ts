import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '@core/services/toast.service';
import { IconComponent } from './icon.component';

const ALERT = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', error: 'alert-error' };
const ICON = { info: 'info', success: 'check', warning: 'alert', error: 'alert' } as const;

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="toast toast-top toast-center z-[1000]" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div role="alert" class="alert alert-soft shadow-sm" [class]="alert[t.kind]">
          <app-icon [name]="icon[t.kind]" [size]="18" />
          <span class="text-sm">{{ t.message }}</span>
          <button class="btn btn-ghost btn-xs btn-circle" (click)="toast.dismiss(t.id)" aria-label="بستن">
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);
  protected readonly alert = ALERT;
  protected readonly icon = ICON;
}
