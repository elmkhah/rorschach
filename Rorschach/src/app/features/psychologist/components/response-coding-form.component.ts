import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { ResponseCoding } from '@core/models';
import {
  codeString,
  COGNITIVE_CODES,
  CONTENT_CODES,
  DETERMINANT_CODES,
  emptyCoding,
  FQ_CODES,
  LOCATION_CODES,
  RpasCode,
  SPACE_CODES,
  THEMATIC_CODES,
} from '@core/rpas/rpas-codes';

type ListField = 'space' | 'content' | 'determinants' | 'cognitive_codes' | 'thematic_codes';
type FlagField = 'synthesis' | 'vague' | 'pair' | 'popular';

const GROUPS: { field: ListField; title: string; codes: RpasCode[] }[] = [
  { field: 'space', title: 'فضا (Space)', codes: SPACE_CODES },
  { field: 'content', title: 'محتوا (Content)', codes: CONTENT_CODES },
  { field: 'determinants', title: 'عوامل تعیین‌کننده (Determinants)', codes: DETERMINANT_CODES },
  { field: 'cognitive_codes', title: 'کدهای شناختی (Cognitive)', codes: COGNITIVE_CODES },
  { field: 'thematic_codes', title: 'کدهای مضمونی (Thematic)', codes: THEMATIC_CODES },
];

const FLAGS: { field: FlagField; label: string }[] = [
  { field: 'synthesis', label: 'ترکیب (Sy)' },
  { field: 'vague', label: 'مبهم (Vg)' },
  { field: 'pair', label: 'جفت (2)' },
  { field: 'popular', label: 'رایج (P)' },
];

/** R-PAS coding of a single response. Hover a code to see its meaning. */
@Component({
  selector: 'app-response-coding-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 text-sm">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="mb-1.5 font-bold">محل (Location)</div>
          <div class="flex flex-wrap gap-1.5" dir="ltr">
            @for (c of locations; track c.code) {
              <button
                type="button"
                class="btn btn-xs"
                [class.btn-neutral]="d().location === c.code"
                [class.btn-outline]="d().location !== c.code"
                [title]="c.label"
                (click)="setLocation(c.code)"
              >
                {{ c.code }}
              </button>
            }
          </div>
        </div>
        <div>
          <div class="mb-1.5 font-bold">کیفیت فرم (FQ)</div>
          <div class="flex flex-wrap gap-1.5" dir="ltr">
            @for (c of fqCodes; track c.code) {
              <button
                type="button"
                class="btn btn-xs"
                [class.btn-neutral]="d().form_quality === c.code"
                [class.btn-outline]="d().form_quality !== c.code"
                [title]="c.label"
                (click)="setFq(c.code)"
              >
                {{ c.code }}
              </button>
            }
          </div>
        </div>
      </div>

      @for (g of groups; track g.field) {
        <div>
          <div class="mb-1.5 font-bold">{{ g.title }}</div>
          <div class="flex flex-wrap gap-1.5" dir="ltr">
            @for (c of g.codes; track c.code) {
              <button
                type="button"
                class="btn btn-xs"
                [class.btn-neutral]="isOn(g.field, c.code)"
                [class.btn-outline]="!isOn(g.field, c.code)"
                [title]="c.label"
                (click)="toggle(g.field, c.code)"
              >
                {{ c.code }}
              </button>
            }
          </div>
        </div>
      }

      <div class="flex flex-wrap gap-x-5 gap-y-2">
        @for (f of flags; track f.field) {
          <label class="flex cursor-pointer items-center gap-2">
            <input type="checkbox" class="checkbox checkbox-xs" [checked]="d()[f.field]" (change)="toggleFlag(f.field)" />
            {{ f.label }}
          </label>
        }
      </div>

      <textarea
        class="textarea textarea-sm w-full"
        rows="2"
        placeholder="یادداشت کدگذاری (اختیاری)"
        [value]="d().notes"
        (input)="setNotes($any($event.target).value)"
      ></textarea>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <code class="bg-base-200 rounded-lg px-2 py-1 text-xs" dir="ltr">{{ preview() || '—' }}</code>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="saving() || !d().location" (click)="save.emit(d())">
          @if (saving()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          ذخیره‌ی کدگذاری
        </button>
      </div>
    </div>
  `,
})
export class ResponseCodingFormComponent {
  readonly coding = input<ResponseCoding | null>(null);
  readonly saving = input(false);
  readonly save = output<ResponseCoding>();

  protected readonly locations = LOCATION_CODES;
  protected readonly fqCodes = FQ_CODES;
  protected readonly groups = GROUPS;
  protected readonly flags = FLAGS;

  protected readonly d = linkedSignal<ResponseCoding>(() => structuredClone(this.coding() ?? emptyCoding()));
  protected readonly preview = computed(() => codeString(this.d()));

  protected isOn(field: ListField, code: string): boolean {
    return (this.d()[field] as string[]).includes(code);
  }

  protected toggle(field: ListField, code: string): void {
    this.d.update((c) => {
      const list = c[field] as string[];
      const next = list.includes(code) ? list.filter((x) => x !== code) : [...list, code];
      return { ...c, [field]: next } as ResponseCoding;
    });
  }

  protected setLocation(code: string): void {
    this.d.update((c) => ({ ...c, location: c.location === code ? null : (code as ResponseCoding['location']) }));
  }

  protected setFq(code: string): void {
    this.d.update((c) => ({ ...c, form_quality: c.form_quality === code ? null : (code as ResponseCoding['form_quality']) }));
  }

  protected toggleFlag(field: FlagField): void {
    this.d.update((c) => ({ ...c, [field]: !c[field] }));
  }

  protected setNotes(notes: string): void {
    this.d.update((c) => ({ ...c, notes }));
  }
}
