import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/** Persistent dark "Observatory" shell: persona-grouped sidebar + routed content. */
@Component({
  selector: 'app-observatory-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-shell">
    <aside class="obs-sidebar">
      <a class="obs-brand" routerLink="/quality">
        <span class="logo">P</span>
        <span class="name">Observatory<small>Procap Quality</small></span>
      </a>

      <nav class="nav-group">
        <div class="persona-label">Architect / Lead</div>
        <a class="nav-link" routerLink="/quality" routerLinkActive="active"
           [routerLinkActiveOptions]="{ exact: true }"><span class="ico">◎</span> Fleet quality</a>
        <a class="nav-link" routerLink="/quality/queue" routerLinkActive="active">
          <span class="ico">✓</span> Approval queue</a>
      </nav>

      <nav class="nav-group">
        <div class="persona-label">Exec leadership</div>
        <a class="nav-link" routerLink="/quality/adherence" routerLinkActive="active">
          <span class="ico">▟</span> Adherence &amp; adoption</a>
        <a class="nav-link" routerLink="/quality/savings" routerLinkActive="active">
          <span class="ico">$</span> Cumulative savings</a>
      </nav>

      <nav class="nav-group">
        <div class="persona-label">Procap</div>
        <a class="nav-link" routerLink="/"><span class="ico">←</span> Back to home</a>
      </nav>
    </aside>

    <main class="obs-main"><router-outlet></router-outlet></main>
  </div>`,
})
export class ObservatoryShellComponent {}
