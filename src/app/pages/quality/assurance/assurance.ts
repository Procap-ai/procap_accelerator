import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { QualityService } from '../../../services/quality.service';
import { RepoStore, SavedRepo } from '../../../services/repo-store';
import { Journey, JourneyStore } from '../../../services/journey-store';

type Tab = 'coverage' | 'ac';

/** System & Business Assurance (AJ email + Coverage-gaps / AC-alignment docs).
 *  Tab 1 "Coverage snapshot & gaps" — the four defensible numbers (coverage %, open gaps,
 *  AC-mutation count, a transparent tunable Assurance Index) computed from the candidate journeys.
 *  Tab 2 "AC criteria alignment" — the journey breakdown (aligned / partial / unaligned / no-test)
 *  with a modelled confidence per journey. Alignment is directional/modelled for the POC. */
@Component({
  selector: 'app-assurance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>System &amp; Business Assurance</h1>
    <span class="sub">Coverage, gaps &amp; requirement alignment</span>
    <span class="spacer"></span>
    <select class="repo-select" [(ngModel)]="selectedRepo">
      <option value="">All repositories</option>
      <option *ngFor="let r of repos" [value]="r.repoUrl">{{ shortRepo(r.repoUrl) }}</option>
    </select>
  </div>

  <div class="cfg-tabs">
    <button class="cfg-tab" [class.active]="tab === 'coverage'" (click)="tab = 'coverage'">Coverage snapshot &amp; gaps</button>
    <button class="cfg-tab" [class.active]="tab === 'ac'" (click)="tab = 'ac'">AC criteria alignment
      <span class="tag" style="background:#3a2f1a;color:#f5c87a">modelled</span></button>
  </div>

  <!-- ───────── Coverage snapshot & gaps ───────── -->
  <ng-container *ngIf="tab === 'coverage'">
    <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><span class="val sky">{{ coveragePct }}%</span>
        <span class="lbl">Journey coverage <span class="tag" style="background:#22384a;color:#7dd3fc">measured</span>
          <i class="info">i<span class="tip">Journeys with at least one aligned passing test ÷ declared journeys. Ties to journeys the business cares about — not lines of code.</span></i></span></div>
      <div class="kpi"><span class="val" [class.warn]="openGaps > 0">{{ openGaps }}</span>
        <span class="lbl">Open gaps
          <i class="info">i<span class="tip">Journeys with no aligned test, plus journeys whose tests are stale / misaligned / low-confidence.</span></i></span></div>
      <div class="kpi"><span class="val">{{ acMutations }}</span>
        <span class="lbl">AC mutations · qtr <span class="tag" style="background:#3a2f1a;color:#f5c87a">modelled</span>
          <i class="info">i<span class="tip">Times an acceptance criterion changed in the source-of-truth this quarter (a currency signal). Cheaper reframe of mutation-testing history.</span></i></span></div>
      <div class="kpi"><span class="val good">{{ assuranceIndex }}</span>
        <span class="lbl">Assurance index <span class="tag" style="background:#3a2f1a;color:#f5c87a">modelled</span>
          <i class="info">i<span class="tip">Composite — formula shown below and weights tunable. Not an industry-standard metric.</span></i></span></div>
    </div>

    <div class="fleet-grid">
      <div class="panel">
        <h3>Risk-weighted gaps <span class="rule-desc" style="text-transform:none;letter-spacing:0">$ exposure if a journey breaks unnoticed</span></h3>
        <div class="jrow jhead"><span>Journey</span><span>Criticality</span><span>Alignment</span><span>Risk $</span><span></span></div>
        <div class="jrow" *ngFor="let j of journeys">
          <span class="jname"><b>{{ j.name }}</b><div class="jsrc">{{ j.source }}</div></span>
          <span>{{ j.criticality }}</span>
          <span><span class="align-pill" [ngClass]="j.alignment">{{ j.alignment }}</span></span>
          <span [style.color]="isGap(j) ? 'var(--bad)' : 'var(--good)'">\${{ j.weightUsd | number }}</span>
          <button class="ghost" style="font-size:11px;padding:3px 9px" *ngIf="isGap(j)" (click)="scaffold(j)">Scaffold</button>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:12px">
          Risk exposure from gaps: <b style="color:var(--bad)">\${{ riskExposure | number }}</b>.
          Edit journeys &amp; weights in <a class="link" routerLink="/quality/config">Configuration → Journeys</a>.</p>
      </div>

      <div class="panel">
        <h3>Assurance index — how it's computed</h3>
        <div class="assur-formula">
          index = coverage×<b>{{ wCov }}</b> + (1−normGaps)×<b>{{ wGap }}</b> + acFreshness×<b>{{ wMut }}</b><br>
          = {{ coveragePct }}%×{{ wCov }} + {{ (100 - normGaps) }}%×{{ wGap }} + {{ acFreshness }}%×{{ wMut }}
          = <b style="color:var(--good)">{{ assuranceIndex }}</b>
        </div>
        <div class="cfg-settings" style="margin-top:14px">
          <label>Coverage weight<input type="number" step="0.1" min="0" max="1" [(ngModel)]="wCov"></label>
          <label>Gaps weight<input type="number" step="0.1" min="0" max="1" [(ngModel)]="wGap"></label>
          <label>AC-freshness weight<input type="number" step="0.1" min="0" max="1" [(ngModel)]="wMut"></label>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:8px">
          The formula is a property of your org — tune the weights to your priorities. The index is opinionated, not standard.</p>

        <ng-container *ngIf="scaffolded">
          <h3 style="margin-top:18px">Scaffold — {{ scaffolded.name }} <span class="tag" style="background:#2a2f3a;color:var(--muted)">template · TODOs</span></h3>
          <textarea class="cfg-json" rows="12" readonly>{{ scaffoldText }}</textarea>
          <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:6px">
            A template with named TODO blocks — not a working test. Fill in assertions before committing.</p>
        </ng-container>
      </div>
    </div>
  </ng-container>

  <!-- ───────── AC criteria alignment ───────── -->
  <ng-container *ngIf="tab === 'ac'">
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span class="val good">{{ alignedCount }} / {{ journeys.length }}</span>
        <span class="lbl">Critical journeys aligned <span class="tag" style="background:#3a2f1a;color:#f5c87a">modelled</span>
          <i class="info">i<span class="tip">Behind this number is tag-based matching + semantic-similarity scoring, not direct measurement. Method shown per row.</span></i></span></div>
      <div class="kpi"><span class="val warn">{{ partialCount }}</span>
        <span class="lbl">Partially aligned / drifting</span></div>
      <div class="kpi"><span class="val" [class.warn]="unalignedCount > 0">{{ unalignedCount }}</span>
        <span class="lbl">Unaligned or no test</span></div>
    </div>

    <div class="panel">
      <h3>Journey breakdown <span class="rule-desc" style="text-transform:none;letter-spacing:0">existence · fidelity · currency</span></h3>
      <div class="jrow jhead"><span>Acceptance criterion / journey</span><span>Source</span><span>Linked test</span><span>Confidence</span><span>Status</span></div>
      <div class="jrow" *ngFor="let j of journeys" (click)="drill = drill === j.id ? '' : j.id" style="cursor:pointer">
        <span class="jname"><b>{{ j.name }}</b></span>
        <span class="jsrc">{{ j.source }}</span>
        <span class="jsrc">{{ j.test || '— none —' }}</span>
        <span [style.color]="confColor(j.confidence)">{{ j.confidence }}%</span>
        <span><span class="align-pill" [ngClass]="j.alignment">{{ j.alignment }}</span></span>
      </div>

      <!-- drill-down: expected steps vs (directional) observed trace -->
      <div class="panel" *ngIf="drilled as j" style="margin-top:14px;background:var(--panel)">
        <h3>{{ j.name }} <span class="align-pill" [ngClass]="j.alignment">{{ j.alignment }}</span></h3>
        <div class="fleet-grid">
          <div>
            <div class="rule-desc" style="text-transform:none;letter-spacing:0;margin-bottom:6px">AC expected steps</div>
            <div class="ledger-row" *ngFor="let s of expectedSteps(j)"><span class="what">{{ s }}</span></div>
          </div>
          <div>
            <div class="rule-desc" style="text-transform:none;letter-spacing:0;margin-bottom:6px">Test observed trace <span class="tag" style="background:#3a2f1a;color:#f5c87a">modelled</span></div>
            <div class="ledger-row" *ngFor="let s of observedSteps(j)"><span class="what">{{ s }}</span></div>
          </div>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:10px">
          Behavioural trace-matching (run-time step capture) is the rigorous method — deferred to a later
          iteration. Today's status is tag-based + semantic similarity, shown as <b>modelled</b> with a confidence band.</p>
      </div>
    </div>
  </ng-container>
  `,
})
export class AssuranceComponent implements OnInit {
  private readonly store = inject(RepoStore);
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);
  private readonly journeyStore = inject(JourneyStore);

  tab: Tab = 'coverage';
  repos: SavedRepo[] = [];
  selectedRepo = '';
  journeys: Journey[] = [];

  // Assurance-index weights (tunable; default 0.4 / 0.4 / 0.2 per the Coverage-gaps doc)
  wCov = 0.4; wGap = 0.4; wMut = 0.2;
  acMutations = 7;          // AC edits this quarter (currency signal — demo value)
  drill = '';
  scaffolded: Journey | null = null;
  scaffoldText = '';

  ngOnInit(): void {
    this.repos = this.store.list();
    this.journeys = this.journeyStore.list();
    this.svc.getFleet().subscribe({
      next: f => {
        for (const r of f.repos || []) {
          this.store.upsert({
            repoUrl: `https://github.com/${r.repo}`, sessionId: r.session_id, status: 'analyzed',
            scores: { overall: r.overall, coverage: r.coverage, code_quality: 0, ci_tooling: 0 },
            coverage: r.coverage, issues: r.issues, tests: r.tests,
          });
        }
        this.repos = this.store.list();
      },
      error: () => { /* keep local */ },
    });
    if (this.route.snapshot.queryParamMap.get('tab') === 'ac') { this.tab = 'ac'; }
  }

  // ── the four numbers ──
  isGap(j: Journey): boolean { return j.alignment === 'no-test' || j.alignment === 'unaligned'; }
  get covered(): number { return this.journeys.filter(j => j.alignment === 'aligned').length; }
  get coveragePct(): number {
    return this.journeys.length ? Math.round(100 * this.covered / this.journeys.length) : 0;
  }
  get openGaps(): number { return this.journeys.filter(j => this.isGap(j) || j.alignment === 'partial').length; }
  get normGaps(): number { return this.journeys.length ? Math.round(100 * this.openGaps / this.journeys.length) : 0; }
  get acFreshness(): number { return Math.max(0, 100 - this.acMutations * 5); } // fewer recent AC edits = fresher
  get assuranceIndex(): number {
    const v = this.coveragePct * this.wCov + (100 - this.normGaps) * this.wGap + this.acFreshness * this.wMut;
    return Math.round(v);
  }
  get riskExposure(): number {
    return this.journeys.filter(j => this.isGap(j)).reduce((s, j) => s + (j.weightUsd || 0), 0);
  }

  // ── AC tab roll-ups ──
  get alignedCount(): number { return this.journeys.filter(j => j.alignment === 'aligned').length; }
  get partialCount(): number { return this.journeys.filter(j => j.alignment === 'partial').length; }
  get unalignedCount(): number { return this.journeys.filter(j => this.isGap(j)).length; }
  get drilled(): Journey | undefined { return this.journeys.find(j => j.id === this.drill); }

  confColor(c: number): string { return c >= 75 ? 'var(--good)' : c >= 50 ? 'var(--warn)' : 'var(--bad)'; }

  expectedSteps(j: Journey): string[] {
    return [`Navigate to entry point for “${j.name}”`, 'Perform the primary user action',
      'Reach the expected end-state', 'Assert the journey outcome / promise'];
  }
  observedSteps(j: Journey): string[] {
    if (j.alignment === 'no-test') { return ['(no test exercises this journey)']; }
    if (j.alignment === 'unaligned') { return ['Test hits a page directly', 'Asserts render only', '⚠ never exercises the journey']; }
    if (j.alignment === 'partial') { return ['Navigates to entry point', 'Performs the action', '⚠ outcome not asserted']; }
    return ['Navigates to entry point', 'Performs the action', 'Reaches end-state', 'Asserts the outcome'];
  }

  scaffold(j: Journey): void {
    this.scaffolded = j;
    this.scaffoldText =
`import { test, expect } from '@playwright/test';

// Journey: ${j.name}
// Source:  ${j.source}   Criticality: ${j.criticality}
test('${j.name}', async ({ page }) => {
  // TODO: navigate to the entry point for this journey
  // await page.goto('/');

  // TODO: perform the primary user action(s)

  // TODO: assert the journey OUTCOME, not just the action
  // expect(...).toBe(...);
});
`;
  }

  shortRepo(url: string): string { return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }
}
