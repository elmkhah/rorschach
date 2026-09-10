import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const SIZES = { xs: 'w-8 text-xs', sm: 'w-10 text-sm', md: 'w-12 text-base', lg: 'w-16 text-xl', xl: 'w-24 text-3xl' };

/** Photo when available (and loadable), otherwise initials. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showImage()) {
      <div class="avatar" [class.avatar-online]="online()">
        <div class="rounded-full" [class]="sizeClass()">
          <img [src]="src()" [alt]="name()" (error)="failedSrc.set(src() ?? null)" />
        </div>
      </div>
    } @else {
      <div class="avatar avatar-placeholder" [class.avatar-online]="online()">
        <div class="bg-accent text-accent-content rounded-full font-bold" [class]="sizeClass()">
          <span>{{ initials() }}</span>
        </div>
      </div>
    }
  `,
})
export class AvatarComponent {
  readonly name = input('');
  readonly src = input<string | null | undefined>(null);
  readonly size = input<keyof typeof SIZES>('md');
  readonly online = input(false);

  protected readonly failedSrc = signal<string | null>(null);
  protected readonly showImage = computed(() => !!this.src() && this.src() !== this.failedSrc());
  protected readonly sizeClass = computed(() => SIZES[this.size()]);
  protected readonly initials = computed(() =>
    this.name()
      .replace(/^دکتر\s+/, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('‌'),
  );
}
