import { Injectable } from '@angular/core';
import { CardRotation } from '@core/models';

/** Unsubmitted response kept locally so a crash / network loss doesn't lose typing. */
export interface ResponseDraft {
  client_response_id: string;
  text: string;
  started_at: string;
  first_input_at: string | null;
  card_turns: number;
  rotation: CardRotation;
}

const PREFIX = 'rorschach.draft.';

@Injectable({ providedIn: 'root' })
export class ResponseDrafts {
  load(sessionId: string, cardId: string): ResponseDraft | null {
    try {
      const raw = localStorage.getItem(this.key(sessionId, cardId));
      return raw ? (JSON.parse(raw) as ResponseDraft) : null;
    } catch {
      return null;
    }
  }

  save(sessionId: string, cardId: string, draft: ResponseDraft): void {
    try {
      localStorage.setItem(this.key(sessionId, cardId), JSON.stringify(draft));
    } catch {
      /* storage unavailable — draft stays in memory */
    }
  }

  clear(sessionId: string, cardId: string): void {
    try {
      localStorage.removeItem(this.key(sessionId, cardId));
    } catch {
      /* ignore */
    }
  }

  clearSession(sessionId: string): void {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`${PREFIX}${sessionId}.`))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }

  private key(sessionId: string, cardId: string): string {
    return `${PREFIX}${sessionId}.${cardId}`;
  }
}
