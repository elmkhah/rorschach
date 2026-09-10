import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Card presented in a square frame so any rotation fits without reflow. */
@Component({
  selector: 'app-inkblot-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="bg-base-100 grid aspect-square w-full place-items-center overflow-hidden rounded-2xl select-none"
      (contextmenu)="$event.preventDefault()"
    >
      @if (src()) {
        <img
          [src]="src()"
          alt="کارت آزمون"
          draggable="false"
          class="h-full w-full object-contain p-2 transition-transform duration-300"
          [style.transform]="'rotate(' + rotation() + 'deg)'"
        />
      }
    </div>
  `,
})
export class InkblotCardComponent {
  readonly src = input<string | null>(null);
  readonly rotation = input(0);
}
