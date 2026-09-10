import { Injectable, signal } from '@angular/core';

/**
 * Holds the short-lived access token in memory only (never localStorage — see
 * docs/04-api-design.md §2). A page reload recovers it via the refresh cookie.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly _access = signal<string | null>(null);
  readonly access = this._access.asReadonly();

  set(token: string): void {
    this._access.set(token);
  }

  clear(): void {
    this._access.set(null);
  }
}
