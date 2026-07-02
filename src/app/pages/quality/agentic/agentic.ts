import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Meridian → Agentic Test Generation & Triage (powered by Maestro).
 *
 * Embeds the standalone Maestro product's signature views inside the Meridian observatory: the live
 * run pipeline + filmstrip, the ranked test-candidate dashboard, and the triaged-bug feed. This is a
 * high-level proto surface (representative data); "Open in Maestro" jumps to the full product (/maestro).
 *
 * When Maestro is enabled for an app its suite is FULLY AUTO-MANAGED (explore → generate → run →
 * self-heal → triage), so Meridian's manual authoring/curation steps are paused — surfaced here as a
 * banner. Wiring that pause across the other Meridian pages is a follow-up.
 */
interface Repo { name: string; framework: string; branch: string; tests: number; managed: boolean; }
interface Candidate { title: string; area: string; score: number; confidence: number; tier: string; below?: boolean; }
interface Bug { title: string; severity: 'high' | 'medium'; page: string; expected: string; actual: string; }
interface Stage { name: string; icon: string; note: string; }
interface Frame { label: string; fail?: boolean; }

@Component({
  selector: 'app-agentic',
  standalone: true,
  imports: [CommonModule, RouterModule],
  // Theme tokens (--bg/--panel/--accent/…) cascade from the ObservatoryShell's :host, so this page
  // only needs its own scoped styles — no need to inline the whole shared quality.scss.
  styleUrl: './agentic.scss',
  template: `
  <div class="ag">
    <!-- header -->
    <header class="ag-head">
      <div>
        <h1>Agentic Test Generation &amp; Triage <span class="ag-power">powered by Maestro</span></h1>
        <p class="ag-sub">An AI agent explores the app, writes a full Playwright suite, runs it in the cloud,
          heals its own flaky tests and files only the real bugs — as an integrated Meridian capability
          or the standalone <a routerLink="/maestro">Maestro</a> product.</p>
      </div>
      <div class="ag-head-acts">
        <button class="ag-switch" [class.on]="enabled" (click)="enabled = !enabled"
          [attr.aria-pressed]="enabled"><span class="knob"></span>{{ enabled ? 'Auto-managed' : 'Enable Maestro' }}</button>
        <a class="ag-open" routerLink="/maestro">Open in Maestro →</a>
      </div>
    </header>

    <!-- auto-managed banner -->
    <div class="ag-banner" *ngIf="enabled">
      <span class="ag-dot"></span>
      This app's suite is <strong>fully auto-managed by Maestro</strong>. Manual crawl-and-author and
      test-editing steps in Meridian are paused to avoid clashing with the automation.
    </div>

    <ng-container *ngIf="enabled; else off">
      <!-- KPIs -->
      <div class="ag-kpis">
        <div class="ag-kpi" *ngFor="let k of kpis"><span class="n">{{ k.n }}</span><span class="l">{{ k.l }}</span></div>
      </div>

      <!-- connected repositories: Selenium/Playwright repos Maestro auto-manages -->
      <section class="ag-card">
        <div class="ag-card-head"><h2>Connected repositories</h2>
          <span class="ag-muted">converted to standard Playwright on a branch</span></div>
        <ul class="ag-repos">
          <li class="ag-repo" *ngFor="let r of repos">
            <span class="ag-repo-ico">📦</span>
            <div class="ag-repo-body">
              <div class="ag-repo-top">
                <span class="ag-repo-name">{{ r.name }}</span>
                <span class="ag-repo-fw">from {{ r.framework }}</span>
                <span class="ag-repo-tests">{{ r.tests }} tests</span>
              </div>
              <span class="ag-repo-branch">🔀 {{ r.branch }}</span>
            </div>
            <div class="ag-repo-acts">
              <button class="ag-switch sm" [class.on]="r.managed" (click)="r.managed = !r.managed"
                [attr.aria-pressed]="r.managed"><span class="knob"></span>{{ r.managed ? 'Auto-managed' : 'Enable' }}</button>
              <a class="ag-open sm" routerLink="/maestro">Open in Maestro →</a>
            </div>
          </li>
        </ul>
        <p class="ag-repo-note">When a repo is auto-managed, Maestro owns its suite — it converts Selenium to
          standard Playwright on a <code>maestro/playwright</code> branch (your original branch untouched),
          then runs, self-heals and triages it. Meridian’s manual authoring for that repo is paused.</p>
      </section>

      <!-- latest run: pipeline + filmstrip -->
      <section class="ag-card">
        <div class="ag-card-head"><h2>Latest run</h2><span class="ag-muted">reuse suite · 2 min ago</span></div>
        <div class="ag-pipe">
          <ng-container *ngFor="let s of stages; let last = last">
            <div class="ag-stage">
              <span class="ag-stage-ico">{{ s.icon }}</span>
              <span class="ag-stage-name">{{ s.name }}</span>
              <span class="ag-stage-note">{{ s.note }}</span>
            </div>
            <span class="ag-chev" *ngIf="!last">›</span>
          </ng-container>
        </div>
        <div class="ag-film">
          <div class="ag-frame" *ngFor="let f of filmstrip" [class.fail]="f.fail"><span>{{ f.label }}</span></div>
        </div>
      </section>

      <div class="ag-grid">
        <!-- ranked candidates -->
        <section class="ag-card">
          <div class="ag-card-head">
            <h2>Ranked test candidates</h2>
            <div class="ag-cov">
              <button class="cov" *ngFor="let c of coverageLevels" [class.sel]="coverage === c"
                (click)="coverage = c">{{ c }}</button>
            </div>
          </div>
          <ul class="ag-cands">
            <li class="ag-cand" *ngFor="let c of candidates" [class.below]="c.below">
              <div class="ag-cand-top">
                <span class="ag-tier" [ngClass]="'tier-' + c.tier">{{ c.tier }}</span>
                <span class="ag-cand-title">{{ c.title }}</span>
                <span class="ag-cand-area">{{ c.area }}</span>
              </div>
              <div class="ag-meter"><span class="ml">value</span>
                <span class="bar"><span class="fill score" [style.width.%]="c.score"></span></span>
                <span class="mv">{{ c.score }}</span></div>
              <div class="ag-meter"><span class="ml">confidence</span>
                <span class="bar"><span class="fill conf" [style.width.%]="c.confidence"></span></span>
                <span class="mv">{{ c.confidence }}</span></div>
            </li>
          </ul>
        </section>

        <!-- triaged bugs -->
        <section class="ag-card">
          <div class="ag-card-head"><h2>Triaged bugs</h2><span class="ag-muted">real defects only</span></div>
          <ul class="ag-bugs">
            <li class="ag-bug" *ngFor="let b of bugs">
              <div class="ag-bug-top">
                <span class="ag-sev" [ngClass]="'sev-' + b.severity">{{ b.severity }}</span>
                <span class="ag-bug-title">{{ b.title }}</span>
                <span class="ag-bug-page">{{ b.page }}</span>
              </div>
              <p class="ag-bug-line"><span class="k">Expected</span>{{ b.expected }}</p>
              <p class="ag-bug-line"><span class="k">Actual</span>{{ b.actual }}</p>
              <div class="ag-evi"><span>▶ video</span><span>trace</span><span>screenshot</span></div>
            </li>
          </ul>
        </section>
      </div>
    </ng-container>

    <ng-template #off>
      <section class="ag-card ag-cta">
        <h2>Let Maestro fully auto-manage this app's tests</h2>
        <p>Point Maestro at a website or repo and it stands up a standardized Playwright suite, runs it
          on a schedule, heals what breaks and files the bugs it finds — with as few as zero-to-one
          people in the loop. Enabling it takes over test generation, so Meridian's manual steps step aside.</p>
        <button class="ag-open solid" (click)="enabled = true">Enable Maestro</button>
      </section>
    </ng-template>
  </div>`,
})
export class AgenticComponent {
  enabled = true;
  coverage = 'critical';
  readonly coverageLevels = ['minimal', 'critical', 'standard', 'deep'];

