import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '@env/environment';
import { Me } from '@core/models';
import {
  catchError,
  finalize,
  firstValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from './auth.models';
import { TokenStore } from './token-store';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly _me = signal<Me | null>(null);
  private refreshInFlight: Observable<string> | null = null;

  readonly me = this._me.asReadonly();
  readonly user = computed(() => this._me()?.user ?? null);
  readonly role = computed(() => this.user()?.role ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly profile = computed(() => {
    const me = this._me();
    return me?.patient_profile ?? me?.psychologist_profile ?? null;
  });
  readonly displayName = computed(() => {
    const p = this.profile();
    if (p) return `${p.first_name} ${p.last_name}`;
    return this.role() === 'ADMIN' ? 'مدیر سامانه' : (this.user()?.email ?? '');
  });
  readonly verificationStatus = computed(
    () => this._me()?.psychologist_profile?.verification_status ?? null,
  );

  login(body: LoginRequest): Observable<Me> {
    return this.http
      .post<AuthResponse>(`${this.base}/login/`, body, { withCredentials: true })
      .pipe(
        tap((r) => this.setSession(r)),
        map((r) => r.me),
      );
  }

  register(body: RegisterRequest): Observable<Me> {
    return this.http
      .post<AuthResponse>(`${this.base}/register/`, body, { withCredentials: true })
      .pipe(
        tap((r) => this.setSession(r)),
        map((r) => r.me),
      );
  }

  /** Single in-flight refresh shared by all concurrent 401s. */
  refresh(): Observable<string> {
    this.refreshInFlight ??= this.http
      .post<{ access: string }>(`${this.base}/refresh/`, {}, { withCredentials: true })
      .pipe(
        map((r) => r.access),
        tap((t) => this.tokens.set(t)),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  /** Called once at bootstrap: silently restore the session from the refresh cookie. */
  restoreSession(): Promise<void> {
    return firstValueFrom(
      this.refresh().pipe(
        switchMap(() => this.http.get<Me>(`${this.base}/me/`)),
        tap((me) => this._me.set(me)),
        map(() => undefined),
        catchError(() => {
          this.clear();
          return of(undefined);
        }),
      ),
    );
  }

  reloadMe(): Observable<Me> {
    return this.http.get<Me>(`${this.base}/me/`).pipe(tap((me) => this._me.set(me)));
  }

  setMe(me: Me): void {
    this._me.set(me);
  }

  logout(): void {
    this.http
      .post(`${this.base}/logout/`, {}, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe();
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  /** Session is unrecoverable (refresh failed). */
  expire(): void {
    this.clear();
    void this.router.navigate(['/login'], { queryParams: { expired: 1 } });
  }

  homeUrl(): string {
    return homeUrlFor(this._me());
  }

  private setSession(r: AuthResponse): void {
    this.tokens.set(r.access);
    this._me.set(r.me);
  }

  private clear(): void {
    this.tokens.clear();
    this._me.set(null);
  }
}

export function homeUrlFor(me: Me | null): string {
  if (!me) return '/login';
  switch (me.user.role) {
    case 'ADMIN':
      return '/admin';
    case 'PSYCHOLOGIST':
      return me.psychologist_profile?.verification_status === 'APPROVED'
        ? '/psychologist'
        : '/verification-pending';
    case 'PATIENT':
      return '/patient';
  }
}
