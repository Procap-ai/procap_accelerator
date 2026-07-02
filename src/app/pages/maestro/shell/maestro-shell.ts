import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ThemeService } from '../../../services/theme.service';

/**
 * Persistent "Maestro" shell: branded sidebar, nav, theme toggle. Mirrors the Meridian
 * ObservatoryShell so the two products share the same design language. The theme tokens
 * (--bg/--panel/--accent/…) are declared on this component's :host and cascade down into the
 * routed child pages, so those pages only need their own scoped styles.
 */
@Component({
  selector: 'app-maestro-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../maestro.scss',
  template: `
  <div class="ms-shell">
    <aside class="ms-sidebar">
      <a class="ms-brand" routerLink="/maestro">
        <span class="logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="10.5" width="2.4" height="3" rx="1.2" fill="#38bdf8"/>
            <rect x="7.4" y="7" width="2.4" height="10" rx="1.2" fill="#38bdf8"/>
            <rect x="11.8" y="3.5" width="2.4" height="17" rx="1.2" fill="#38bdf8"/>
            <rect x="16.2" y="7" width="2.4" height="10" rx="1.2" fill="#38bdf8"/>
            <rect x="20.6" y="10.5" width="2.4" height="3" rx="1.2" fill="#38bdf8"/>
          </svg>
        </span>
        <span class="name">Maestro<small>Autonomous test runs, on demand.</small></span>
      </a>

      <nav class="nav-group">
        <a class="nav-link" routerLink="/maestro" routerLinkActive="active"
           [routerLinkActiveOptions]="{ exact: true }"><span class="ico">◎</span> Targets &amp; runs</a>
      </nav>

      <div class="nav-group-head">
        <span class="gico">✦</span> The suite
      </div>
      <nav class="nav-group">
        <a class="nav-link" routerLink="/quality"><span class="ico">⌘</span> Meridian</a>
        <a class="nav-link" routerLink="/"><span class="ico">←</span> Back to home</a>
      </nav>

      <div class="ms-foot">
        <button class="theme-toggle" (click)="theme.toggle()">
          <span>{{ theme.theme() === 'dark' ? '☾ Dark' : '☀ Light' }}</span>
          <span class="switch" [class.on]="theme.theme() === 'light'"></span>
        </button>
      </div>
    </aside>

    <main class="ms-main"><router-outlet></router-outlet></main>
  </div>`,
})
export class MaestroShellComponent {
  readonly theme = inject(ThemeService);
}
