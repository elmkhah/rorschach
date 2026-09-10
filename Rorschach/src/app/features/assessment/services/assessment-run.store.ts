import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { AssessmentsApi } from '@core/api/assessments-api.service';
import { AdministrationEvent, ApiErrorBody, ClarifyBody, RunStage, RunState, SubmitResponseBody } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { firstValueFrom, map, Observable, retry, tap, throwError, timer } from 'rxjs';
import { ResponseDrafts } from './response-drafts';

export const ACTIVE_STAGES: RunStage[] = ['RESPONSE', 'CLARIFICATION', 'REVIEW'];

/** Network / 5xx failures are retried; request bodies carry idempotency keys so retries are safe. */
function netRetry<T>() {
  return retry<T>({
    count: 3,
    delay: (err: unknown, attempt) =>
      err instanceof HttpErrorResponse && (err.status === 0 || err.status >= 500)
        ? timer(800 * attempt)
        : throwError(() => err),
  });
}

/**
 * Mirrors the backend RunState. The UI never decides the next step itself —
 * every transition is a request and the server's answer replaces local state.
 */
@Injectable()
export class AssessmentRunStore {
  private readonly api = inject(AssessmentsApi);
  private readonly drafts = inject(ResponseDrafts);
  private readonly toast = inject(ToastService);

  readonly state = signal<RunState | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** The R-PAS prompt was just given on the current card. */
  readonly promptShown = signal(false);
  readonly cpIntroSeen = signal(false);

  private sessionId = '';
  private lastHiddenAt = 0;

  async load(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.cpIntroSeen.set(this.readFlag('cp-intro'));
    this.loading.set(true);
    try {
      const s = await firstValueFrom(this.api.runState(sessionId).pipe(netRetry()));
      this.state.set(s);
      // Opening a test that is already under way means it was left mid-administration.
      if (ACTIVE_STAGES.includes(s.stage)) this.logEvent('INTERRUPTION');
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.loading.set(false);
    }
  }

  start(): Promise<boolean> {
    return this.run(() => this.api.start(this.sessionId));
  }

  submitResponse(body: SubmitResponseBody): Promise<boolean> {
    return this.run(() => this.api.submitResponse(this.sessionId, body).pipe(map((r) => r.state)));
  }

  next(): Promise<boolean> {
    return this.run(() =>
      this.api.next(this.sessionId).pipe(
        tap((r) => r.prompt && this.promptShown.set(true)),
        map((r) => r.state),
      ),
    );
  }

  clarify(body: ClarifyBody): Promise<boolean> {
    return this.run(() => this.api.clarify(this.sessionId, body));
  }

  async complete(): Promise<boolean> {
    const ok = await this.run(() => this.api.complete(this.sessionId));
    if (ok) this.drafts.clearSession(this.sessionId);
    return ok;
  }

  dismissCpIntro(): void {
    this.cpIntroSeen.set(true);
    this.writeFlag('cp-intro');
  }

  /** Administration observations — fire-and-forget. */
  logEvent(type: AdministrationEvent): void {
    if (type === 'TAB_HIDDEN') {
      if (Date.now() - this.lastHiddenAt < 5000) return;
      this.lastHiddenAt = Date.now();
    }
    this.api.logEvent(this.sessionId, type).subscribe({ error: () => undefined });
  }

  private async run(call: () => Observable<RunState>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set(null);
    try {
      const prev = this.state();
      const next = await firstValueFrom(call().pipe(netRetry()));
      if (next.card?.id !== prev?.card?.id || next.stage !== prev?.stage) this.promptShown.set(false);
      this.state.set(next);
      return true;
    } catch (e) {
      const msg = this.message(e);
      this.error.set(msg);
      // 0 / 403 / 5xx are already toasted by the global error interceptor.
      if (e instanceof HttpErrorResponse && [400, 404, 409].includes(e.status)) this.toast.error(msg);
      if (e instanceof HttpErrorResponse && e.status === 409) void this.refresh();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.state.set(await firstValueFrom(this.api.runState(this.sessionId)));
    } catch {
      /* keep current state */
    }
  }

  private message(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return 'ارتباط با سرور برقرار نشد. پاسخ شما محفوظ است؛ دوباره تلاش کنید.';
      return (e.error as ApiErrorBody | null)?.detail ?? 'درخواست با خطا مواجه شد.';
    }
    return 'خطای ناشناخته رخ داد.';
  }

  private readFlag(name: string): boolean {
    try {
      return sessionStorage.getItem(`rorschach.${name}.${this.sessionId}`) === '1';
    } catch {
      return false;
    }
  }

  private writeFlag(name: string): void {
    try {
      sessionStorage.setItem(`rorschach.${name}.${this.sessionId}`, '1');
    } catch {
      /* ignore */
    }
  }
}
