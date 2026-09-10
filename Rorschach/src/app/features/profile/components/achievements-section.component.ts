import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PsychologistsApi } from '@core/api/psychologists-api.service';
import { PsychologistAchievement } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { FormFieldComponent } from '@shared/ui/form-field.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { applyServerErrors } from '@shared/utils/forms';

const THIS_YEAR = new Date().getFullYear();

/** Psychologist profile: achievements & credentials shown on the public profile. */
@Component({
  selector: 'app-achievements-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldComponent, IconComponent, EmptyStateComponent, LoadingComponent, FaNumberPipe],
  template: `
    <div class="card glass-card">
      <div class="card-body">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="card-title text-lg font-extrabold">افتخارات و مدارک</h2>
            <p class="text-base-content/60 text-sm">این موارد در پروفایل عمومی شما به مراجعان نمایش داده می‌شود.</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" (click)="adding.set(!adding())">
            <app-icon [name]="adding() ? 'x' : 'plus'" [size]="16" /> {{ adding() ? 'انصراف' : 'افزودن مورد' }}
          </button>
        </div>

        @if (adding()) {
          <form class="bg-base-100/60 mt-2 grid gap-x-4 rounded-2xl p-4 sm:grid-cols-2" [formGroup]="form" (ngSubmit)="add()">
            <app-form-field label="عنوان" [control]="form.controls.title">
              <input class="input w-full" formControlName="title" placeholder="مثلاً دکترای روان‌شناسی بالینی" />
            </app-form-field>
            <app-form-field label="مرجع صادرکننده" [control]="form.controls.issuer">
              <input class="input w-full" formControlName="issuer" />
            </app-form-field>
            <app-form-field label="سال (میلادی)" [control]="form.controls.year">
              <input class="input w-full" type="number" formControlName="year" />
            </app-form-field>
            <app-form-field label="توضیحات" [optional]="true" [control]="form.controls.description">
              <input class="input w-full" formControlName="description" />
            </app-form-field>
            <div class="flex justify-end sm:col-span-2">
              <button class="btn btn-primary btn-sm mt-2" [disabled]="saving()">ذخیره</button>
            </div>
          </form>
        }

        @if (items.isLoading() && !items.value()) {
          <app-loading />
        } @else {
          <ul class="divide-base-content/10 divide-y">
            @for (a of items.value() ?? []; track a.id) {
              <li class="flex items-start gap-4 py-3">
                <div class="bg-accent text-accent-content grid size-10 shrink-0 place-items-center rounded-full">
                  <app-icon name="award" [size]="18" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-bold">{{ a.title }}</div>
                  <div class="text-base-content/60 text-sm">{{ a.issuer }} · {{ a.year.toString() | faNumber }}</div>
                  @if (a.description) {
                    <p class="text-base-content/70 mt-1 text-sm">{{ a.description }}</p>
                  }
                </div>
                <button class="btn btn-ghost btn-square btn-sm text-error" (click)="remove(a)" aria-label="حذف">
                  <app-icon name="trash" [size]="16" />
                </button>
              </li>
            } @empty {
              <app-empty-state icon="award" title="موردی ثبت نشده است" />
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class AchievementsSectionComponent {
  private readonly api = inject(PsychologistsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly items = rxResource({ stream: () => this.api.myAchievements() });
  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', Validators.required],
    issuer: ['', Validators.required],
    year: [THIS_YEAR, [Validators.required, Validators.min(1950), Validators.max(THIS_YEAR)]],
    description: [''],
  });

  protected add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.addAchievement(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.adding.set(false);
        this.form.reset();
        this.toast.success('افزوده شد.');
        this.items.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(applyServerErrors(this.form, err));
      },
    });
  }

  protected async remove(a: PsychologistAchievement): Promise<void> {
    const ok = await this.confirm.confirm({ title: 'حذف مورد', message: `«${a.title}» حذف شود؟`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    this.api.deleteAchievement(a.id).subscribe(() => this.items.reload());
  }
}
