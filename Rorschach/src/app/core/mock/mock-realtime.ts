import { RealtimeEvent } from '@core/models';
import { Subject } from 'rxjs';

/** Stand-in for the Django Channels socket: handlers push, RealtimeService listens. */
export const mockRealtimeBus = new Subject<{ to: string; event: RealtimeEvent }>();

export function emitTo(userId: string, event: RealtimeEvent, delayMs = 0): void {
  setTimeout(() => mockRealtimeBus.next({ to: userId, event }), delayMs);
}
