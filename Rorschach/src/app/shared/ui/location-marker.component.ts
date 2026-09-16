import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { LocationMark } from '@core/models';

const MAX_MARKS = 12;
/** Anything smaller than this was a stray tap, not a selection. */
const MIN_SIZE = 0.02;

/**
 * Card image on which the examinee shows **where** they saw a response
 * (Clarification Phase).
 *
 * A percept covers an area of the blot — a wing, the middle column, the two
 * pink sides — so the selection is a dragged box of whatever size the examinee
 * needs, not a point. Marks saved before regions existed carry no size and are
 * drawn as dots, so an old protocol still reads correctly.
 */
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
        class="bg-base-100 block w-full touch-none rounded-2xl"
        [class.cursor-crosshair]="!locked()"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end($event)"
        (pointercancel)="cancel()"
      />

      @if (whole()) {
        <div class="ring-secondary pointer-events-none absolute inset-0 rounded-2xl ring-4"></div>
      }

      @for (m of marks(); track $index) {
        @if (isArea(m)) {
          <div
            class="border-secondary bg-secondary/20 pointer-events-none absolute rounded-md border-2"
            [style.left.%]="m.x * 100"
            [style.top.%]="m.y * 100"
            [style.width.%]="(m.w ?? 0) * 100"
            [style.height.%]="(m.h ?? 0) * 100"
          ></div>
        } @else {
          <div
            class="border-base-100 bg-secondary pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
            [style.left.%]="m.x * 100"
            [style.top.%]="m.y * 100"
          ></div>
        }
        @if (!locked()) {
          <button
            type="button"
            class="btn btn-circle btn-xs btn-secondary absolute -translate-x-1/2 -translate-y-1/2 shadow"
            [style.left.%]="m.x * 100"
            [style.top.%]="m.y * 100"
            (click)="remove($index)"
            aria-label="حذف ناحیه"
          >
            ✕
          </button>
        }
      }

      @if (draft(); as d) {
        <div
          class="border-secondary bg-secondary/10 pointer-events-none absolute rounded-md border-2 border-dashed"
          [style.left.%]="d.x * 100"
          [style.top.%]="d.y * 100"
          [style.width.%]="(d.w ?? 0) * 100"
          [style.height.%]="(d.h ?? 0) * 100"
        ></div>
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

  /** The box being dragged right now — drawn dashed, not yet committed. */
  protected readonly draft = signal<LocationMark | null>(null);
  private origin: { x: number; y: number } | null = null;

  protected isArea(m: LocationMark): boolean {
    return (m.w ?? 0) > 0 && (m.h ?? 0) > 0;
  }

  protected start(e: PointerEvent): void {
    if (this.locked() || this.marks().length >= MAX_MARKS) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.origin = this.at(e);
    this.draft.set({ ...this.origin, w: 0, h: 0 });
  }

  protected move(e: PointerEvent): void {
    if (!this.origin) return;
    this.draft.set(this.box(this.origin, this.at(e)));
  }

  protected end(e: PointerEvent): void {
    if (!this.origin) return;
    const box = this.box(this.origin, this.at(e));
    this.cancel();
    // A press without a drag selects nothing: the examinee is choosing an area,
    // and a zero-size one says nothing about where they looked.
    if ((box.w ?? 0) < MIN_SIZE || (box.h ?? 0) < MIN_SIZE) return;
    this.marks.update((list) => [...list, box]);
  }

  protected cancel(): void {
    this.origin = null;
    this.draft.set(null);
  }

  protected remove(index: number): void {
    if (this.locked()) return;
    this.marks.update((list) => list.filter((_, i) => i !== index));
  }

  /** Pointer position as a 0..1 fraction of the image. */
  private at(e: PointerEvent): { x: number; y: number } {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: round((e.clientX - rect.left) / rect.width),
      y: round((e.clientY - rect.top) / rect.height),
    };
  }

  /** Normalises a drag into a top-left anchored box, whichever way it was drawn. */
  private box(from: { x: number; y: number }, to: { x: number; y: number }): LocationMark {
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: round(Math.abs(to.x - from.x)),
      h: round(Math.abs(to.y - from.y)),
    };
  }
}

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
