import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  /** Show a free-text note field; `prompt()` resolves with its value. */
  withNote?: boolean;
  notePlaceholder?: string;
}

interface Pending extends ConfirmOptions {
  resolve: (result: string | null) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<Pending | null>(null);

  /** Resolves true when confirmed. */
  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.open({ ...options, withNote: false }).then((r) => r !== null);
  }

  /** Resolves with the note (possibly empty) when confirmed, null when cancelled. */
  prompt(options: ConfirmOptions): Promise<string | null> {
    return this.open({ ...options, withNote: true });
  }

  private open(options: ConfirmOptions): Promise<string | null> {
    this.current()?.resolve(null);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }
}

@Component({
  selector: 'app-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.current(); as c) {
      <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" (keydown.escape)="close(false)">
        <div class="modal-box">
          <h3 class="text-lg font-bold">{{ c.title }}</h3>
          @if (c.message) {
            <p class="text-base-content/70 py-3 text-sm leading-7">{{ c.message }}</p>
          }
          @if (c.withNote) {
            <textarea
              class="textarea mt-2 w-full"
              rows="3"
              [placeholder]="c.notePlaceholder ?? 'توضیحات (اختیاری)'"
              (input)="note.set($any($event.target).value)"
            ></textarea>
          }
          <div class="modal-action">
            <button class="btn btn-ghost" (click)="close(false)">انصراف</button>
            <button class="btn" [class.btn-error]="c.danger" [class.btn-primary]="!c.danger" (click)="close(true)">
              {{ c.confirmText ?? 'تأیید' }}
            </button>
          </div>
        </div>
        <div class="modal-backdrop" (click)="close(false)"></div>
      </div>
    }
  `,
})
export class ConfirmHostComponent {
  protected readonly svc = inject(ConfirmService);
  protected readonly note = signal('');

  protected close(ok: boolean): void {
    const c = this.svc.current();
    this.svc.current.set(null);
    c?.resolve(ok ? this.note() : null);
    this.note.set('');
  }
}
