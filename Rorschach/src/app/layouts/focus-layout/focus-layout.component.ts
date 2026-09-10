import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LogoComponent } from '@shared/ui/logo.component';

/** Assessment focus mode: no sidebar, no notifications, no unrelated navigation. */
@Component({
  selector: 'app-focus-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, LogoComponent],
  host: { class: 'flex min-h-dvh flex-col' },
  template: `
    <header class="flex items-center justify-between px-4 py-3 lg:px-8">
      <app-logo [size]="32" />
      <span class="text-base-content/50 text-xs">حالت تمرکز</span>
    </header>
    <main class="flex flex-1 items-start justify-center px-4 pb-8 lg:items-center">
      <div class="w-full max-w-6xl">
        <router-outlet />
      </div>
    </main>
  `,
})
export class FocusLayoutComponent {}
