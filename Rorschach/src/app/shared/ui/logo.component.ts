import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IMAGES } from '@shared/utils/images';

/** Uses public/images/brand/logo.svg when present; otherwise a placeholder ink-blot mark. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2' },
  template: `
    @if (!failed()) {
      <img [src]="src" alt="رورشاخ" class="w-auto" [style.height.px]="size()" (error)="failed.set(true)" />
    } @else {
      <span
        class="grid place-items-center rounded-full"
        [class]="inverted() ? 'bg-base-100 text-base-content' : 'bg-neutral text-neutral-content'"
        [style.width.px]="size()"
        [style.height.px]="size()"
      >
        <svg viewBox="0 0 48 48" [attr.width]="size() * 0.68" [attr.height]="size() * 0.68" aria-hidden="true">
          <path fill="currentColor" d="M24 6c-3 4-9 3-12 7s1 8-2 12 1 9 6 9 5 5 8 8c3-3 3-8 8-8s9-5 6-9-5-8-2-12-9-3-12-7z" />
          <ellipse cx="19" cy="22" rx="2.2" ry="3.4" [class]="inverted() ? 'fill-base-100' : 'fill-neutral'" />
          <ellipse cx="29" cy="22" rx="2.2" ry="3.4" [class]="inverted() ? 'fill-base-100' : 'fill-neutral'" />
        </svg>
      </span>
      @if (withText()) {
        <span class="text-lg font-black tracking-tight">رورشاخ</span>
      }
    }
  `,
})
export class LogoComponent {
  readonly size = input(36);
  readonly withText = input(true);
  /** For dark backgrounds. */
  readonly inverted = input(false);

  protected readonly src = IMAGES.logo.src;
  protected readonly failed = signal(false);
}
