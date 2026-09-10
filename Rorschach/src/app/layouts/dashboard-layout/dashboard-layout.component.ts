import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { AvatarComponent } from '@shared/ui/avatar.component';
import { IconComponent } from '@shared/ui/icon.component';
import { LogoComponent } from '@shared/ui/logo.component';
import { StatusBadgeComponent } from '@shared/ui/status-badge.component';
import { NAV, ROLE_BASE } from './nav.config';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'روز بخیر';
  return 'عصر بخیر';
}

/** Floating glass sidebar + header on desktop; glass bottom dock on mobile. */
@Component({
  selector: 'app-dashboard-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, LogoComponent, AvatarComponent, StatusBadgeComponent],
  template: `
    <div class="drawer lg:drawer-open">
      <input id="app-drawer" type="checkbox" class="drawer-toggle" [checked]="drawerOpen()" (change)="toggle($event)" />

      <div class="drawer-content flex min-h-dvh flex-col">
        <header class="sticky top-0 z-30 px-3 pt-3 lg:px-6">
          <div class="glass-card flex items-center gap-2 rounded-full py-2 ps-2 pe-2 lg:ps-5">
            <label for="app-drawer" class="btn btn-ghost btn-circle btn-sm lg:hidden" aria-label="منو">
              <app-icon name="menu" />
            </label>
            <div class="min-w-0 flex-1">
              <div class="text-base-content/50 text-xs">{{ greeting }}</div>
              <div class="truncate font-extrabold">{{ auth.displayName() }}</div>
            </div>

            <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="btn btn-ghost btn-circle" aria-label="حساب کاربری">
                <app-avatar [name]="auth.displayName()" [src]="avatar()" size="sm" />
              </div>
              <ul tabindex="0" class="dropdown-content menu glass-card z-40 mt-2 w-52 rounded-box p-2">
                @if (role() !== 'ADMIN') {
                  <li><a [routerLink]="base() + '/profile'" class="rounded-full"><app-icon name="user" [size]="16" /> پروفایل</a></li>
                }
                <li><button class="text-error rounded-full" (click)="auth.logout()"><app-icon name="logout" [size]="16" /> خروج</button></li>
              </ul>
            </div>
          </div>
        </header>

        <main class="flex-1 px-3 pt-5 pb-28 lg:px-6 lg:pb-8">
          <div class="mx-auto max-w-6xl">
            <router-outlet />
          </div>
        </main>

        <nav class="dock dock-md glass-card z-30 rounded-t-[1.5rem] lg:hidden" aria-label="ناوبری اصلی">
          @for (item of dockItems(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="dock-active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
              <app-icon [name]="item.icon" />
              <span class="dock-label">{{ item.label }}</span>
            </a>
          }
        </nav>
      </div>

      <div class="drawer-side z-40">
        <label for="app-drawer" class="drawer-overlay" aria-label="بستن منو"></label>
        <aside class="flex min-h-full w-72 flex-col p-3">
          <div class="glass-card flex flex-1 flex-col rounded-box p-4">
            <a routerLink="/" class="mb-6 px-2 pt-1"><app-logo /></a>
            <ul class="menu w-full gap-1 p-0">
              @for (item of items(); track item.path) {
                <li>
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="menu-active"
                    [routerLinkActiveOptions]="{ exact: !!item.exact }"
                    class="rounded-full px-4 py-2.5"
                    (click)="drawerOpen.set(false)"
                  >
                    <app-icon [name]="item.icon" [size]="18" />
                    {{ item.label }}
                  </a>
                </li>
              }
            </ul>
            <div class="bg-base-100/70 mt-auto flex items-center gap-3 rounded-full p-2 pe-3">
              <app-avatar [name]="auth.displayName()" [src]="avatar()" size="sm" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-bold">{{ auth.displayName() }}</div>
                <app-status-badge [status]="role()" />
              </div>
              <button class="btn btn-ghost btn-circle btn-sm" (click)="auth.logout()" aria-label="خروج">
                <app-icon name="logout" [size]="18" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class DashboardLayoutComponent {
  protected readonly auth = inject(AuthService);
  protected readonly greeting = greeting();
  protected readonly drawerOpen = signal(false);

  protected readonly role = computed(() => this.auth.role() ?? 'PATIENT');
  protected readonly base = computed(() => ROLE_BASE[this.role()]);
  protected readonly items = computed(() => NAV[this.role()]);
  protected readonly dockItems = computed(() => this.items().filter((i) => i.dock).slice(0, 5));
  protected readonly avatar = computed(() => this.auth.profile()?.avatar ?? null);

  protected toggle(e: Event): void {
    this.drawerOpen.set((e.target as HTMLInputElement).checked);
  }
}
