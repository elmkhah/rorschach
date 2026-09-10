import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { environment } from '@env/environment';
import { IconComponent } from './icon.component';

/**
 * Shows the image at `src`; until that file exists (or if it fails to load)
 * renders a dashed placeholder naming the expected file and size.
 */
@Component({
  selector: 'app-image-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'block overflow-hidden' },
  template: `
    @if (showImage()) {
      <img
        [src]="src()"
        [alt]="alt()"
        class="h-full w-full"
        [class.object-cover]="fit() === 'cover'"
        [class.object-contain]="fit() === 'contain'"
        (error)="failedSrc.set(src())"
      />
    } @else {
      <div
        class="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[inherit] border-2 border-dashed p-4 text-center"
        [class]="placeholderClass()"
      >
        <app-icon name="image" [size]="30" />
        <span class="text-xs font-bold">محل تصویر</span>
        @if (hint()) {
          <span class="max-w-60 text-[11px] leading-5">{{ hint() }}</span>
        }
        @if (showPath) {
          <code class="text-[10px]" dir="ltr">public{{ src() }}</code>
        }
      </div>
    }
  `,
})
export class ImageSlotComponent {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly hint = input<string>();
  readonly fit = input<'cover' | 'contain'>('cover');
  /** Placeholder colours for dark backgrounds. */
  readonly dark = input(false);

  protected readonly failedSrc = signal<string | null>(null);
  protected readonly showImage = computed(() => !!this.src() && this.failedSrc() !== this.src());
  protected readonly showPath = !environment.production;
  protected readonly placeholderClass = computed(() =>
    this.dark() ? 'border-white/25 bg-white/5 text-white/60' : 'border-base-content/20 bg-base-100/40 text-base-content/50',
  );
}
