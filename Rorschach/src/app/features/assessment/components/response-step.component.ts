import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CardRotation, RunState } from '@core/models';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { uuid } from '@shared/utils/uuid';
import { AssessmentRunStore } from '../services/assessment-run.store';
import { ResponseDraft, ResponseDrafts } from '../services/response-drafts';
import { InkblotCardComponent } from './inkblot-card.component';

// Standard R-PAS administration wording. The pull is only used if a card sets max_responses.
const PROMPT_TEXT = 'یادتان باشد، ما برای هر کارت دو یا شاید سه پاسخ می‌خواهیم.';
const PULL_TEXT = 'خوب است، کافی است. برویم سراغ کارت بعدی.';

/** Response Phase: one card, the standard question, free responses — nothing else. */
@Component({
  selector: 'app-response-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InkblotCardComponent, IconComponent, FaNumberPipe],
  template: `
    @let s = state();
    <div class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div class="glass-card rounded-box p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="font-extrabold">کارت {{ s.card_index | faNumber }} از {{ s.total_cards | faNumber }}</span>
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="store.busy()" (click)="rotate()">
            <app-icon name="rotate" [size]="16" /> چرخاندن کارت
          </button>
        </div>
        <app-inkblot-card [src]="s.card?.image_url ?? null" [rotation]="rotation()" />
        <progress class="progress mt-4 w-full" [value]="s.card_index - 1" [max]="s.total_cards"></progress>
      </div>

      <div class="glass-card flex flex-col gap-3 rounded-box p-5">
        <h2 class="text-2xl font-black">این چه چیزی می‌تواند باشد؟</h2>

        @for (r of s.card_responses; track r.id; let i = $index) {
          <div class="bg-base-100/70 rounded-2xl p-3">
            <div class="text-base-content/50 text-xs">پاسخ {{ i + 1 | faNumber }}</div>
            <p class="leading-7 whitespace-pre-line">{{ r.response_text }}</p>
          </div>
        }

        @if (s.pulled) {
          <div role="status" class="bg-accent text-accent-content rounded-2xl p-4 leading-7">{{ pullText }}</div>
        } @else {
          @if (store.promptShown()) {
            <div role="status" class="bg-accent text-accent-content rounded-2xl p-4 leading-7">{{ promptText }}</div>
          }
          <label class="flex flex-col gap-1.5">
            <span class="text-base-content/50 text-xs">پاسخ {{ s.card_responses.length + 1 | faNumber }}</span>
            <input
              #box
              type="text"
              class="input input-lg w-full"
              autocomplete="off"
              [value]="draftText()"
              [disabled]="store.busy()"
              (input)="onInput(box.value)"
              (keydown.enter)="$event.preventDefault(); addAnother()"
            />
          </label>
          <button type="button" class="btn btn-outline btn-sm w-fit" [disabled]="!draftText().trim() || store.busy()" (click)="addAnother()">
            <app-icon name="plus" [size]="16" /> پاسخ دیگر
          </button>
        }

        <div class="mt-auto flex justify-end pt-2">
          <button class="btn btn-primary" [disabled]="store.busy() || (!s.card_responses.length && !draftText().trim())" (click)="next()">
            @if (store.busy()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            {{ s.card_index === s.total_cards ? 'پایان مرحله‌ی اول' : 'کارت بعدی' }}
            <app-icon name="chevron-right" [size]="14" />
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ResponseStepComponent {
  readonly state = input.required<RunState>();
  protected readonly store = inject(AssessmentRunStore);
  private readonly drafts = inject(ResponseDrafts);

  protected readonly promptText = PROMPT_TEXT;
  protected readonly pullText = PULL_TEXT;
  protected readonly rotation = signal<CardRotation>(0);
  protected readonly draftText = signal('');
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  private cardId: string | null = null;
  private draft!: ResponseDraft;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // New card → fresh orientation and draft (or the locally saved one after a crash).
    effect(() => {
      const cardId = this.state().card?.id ?? null;
      untracked(() => {
        if (cardId === this.cardId) return;
        this.cardId = cardId;
        const saved = cardId ? this.drafts.load(this.sessionId, cardId) : null;
        this.rotation.set(saved?.rotation ?? 0);
        this.draft = saved ?? this.newDraft();
        this.draftText.set(this.draft.text);
      });
    });
  }

  private get sessionId(): string {
    return this.state().session.id;
  }

  protected onInput(text: string): void {
    if (!this.draft.first_input_at && text) this.draft.first_input_at = new Date().toISOString();
    this.draft.text = text;
    this.draftText.set(text);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 600);
  }

  protected rotate(): void {
    this.rotation.update((r) => ((r + 90) % 360) as CardRotation);
    this.draft.card_turns++;
    this.draft.rotation = this.rotation();
    this.persist();
  }

  protected async addAnother(): Promise<void> {
    if (!this.draftText().trim()) return;
    if (await this.submitDraft()) {
      this.resetDraft();
      setTimeout(() => this.box()?.nativeElement.focus());
    }
  }

  protected async next(): Promise<void> {
    if (this.draftText().trim()) {
      if (!(await this.submitDraft())) return;
      this.resetDraft();
    }
    await this.store.next();
  }

  private async submitDraft(): Promise<boolean> {
    const d = this.draft;
    const card = this.state().card;
    if (!card) return false;
    const now = new Date();
    const ok = await this.store.submitResponse({
      client_response_id: d.client_response_id,
      card_id: card.id,
      response_text: d.text.trim(),
      client_started_at: d.started_at,
      client_submitted_at: now.toISOString(),
      measurements: {
        reaction_time_ms: d.first_input_at ? Date.parse(d.first_input_at) - Date.parse(d.started_at) : null,
        card_turns: d.card_turns,
        final_rotation: this.rotation(),
      },
    });
    if (ok) this.drafts.clear(this.sessionId, card.id);
    return ok;
  }

  private resetDraft(): void {
    this.draft = this.newDraft();
    this.draftText.set('');
  }

  private newDraft(): ResponseDraft {
    return {
      client_response_id: uuid(),
      text: '',
      started_at: new Date().toISOString(),
      first_input_at: null,
      card_turns: 0,
      rotation: this.rotation(),
    };
  }

  private persist(): void {
    if (this.cardId) this.drafts.save(this.sessionId, this.cardId, this.draft);
  }
}
