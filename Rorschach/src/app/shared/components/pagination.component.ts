import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaNumberPipe],
  template: `
    @if (pages() > 1) {
      <div class="join">
        <button class="join-item btn btn-sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">قبلی</button>
        <span class="join-item btn btn-sm pointer-events-none">{{ page() | faNumber }} از {{ pages() | faNumber }}</span>
        <button class="join-item btn btn-sm" [disabled]="page() >= pages()" (click)="pageChange.emit(page() + 1)">بعدی</button>
      </div>
    }
  `,
})
export class PaginationComponent {
  readonly count = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<number>();
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize())));
}
