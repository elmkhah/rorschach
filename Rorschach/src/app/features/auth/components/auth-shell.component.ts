import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ImageSlotComponent } from '@shared/ui/image-slot.component';
import { ImageSlot } from '@shared/utils/images';

/** Auth pages: form on one side, image card with a glass caption on the other. */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImageSlotComponent],
  host: { class: 'block px-4 py-6' },
  template: `
    <div class="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
      <div class="flex items-center justify-center py-4">
        <div class="w-full max-w-xl"><ng-content /></div>
      </div>
      <div class="bg-base-200 relative hidden min-h-[36rem] overflow-hidden rounded-box lg:block">
        <app-image-slot class="absolute inset-0" [src]="image().src" [hint]="image().hint" alt="" />
        @if (title()) {
          <div class="glass-card absolute inset-x-5 bottom-5 rounded-[1.25rem] p-5">
            <div class="text-lg font-extrabold">{{ title() }}</div>
            @if (caption()) {
              <p class="text-base-content/70 mt-1 text-sm leading-7">{{ caption() }}</p>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AuthShellComponent {
  readonly image = input.required<ImageSlot>();
  readonly title = input<string>();
  readonly caption = input<string>();
}
