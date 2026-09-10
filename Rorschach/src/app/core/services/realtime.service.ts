import { inject, Injectable } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { TokenStore } from '@core/auth/token-store';
import { mockRealtimeBus } from '@core/mock/mock-realtime';
import { RealtimeEvent } from '@core/models';
import { environment } from '@env/environment';
import { defer, filter, map, Observable, retry, share } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

type ClientFrame = { type: 'auth'; token: string } | { type: 'typing'; conversation_id: string };

/**
 * Single realtime channel (Django Channels in production, an in-memory bus in
 * mock mode). Consumers filter `events$` by `type`.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(TokenStore);
  private socket: WebSocketSubject<RealtimeEvent | ClientFrame> | null = null;

  readonly events$: Observable<RealtimeEvent> = environment.useMock
    ? mockRealtimeBus.pipe(
        filter((e) => e.to === this.auth.user()?.id),
        map((e) => e.event),
        share(),
      )
    : defer(() => this.connect()).pipe(retry({ delay: 3000 }), share());

  sendTyping(conversationId: string): void {
    this.socket?.next({ type: 'typing', conversation_id: conversationId });
  }

  private connect(): Observable<RealtimeEvent> {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = webSocket<RealtimeEvent | ClientFrame>({
      url: `${proto}://${location.host}${environment.wsBaseUrl}/`,
      openObserver: {
        // Authenticate over the socket rather than putting the token in the URL.
        next: () => this.socket?.next({ type: 'auth', token: this.tokens.access() ?? '' }),
      },
    });
    return this.socket as Observable<RealtimeEvent>;
  }
}
