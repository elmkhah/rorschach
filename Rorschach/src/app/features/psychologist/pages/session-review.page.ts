import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AssessmentsApi } from '@core/api/assessments-api.service';
import { AssessmentResponse, ResponseCoding, RpasDomain, RpasVariable } from '@core/models';
import { codeString, reasonLabel } from '@core/rpas/rpas-codes';
import { ToastService } from '@core/services/toast.service';
import { FaNumberPipe, toFaDigits } from '@shared/pipes/fa-number.pipe';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';
import { LocationMarkerComponent } from '@shared/ui/location-marker.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { ResponseCodingFormComponent } from '../components/response-coding-form.component';

type Tab = 'protocol' | 'coding' | 'variables' | 'interpretation';

const DOMAINS: { key: RpasDomain; label: string }[] = [
  { key: 'ADMINISTRATION', label: 'اجرا و اعتبار پروتکل' },
  { key: 'ENGAGEMENT', label: 'درگیری و پردازش شناختی' },
  { key: 'PERCEPTION', label: 'مشکلات ادراک و تفکر' },
  { key: 'SELF_OTHER', label: 'بازنمایی خود و دیگری' },
  { key: 'STRESS', label: 'استرس و پریشانی' },
];

/** Psychologist view of a protocol: raw data, R-PAS coding, variables, tentative interpretation. */
@Component({
  selector: 'app-session-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    LoadingComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    LocationMarkerComponent,
    ResponseCodingFormComponent,
    JalaliDatePipe,
    FaNumberPipe,
  ],
  template: `
    @if (detail.isLoading() && !detail.value()) {
      <app-loading />
    } @else if (detail.error()) {
      <app-empty-state icon="lock" title="دسترسی به این آزمون ندارید" />
    } @else if (detail.value(); as d) {
      @let adm = d.session.administration;
      <a [routerLink]="['/psychologist/patients', d.session.patient_id]" class="btn btn-ghost btn-sm mb-4">
        <app-icon name="arrow-left" [size]="16" /> پرونده‌ی {{ d.session.patient_name }}
      </a>

      <div class="mb-5">
        <h1 class="text-2xl font-black">{{ d.session.test_name }} — {{ d.session.patient_name }}</h1>
        <div class="text-base-content/60 mt-1 flex flex-wrap items-center gap-3 text-sm">
          <app-status-badge [status]="d.session.status" />
          <span>روش: R-PAS</span>
          <span>نسخه‌ی آزمون: {{ d.session.test_version }}</span>
          @if (d.session.completed_at) {
            <span>تکمیل: {{ d.session.completed_at | jalaliDate: 'datetime' }}</span>
          }
        </div>
      </div>

      @if (d.session.status !== 'COMPLETED') {
        <div role="alert" class="alert alert-info alert-soft mb-5 text-sm">
          آزمون هنوز تکمیل نشده است؛ کدگذاری و تحلیل پس از ثبت نهایی توسط مراجع فعال می‌شود.
        </div>
      }

      <div role="tablist" class="tabs tabs-box mb-5 w-fit max-w-full overflow-x-auto">
        @for (t of tabs; track t.id) {
          <button role="tab" class="tab whitespace-nowrap" [class.tab-active]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
        }
      </div>

      @switch (tab()) {
        @case ('protocol') {
          <div class="mb-4 flex flex-wrap gap-2 text-sm" dir="ltr">
            <span class="badge badge-lg">R = {{ responses().length | faNumber }}</span>
            <span class="badge badge-lg" title="یادآوری">Pr = {{ adm.prompts | faNumber }}</span>
            <span class="badge badge-lg" title="برداشتن کارت">Pu = {{ adm.pulls | faNumber }}</span>
            <span class="badge badge-lg" title="چرخاندن کارت">CT = {{ adm.card_turns | faNumber }}</span>
            <span class="badge badge-lg" [class.badge-warning]="adm.interruptions > 0" title="وقفه در اجرا">
              Int = {{ adm.interruptions | faNumber }}
            </span>
            <span class="badge badge-lg" title="خروج از صفحه">Hidden = {{ adm.tab_hidden | faNumber }}</span>
          </div>
          <div class="space-y-3">
            @for (r of responses(); track r.id) {
              <div class="glass-card grid gap-4 rounded-box p-4 sm:grid-cols-[10rem_1fr]">
                <app-location-marker
                  [src]="cardImage(r.card_number)"
                  [marks]="r.clarification?.location_marks ?? []"
                  [whole]="!!r.clarification?.whole"
                  [locked]="true"
                />
                <div class="min-w-0 space-y-2">
                  <div class="text-base-content/60 flex flex-wrap items-center gap-2 text-xs">
                    <span class="badge badge-neutral badge-sm" dir="ltr">R{{ r.sequence }}</span>
                    کارت {{ r.card_number | faNumber }} · پاسخ {{ r.card_response_number | faNumber }}
                    @if (r.measurement_data.final_rotation) {
                      · چرخش {{ r.measurement_data.final_rotation | faNumber }}°
                    }
                  </div>
                  <p class="leading-7 font-bold">{{ r.response_text }}</p>
                  @if (r.clarification; as c) {
                    <p class="text-base-content/70 text-sm leading-7">
                      <span class="text-base-content/50">روشن‌سازی:</span> {{ c.text || '—' }}
                      @if (c.whole) {
                        <span class="badge badge-ghost badge-sm">کل کارت</span>
                      }
                    </p>
                    @if (c.reasons.length) {
                      <div class="flex flex-wrap items-center gap-1">
                        <span class="text-base-content/50 text-xs">دلیل‌ها:</span>
                        @for (x of c.reasons; track x) {
                          <span class="badge badge-soft badge-sm">{{ reasonText(x) }}</span>
                        }
                      </div>
                    }
                  } @else {
                    <p class="text-warning text-xs">روشن‌سازی ثبت نشده است.</p>
                  }
                  <div class="text-base-content/50 flex flex-wrap gap-x-4 text-xs">
                    <span>زمان واکنش: {{ seconds(r.measurement_data.reaction_time_ms) }}</span>
                    <span>مدت پاسخ: {{ seconds(r.duration_ms) }}</span>
                    <span>چرخاندن: {{ r.measurement_data.card_turns | faNumber }}</span>
                  </div>
                  @if (r.coding) {
                    <code class="bg-base-200 rounded-lg px-2 py-1 text-xs" dir="ltr">{{ code(r.coding) }}</code>
                  }
                </div>
              </div>
            } @empty {
              <div class="glass-card rounded-box"><app-empty-state icon="clipboard" title="پاسخی ثبت نشده است" /></div>
            }
          </div>
        }

        @case ('coding') {
          <div class="glass-card mb-4 flex flex-wrap items-center gap-4 rounded-box p-4 text-sm">
            <span class="font-bold">{{ codedCount() | faNumber }} از {{ responses().length | faNumber }} پاسخ کدگذاری شده</span>
            <progress class="progress w-48" [value]="codedCount()" [max]="responses().length || 1"></progress>
            <span class="text-base-content/60 text-xs">
              کدگذاری بر اساس دستورالعمل و جداول رسمی R-PAS (کیفیت فرم و پاسخ‌های رایج) انجام شود.
            </span>
          </div>
          @for (r of responses(); track r.id) {
            <div class="glass-card mb-3 rounded-box">
              <button type="button" class="flex w-full items-center gap-3 p-4 text-start" (click)="toggleOpen(r.id)">
                <span class="badge badge-neutral badge-sm" dir="ltr">R{{ r.sequence }}</span>
                <span class="text-base-content/50 text-xs whitespace-nowrap">کارت {{ r.card_number | faNumber }}</span>
                <span class="min-w-0 flex-1 truncate">{{ r.response_text }}</span>
                @if (r.coding) {
                  <code class="hidden text-xs sm:inline" dir="ltr">{{ code(r.coding) }}</code>
                } @else {
                  <span class="badge badge-warning badge-soft badge-sm">کدگذاری نشده</span>
                }
              </button>
              @if (openId() === r.id) {
                <div class="border-base-content/10 grid gap-5 border-t p-4 lg:grid-cols-[16rem_1fr]">
                  <div class="space-y-2">
                    <app-location-marker
                      [src]="cardImage(r.card_number)"
                      [marks]="r.clarification?.location_marks ?? []"
                      [whole]="!!r.clarification?.whole"
                      [locked]="true"
                    />
                    <p class="text-sm leading-7 font-bold">{{ r.response_text }}</p>
                    <p class="text-base-content/60 text-xs leading-6">{{ r.clarification?.text }}</p>
                    @if (r.clarification?.reasons?.length) {
                      <div class="space-y-1">
                        <div class="text-base-content/50 text-xs">دلیل‌های انتخابی مراجع (کد پیشنهادی):</div>
                        <div class="flex flex-wrap gap-1">
                          @for (x of r.clarification?.reasons; track x) {
                            <span class="badge badge-soft badge-sm">{{ reasonText(x, true) }}</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                  <app-response-coding-form [coding]="r.coding" [saving]="savingId() === r.id" (save)="saveCoding(r, $event)" />
                </div>
              }
            </div>
          }
        }

        @case ('variables') {
          @if (result(); as res) {
            <div class="grid gap-4 lg:grid-cols-2">
              @for (dm of domains; track dm.key) {
                <div class="glass-card rounded-box p-5">
                  <h2 class="mb-3 font-extrabold">{{ dm.label }}</h2>
                  <table class="table table-sm">
                    <tbody>
                      @for (v of res.variables[dm.key]; track v.key) {
                        <tr>
                          <td>
                            {{ v.label }}
                            @if (v.hint) {
                              <div class="text-base-content/50 text-[11px]">{{ v.hint }}</div>
                            }
                          </td>
                          <td class="text-end font-bold whitespace-nowrap">{{ fmt(v) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          } @else {
            <div class="glass-card rounded-box"><app-empty-state icon="activity" title="تحلیل هنوز آماده نشده است" /></div>
          }
        }

        @case ('interpretation') {
          @if (result(); as res) {
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span class="text-base-content/60 text-sm">
                الگوریتم: <span dir="ltr">{{ analysis()?.algorithm_version }}</span> ·
                {{ analysis()?.generated_at | jalaliDate: 'datetime' }}
              </span>
              <button class="btn btn-outline btn-sm" [disabled]="analyzing()" (click)="reanalyze()">
                @if (analyzing()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                محاسبه‌ی مجدد
              </button>
            </div>
            <div class="bg-accent text-accent-content mb-4 space-y-1 rounded-box p-5 text-sm leading-7">
              <div class="font-extrabold">تفسیر غیرقطعی</div>
              @for (c of res.caveats; track c) {
                <div class="flex gap-2"><app-icon name="info" [size]="16" class="mt-1.5 shrink-0" /> {{ c }}</div>
              }
            </div>
            <div class="space-y-3">
              @for (dm of domains; track dm.key) {
                <div class="glass-card rounded-box p-5">
                  <h2 class="mb-2 font-extrabold">{{ dm.label }}</h2>
                  @for (f of findingsOf(dm.key); track f.text) {
                    <div class="border-base-content/10 border-t py-3 first:border-t-0">
                      <p class="leading-7">{{ f.text }}</p>
                      <div class="mt-1 flex flex-wrap items-center gap-1.5">
                        <span class="badge badge-sm" [class.badge-secondary]="f.confidence === 'MODERATE'">
                          {{ f.confidence === 'MODERATE' ? 'اطمینان متوسط' : 'اطمینان پایین' }}
                        </span>
                        @for (b of f.basis; track b) {
                          <span class="badge badge-ghost badge-sm" dir="ltr">{{ b }}</span>
                        }
                      </div>
                    </div>
                  } @empty {
                    <p class="text-base-content/60 text-sm">بر اساس محاسبات خام، یافته‌ی قابل‌توجهی در این حوزه دیده نشد.</p>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="glass-card rounded-box"><app-empty-state icon="activity" title="تحلیل هنوز آماده نشده است" /></div>
          }
        }
      }
    }
  `,
})
export class SessionReviewPage {
  private readonly api = inject(AssessmentsApi);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'protocol', label: 'پروتکل و روشن‌سازی' },
    { id: 'coding', label: 'کدگذاری R-PAS' },
    { id: 'variables', label: 'متغیرهای محاسبه‌شده' },
    { id: 'interpretation', label: 'تفسیر غیرقطعی' },
  ];
  protected readonly domains = DOMAINS;
  protected readonly code = codeString;
  protected readonly reasonText = reasonLabel;
  protected readonly tab = signal<Tab>('protocol');
  protected readonly openId = signal<string | null>(null);
  protected readonly savingId = signal<string | null>(null);
  protected readonly analyzing = signal(false);

  protected readonly detail = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.detail(params),
  });
  protected readonly responses = linkedSignal(() => this.detail.value()?.responses ?? []);
  protected readonly analysis = linkedSignal(() => this.detail.value()?.analysis ?? null);
  protected readonly result = computed(() => this.analysis()?.calculated_data ?? null);
  protected readonly codedCount = computed(() => this.responses().filter((r) => r.coding).length);

  protected cardImage(cardNumber: number): string {
    return this.detail.value()?.cards.find((c) => c.card_number === cardNumber)?.image_url ?? '';
  }

  protected findingsOf(domain: RpasDomain) {
    return (this.result()?.findings ?? []).filter((f) => f.domain === domain);
  }

  protected toggleOpen(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  protected saveCoding(r: AssessmentResponse, coding: ResponseCoding): void {
    this.savingId.set(r.id);
    this.api.saveCoding(r.assessment_id, r.id, coding).subscribe({
      next: (saved) => {
        this.responses.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
        this.savingId.set(null);
        this.toast.success('کدگذاری ذخیره شد.');
        this.reanalyze();
      },
      error: () => this.savingId.set(null),
    });
  }

  protected reanalyze(): void {
    this.analyzing.set(true);
    this.api.analyze(this.id()).subscribe({
      next: (a) => {
        this.analysis.set(a);
        this.analyzing.set(false);
      },
      error: () => this.analyzing.set(false),
    });
  }

  protected seconds(ms: number | null | undefined): string {
    return typeof ms === 'number' ? `${toFaDigits((ms / 1000).toFixed(1))} ثانیه` : '—';
  }

  protected fmt(v: RpasVariable): string {
    if (v.value === null) return '—';
    switch (v.format) {
      case 'percent':
        return `${toFaDigits(Math.round(v.value * 100))}٪`;
      case 'ms':
        return this.seconds(v.value);
      case 'ratio':
        return toFaDigits(v.value.toFixed(2));
      default:
        return v.value.toLocaleString('fa-IR');
    }
  }
}