  readonly kpis = [
    { n: '94%', l: 'pass rate' }, { n: '6', l: 'tests' },
    { n: '2', l: 'open bugs' }, { n: '2', l: 'auto-healed' },
  ];

  readonly stages: Stage[] = [
    { name: 'Explore', icon: '🔎', note: 'mapped 12 pages' },
    { name: 'Generate', icon: '✍️', note: 'wrote 6 specs' },
    { name: 'Run', icon: '▶', note: '32 tests' },
    { name: 'Self-heal', icon: '🩹', note: 'healed 2' },
    { name: 'Triage', icon: '🧭', note: '2 real bugs' },
  ];

  readonly repos: Repo[] = [
    { name: 'acme/checkout-e2e', framework: 'Selenium (Java)', branch: 'maestro/playwright', tests: 14, managed: true },
    { name: 'acme/web-smoke', framework: 'Selenium (TS)', branch: 'maestro/playwright', tests: 6, managed: true },
    { name: 'acme/api-portal-ui', framework: 'Playwright', branch: 'main', tests: 9, managed: false },
  ];

  readonly filmstrip: Frame[] = [
    { label: 'Home' }, { label: 'Products' }, { label: 'Search' },
    { label: 'Cart' }, { label: 'Checkout', fail: true }, { label: 'Account' },
  ];

  readonly candidates: Candidate[] = [
    { title: 'Navigation: all pages are reachable', area: 'Navigation', score: 100, confidence: 96, tier: 'minimal' },
    { title: 'Checkout: complete a purchase end-to-end', area: 'Checkout', score: 92, confidence: 84, tier: 'critical' },
    { title: 'Search & filter returns relevant results', area: 'Search', score: 78, confidence: 88, tier: 'critical' },
    { title: 'Sign in with valid credentials', area: 'Auth', score: 74, confidence: 90, tier: 'standard' },
    { title: 'Update account profile details', area: 'Profile', score: 61, confidence: 80, tier: 'standard' },
    { title: 'Newsletter signup field validation', area: 'Forms', score: 44, confidence: 70, tier: 'backlog', below: true },
  ];

  readonly bugs: Bug[] = [
    { title: 'Checkout total ignores applied promo code', severity: 'high', page: '/checkout',
      expected: 'Total reflects the 10% promo discount', actual: 'Total is charged at full price' },
    { title: 'Search returns HTTP 500 on an empty query', severity: 'medium', page: '/search',
      expected: 'Empty query shows a friendly "type to search" prompt', actual: 'Server error page is rendered' },
  ];
}
