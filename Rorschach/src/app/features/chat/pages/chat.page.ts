import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChatApi } from '@core/api/communication-api.service';
import { AuthService } from '@core/auth/auth.service';
import { Conversation, Message } from '@core/models';
import { RealtimeService } from '@core/services/realtime.service';
import { ROLE_BASE } from '@layouts/dashboard-layout/nav.config';
import { JalaliDatePipe } from '@shared/pipes/jalali-date.pipe';
import { RelativeTimePipe } from '@shared/pipes/relative-time.pipe';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { EmptyStateComponent } from '@shared/ui/empty-state.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LoadingComponent } from '@shared/ui/loading.component';

@Component({
  selector: 'app-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, IconComponent, EmptyStateComponent, LoadingComponent, RelativeTimePipe, JalaliDatePipe],
  template: `
    <div class="card glass-card grid h-[calc(100dvh-12rem)] min-h-[28rem] overflow-hidden lg:h-[calc(100dvh-8rem)] lg:grid-cols-[20rem_1fr]">
      <!-- Conversation list -->
      <aside class="border-base-200 flex min-h-0 flex-col border-e" [class.hidden]="!!conversationId()" [class.lg:flex]="true">
        <div class="border-base-200 border-b p-4 font-bold">گفت‌وگوها</div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          @if (conversations.isLoading() && !list().length) {
            <app-loading />
          }
          @for (c of list(); track c.id) {
            <a
              [routerLink]="[base(), c.id]"
              class="hover:bg-base-200 flex items-center gap-3 p-3"
              [class.bg-base-200]="c.id === conversationId()"
            >
              <app-avatar [name]="c.peer.name" size="sm" [online]="c.peer.is_online" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm font-medium">{{ c.peer.name }}</span>
                  <span class="text-base-content/50 shrink-0 text-[11px]">{{ c.last_message?.created_at | relativeTime }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-base-content/60 flex-1 truncate text-xs">{{ c.last_message?.content ?? 'بدون پیام' }}</span>
                  @if (c.unread_count) {
                    <span class="badge badge-primary badge-xs">{{ c.unread_count }}</span>
                  }
                </div>
              </div>
            </a>
          } @empty {
            @if (!conversations.isLoading()) {
              <app-empty-state icon="message" title="گفت‌وگویی ندارید" message="پس از برقراری ارتباط فعال با روان‌شناس، گفت‌وگو ایجاد می‌شود." />
            }
          }
        </div>
      </aside>

      <!-- Thread -->
      <section class="flex min-h-0 flex-col" [class.hidden]="!conversationId()" [class.lg:flex]="true">
        @if (active(); as c) {
          <header class="border-base-200 flex items-center gap-3 border-b p-3">
            <a [routerLink]="base()" class="btn btn-ghost btn-square btn-sm lg:hidden" aria-label="بازگشت">
              <app-icon name="arrow-left" [size]="18" />
            </a>
            <app-avatar [name]="c.peer.name" size="sm" [online]="c.peer.is_online" />
            <div>
              <div class="text-sm font-semibold">{{ c.peer.name }}</div>
              <div class="text-base-content/60 text-xs">
                {{ typing() ? 'در حال نوشتن…' : c.peer.is_online ? 'آنلاین' : 'آفلاین' }}
              </div>
            </div>
          </header>

          <div #scroller class="bg-base-200/40 min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
            @for (m of messages(); track m.id) {
              <div class="chat" [class.chat-start]="m.sender_id === me()" [class.chat-end]="m.sender_id !== me()">
                <div
                  class="chat-bubble text-sm"
                  [class.chat-bubble-primary]="m.sender_id === me()"
                  [title]="m.created_at | jalaliDate: 'datetime'"
                >
                  {{ m.content }}
                </div>
                <div class="chat-footer text-[11px] opacity-50">
                  {{ m.created_at | jalaliDate: 'time' }}
                  @if (m.sender_id === me() && m.read_at) {
                    · خوانده شد
                  }
                </div>
              </div>
            }
          </div>

          <form class="border-base-200 flex gap-2 border-t p-3" (submit)="send($event)">
            <input
              #box
              class="input flex-1"
              placeholder="پیام خود را بنویسید…"
              [value]="draft()"
              (input)="draft.set(box.value)"
              maxlength="2000"
            />
            <button class="btn btn-primary btn-square" [disabled]="!draft().trim() || sending()" aria-label="ارسال">
              <app-icon name="send" [size]="18" />
            </button>
          </form>
        } @else {
          <app-empty-state class="m-auto" icon="message" title="یک گفت‌وگو را انتخاب کنید" />
        }
      </section>
    </div>
  `,
})
export class ChatPage {
  private readonly api = inject(ChatApi);
  private readonly auth = inject(AuthService);

  /** Route param (optional). */
  readonly conversationId = input<string>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly me = computed(() => this.auth.user()?.id);
  protected readonly base = computed(() => `${ROLE_BASE[this.auth.role() ?? 'PATIENT']}/chat`);

  protected readonly conversations = rxResource({ stream: () => this.api.conversations() });
  protected readonly list = signal<Conversation[]>([]);
  protected readonly messages = signal<Message[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly typing = signal(false);
  protected readonly active = computed(() => this.list().find((c) => c.id === this.conversationId()) ?? null);
  private typingTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const value = this.conversations.value();
      if (value) this.list.set(value);
    });

    // Load thread whenever the selected conversation changes.
    effect((onCleanup) => {
      const id = this.conversationId();
      this.messages.set([]);
      if (!id) return;
      const sub = this.api.messages(id).subscribe((msgs) => {
        this.messages.set(msgs);
        this.scrollToEnd();
        this.api.markRead(id).subscribe();
        this.patchConversation(id, { unread_count: 0 });
      });
      onCleanup(() => sub.unsubscribe());
    });

    inject(RealtimeService)
      .events$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((e) => {
        if (e.type === 'message.new') this.receive(e.message);
        else if (e.type === 'typing' && e.conversation_id === this.conversationId()) this.showTyping();
        else if (e.type === 'message.read' && e.conversation_id === this.conversationId()) {
          this.messages.update((list) => list.map((m) => (m.sender_id === this.me() && !m.read_at ? { ...m, read_at: e.read_at } : m)));
        }
      });
  }

  protected send(event: Event): void {
    event.preventDefault();
    const id = this.conversationId();
    const content = this.draft().trim();
    if (!id || !content) return;
    this.sending.set(true);
    this.api.send(id, content).subscribe({
      next: (m) => {
        this.draft.set('');
        this.sending.set(false);
        this.append(m);
        this.patchConversation(id, { last_message: m, updated_at: m.created_at });
      },
      error: () => this.sending.set(false),
    });
  }

  private receive(m: Message): void {
    const isOpen = m.conversation_id === this.conversationId();
    if (isOpen) {
      this.typing.set(false);
      this.append(m);
      this.api.markRead(m.conversation_id).subscribe();
    }
    const current = this.list().find((c) => c.id === m.conversation_id);
    this.patchConversation(m.conversation_id, {
      last_message: m,
      updated_at: m.created_at,
      unread_count: isOpen ? 0 : (current?.unread_count ?? 0) + 1,
    });
  }

  private append(m: Message): void {
    this.messages.update((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    this.scrollToEnd();
  }

  private patchConversation(id: string, patch: Partial<Conversation>): void {
    this.list.update((list) =>
      list
        .map((c) => (c.id === id ? { ...c, ...patch } : c))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    );
  }

  private showTyping(): void {
    this.typing.set(true);
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.typing.set(false), 3000);
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
