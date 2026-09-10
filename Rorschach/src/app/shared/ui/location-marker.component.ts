import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { LocationMark } from '@core/models';

const MAX_MARKS = 12;

/** Card image on which the examinee marks where they saw a response (Clarification Phase). */
@Component({
  selector: 'app-location-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative select-none" (contextmenu)="$event.preventDefault()">
      <img
        [src]="src()"
        alt="کارت آزمون"
        draggable="false"
        class="bg-base-100 block w-full rounded-2xl"
        [class.cursor-crosshair]="!locked()"
        (click)="add($event)"
      />
      @if (whole()) {
        <div class="ring-secondary pointer-events-none absolute inset-0 rounded-2xl ring-4"></div>
      }
      @for (m of marks(); track $index) {
        <button
          type="button"
          class="border-base-100 bg-secondary absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
          [class.size-6]="!locked()"
          [class.size-3]="locked()"
          [class.pointer-events-none]="locked()"
          [style.left.%]="m.x * 100"
          [style.top.%]="m.y * 100"
          (click)="remove($index)"
          aria-label="حذف نشانه"
        ></button>
      }
    </div>
  `,
})
export class LocationMarkerComponent {
  readonly src = input.required<string>();
  readonly marks = model<LocationMark[]>([]);
  readonly whole = input(false);
  /** Read-only preview (psychologist view). */
  readonly locked = input(false);

  protected add(e: MouseEvent): void {
    if (this.locked() || this.marks().length >= MAX_MARKS) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    const mark = { x: round((e.clientX - rect.left) / rect.width), y: round((e.clientY - rect.top) / rect.height) };
    this.marks.update((list) => [...list, mark]);
  }

  protected remove(index: number): void {
    if (this.locked()) return;
    this.marks.update((list) => list.filter((_, i) => i !== index));
  }
}
