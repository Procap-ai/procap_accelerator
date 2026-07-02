import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { ThemeService } from '../../../services/theme.service';

/** Persistent "Meridian" shell: branded header, collapsible persona-grouped sidebar, theme toggle. */
@Component({
  selector: 'app-observatory-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-shell">
    <aside class="obs-sidebar">
      <a class="obs-brand" routerLink="/quality">
        <span class="logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#6b5cf0" stroke-width="1.6"/>
            <line x1="12" y1="2.4" x2="12" y2="21.6" stroke="#6b5cf0" stroke-width="1.6"/>
            <circle cx="12" cy="12" r="2.7" fill="#6b5cf0"/>
          </svg>
        </span>
        <span class="name">Meridian<small>Govern every test. Assure every system.</small></span>
      </a>

      <!-- command center: the default landing / control surface -->
      <nav class="nav-group">
        <a class="nav-link" routerLink="/quality" routerLinkActive="active"
           [routerLinkActiveOptions]="{ exact: true }"><span class="ico">⌘</span> Command Center</a>
        <a class="nav-link" routerLink="/quality/agentic" routerLinkActive="active"
           ><span class="ico">✦</span> Agentic Test Gen &amp; Triage</a>
      </nav>

      <!-- group 1: Automation Quality Governance -->
      <div class="nav-group-head" (click)="g1 = !g1" [class.open]="g1">
        <span class="gico">◆</span> Automation Quality Governance <span class="chev">⌄</span>
      </div>
      <nav class="nav-group" *ngIf="g1">
        <div class="persona-label">Architect / Lead</div>
        <a class="nav-link" routerLink="/quality/fleet" routerLinkActive="active"><span class="ico">◎</span> Intelligent Maintenance</a>
        <a class="nav-link" routerLink="/quality/queue" routerLinkActive="active">
          <span class="ico">✓</span> Approval queue</a>
        <div class="persona-label">Exec leadership</div>
        <a class="nav-link" routerLink="/quality/adherence" routerLinkActive="active">
          <span class="ico">▟</span> Adherence &amp; adoption</a>
        <a class="nav-link" routerLink="/quality/savings" routerLinkActive="active">
          <span class="ico">∿</span> Savings and Forecast</a>
      </nav>

      <!-- group 2: System & Business Assurance -->
      <div class="nav-group-head green" (click)="g2 = !g2" [class.open]="g2">
        <span class="gico">⛨</span> System &amp; Business Assurance <span class="chev">⌄</span>
      </div>
      <nav class="nav-group" *ngIf="g2">
        <a class="nav-link" routerLink="/quality/assurance" routerLinkActive="active"
           [routerLinkActiveOptions]="{ exact: true }"><span class="ico">◍</span> Business Assurance Gaps</a>
        <a class="nav-link" routerLink="/quality/assurance/coverage" [queryParams]="{ tab: 'ac' }" routerLinkActive="active">
          <span class="ico">☑</span> AC criteria alignment</a>
        <a class="nav-link" routerLink="/quality/suite-prediction" routerLinkActive="active">
          <span class="ico">⤳</span> Intelligent Suite Prediction</a>
      </nav>

      <!-- group 3: Governance -->
      <nav class="nav-group">
        <div class="persona-label">Governance</div>
        <a class="nav-link" routerLink="/quality/config" routerLinkActive="active">
          <span class="ico">⚙</span> Configuration</a>
      </nav>

      <div class="obs-foot">
        <button class="theme-toggle" (click)="theme.toggle()">
          <span>{{ theme.theme() === 'dark' ? '☾ Dark' : '☀ Light' }}</span>
          <span class="switch" [class.on]="theme.theme() === 'light'"></span>
        </button>
        <a class="nav-link" routerLink="/"><span class="ico">←</span> Back to home</a>
      </div>
    </aside>

    <main class="obs-main"><router-outlet></router-outlet></main>
  </div>`,
})
export class ObservatoryShellComponent {
  readonly theme = inject(ThemeService);
  g1 = true;
  g2 = true;
}
