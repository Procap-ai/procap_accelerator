import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DonutComponent } from '../../../components/charts/donut';
import { QualityService } from '../../../services/quality.service';
import { RepoStore, SavedRepo } from '../../../services/repo-store';
import { Journey, JourneyStore } from '../../../services/journey-store';

type Tab = 'coverage' | 'ac';
interface CoverageGap { j: Journey; cur: number; target: number; points: number; }

/** System & Business Assurance (AJ email + Coverage-gaps / AC-alignment docs).
 *  Tab 1 "Coverage snapshot & gaps" — the four defensible numbers (coverage %, open gaps,
 *  AC-mutation count, a transparent tunable Assurance Index) computed from the candidate journeys.
 *  Tab 2 "AC criteria alignment" — the journey breakdown (aligned / partial / unaligned / no-test)
 *  with a modelled confidence per journey. Alignment is directional/modelled for the POC. */
@Component({
  selector: 'app-assurance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DonutComponent],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>System &amp; Business Assurance</h1>
    <span class="sub">Coverage, gaps &amp; requirement alignment</span>
    <span class="spacer"></span>
    <select class="repo-select" [(ngModel)]="selectedRepo" (ngModelChange)="onRepoChange()">
      <option value="">All repositories (authored journeys)</option>
      <option *ngFor="let r of repos" [value]="r.repoUrl">{{ shortRepo(r.repoUrl) }}</option>
    </select>
  </div>

  <p class="rule-desc" *ngIf="matchNote" style="text-transform:none;letter-spacing:0;margin:-4px 0 12px">
    {{ matchNote }}</p>

  <div class="panel" *ngIf="selectedSession" style="display:flex;align-items:center;gap:12px;padding:10px 16px">
    <span class="rule-desc" style="text-transform:none;letter-spacing:0;flex:1">
      Editorial “State of quality” overview for {{ shortRepo(selectedRepo) }}.</span>
    <a class="nav-link" [routerLink]="['/quality/genome', selectedSession]" style="padding:4px 10px">State of quality →</a>
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
      <!-- selectable coverage-gaps list (image020/028) -->
      <div class="panel">
        <h3>Test coverage <span class="score-pill" data-kind="coverage">{{ coveragePct }}/100</span>
          <span class="spacer" style="flex:1"></span>
          <span class="rule-desc" style="text-transform:none;letter-spacing:0">{{ coverageGaps.length }} gaps · full uplift potential to assurance index
            <b style="color:var(--good)">+{{ potentialIndex - assuranceIndex }}</b></span></h3>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.5;margin:0 0 12px">
          Journeys with no aligned test, or tests that are stale / point at placeholder URLs. Tick gaps to plan a coverage uplift.</p>

        <div class="gap-item" *ngFor="let g of coverageGaps">
          <span class="cb" [attr.data-state]="gapSel.has(g.j.id) ? 'checked' : 'unchecked'" (click)="toggleGap(g.j.id)"></span>
          <div style="flex:1">
            <div class="item-title-row">
              <span class="item-title">{{ g.j.name }}</span>
              <span class="metric-chip">{{ g.cur }}% → {{ g.target }}%</span>
              <span class="impact">+{{ g.points }}</span>
              <span class="sev" [attr.data-s]="g.j.criticality === 'high' ? 'critical' : g.j.criticality === 'medium' ? 'high' : 'medium'">{{ g.j.criticality }}</span>
            </div>
            <div class="item-desc">{{ gapReason(g.j) }}</div>
          </div>
          <button class="ghost" style="font-size:11px;padding:3px 9px;white-space:nowrap" (click)="scaffold(g.j)">Scaffold</button>
        </div>
        <p class="empty-hint" *ngIf="!coverageGaps.length" style="margin:6px 0">No open coverage gaps — every journey has an aligned test.</p>

        <div class="gap-footer">
          <b>{{ gapSel.size }} gap{{ gapSel.size === 1 ? '' : 's' }} selected</b>
          <span class="spacer" style="flex:1"></span>
          <button class="ghost" (click)="gapSel.clear()">Clear</button>
          <button class="primary" [disabled]="!gapSel.size" (click)="scaffoldAllSelected()">Scaffold all selected</button>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:10px">
          Risk exposure from gaps: <b style="color:var(--bad)">\${{ riskExposure | number }}</b> ·
          edit journeys &amp; weights in <a class="link" routerLink="/quality/config">Configuration → Journeys</a>.</p>
      </div>

      <!-- right: projected uplift when gaps selected (image024), else the index formula -->
      <div class="panel" *ngIf="gapSel.size; else indexPanel">
        <div class="pi-head"><span class="pi-ico">∿</span> Projected impact <span class="tag" style="background:#3a2f1a;color:#f5c87a;margin-left:8px">modelled</span></div>
        <p class="pi-sub" style="margin:4px 0 14px">If you scaffold the {{ gapSel.size }} selected gap{{ gapSel.size === 1 ? '' : 's' }}</p>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <app-donut [current]="coveragePct" [projected]="projectedCoverage" label="Coverage" [size]="150"></app-donut>
          <div style="flex:1;min-width:180px">
            <div class="pi-score-row"><span class="pi-lbl">Assurance index</span>
              <span class="pi-nums">{{ assuranceIndex }} <span class="arrow">→</span>
                <b class="up">{{ projectedIndex }}</b>
                <span class="pi-delta">▲ +{{ projectedIndex - assuranceIndex }}</span></span></div>
            <div class="pi-bar" style="margin:10px 0 16px">
              <span class="pi-fill-now" [style.width.%]="assuranceIndex"></span>
              <span class="pi-fill-gain" [style.left.%]="assuranceIndex" [style.width.%]="projectedIndex - assuranceIndex"></span></div>
            <div class="pi-grid">
              <div class="pi-cell"><span class="pi-cell-lbl">Tests scaffolded</span>
                <span class="pi-cell-val"><b class="up">+{{ gapSel.size }}</b> new</span></div>
              <div class="pi-cell"><span class="pi-cell-lbl">Open gaps</span>
                <span class="pi-cell-val">{{ openGaps }} <span class="arrow">→</span> <b class="down">{{ openGaps - gapSel.size }}</b></span></div>
            </div>
          </div>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:10px">
          Scaffolds are templates with TODOs — coverage uplift realises once assertions are filled in.</p>

        <ng-container *ngIf="scaffolded">
          <h3 style="margin-top:16px">Scaffold — {{ scaffolded.name }} <span class="tag" style="background:#2a2f3a;color:var(--muted)">template · TODOs</span></h3>
          <textarea class="cfg-json" rows="10" readonly>{{ scaffoldText }}</textarea>
        </ng-container>
      </div>

      <ng-template #indexPanel>
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
            The formula is a property of your org — tune the weights. Tick a gap on the left to preview the projected uplift.</p>

          <ng-container *ngIf="scaffolded">
            <h3 style="margin-top:18px">Scaffold — {{ scaffolded.name }} <span class="tag" style="background:#2a2f3a;color:var(--muted)">template · TODOs</span></h3>
            <textarea class="cfg-json" rows="10" readonly>{{ scaffoldText }}</textarea>
          </ng-container>
        </div>
      </ng-template>
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
  matchNote = '';
  gapSel = new Set<string>();

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
    // React to ?tab=ac changes (the sidebar "AC criteria alignment" link only changes the query
    // param — without subscribing, clicking it while already on this page did nothing).
    this.route.queryParamMap.subscribe(q => { this.tab = q.get('tab') === 'ac' ? 'ac' : 'coverage'; });
  }

  // ── repo selector: re-evaluate journeys against the selected repo's REAL test files ──
  private parseRepo(url?: string): { owner: string; repo: string } | null {
    const m = (url || '').match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }
  private isTestFile(p: string): boolean {
    return /\.(spec|test|cy)\.[jt]sx?$/i.test(p) || /\.feature$/i.test(p)
      || /(^|\/)(test_[^/]+|[^/]+_test)\.py$/i.test(p);
  }
  private tokens(name: string): string[] {
    const stop = new Set(['with', 'flow', 'code', 'edit', 'saved', 'page', 'user', 'apply', 'applied']);
    return name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !stop.has(w));
  }

  onRepoChange(): void {
    if (!this.selectedRepo) { this.journeys = this.journeyStore.list(); this.matchNote = ''; return; }
    const pr = this.parseRepo(this.selectedRepo);
    if (!pr) { return; }
    this.matchNote = 'Matching journeys against the repository’s test files…';
    this.svc.githubHead(pr.owner, pr.repo).subscribe({
      next: head => this.svc.githubTree(pr.owner, pr.repo, head.sha).subscribe({
        next: tree => this.applyMatches(tree.tree.filter(t => t.type === 'blob' && this.isTestFile(t.path)).map(t => t.path)),
        error: () => { this.matchNote = 'Could not read the repo file tree (private repo or GitHub rate-limit) — showing authored journeys.'; this.journeys = this.journeyStore.list(); },
      }),
      error: () => { this.matchNote = 'Could not reach GitHub — showing authored journeys.'; this.journeys = this.journeyStore.list(); },
    });
  }

  /** Directional auto-comparison: a journey whose keywords appear in a real test path is treated as
   *  having a candidate test (existence only — fidelity is NOT verified, so it caps at "partial"). */
  private applyMatches(testPaths: string[]): void {
    const lowers = testPaths.map(p => p.toLowerCase());
    this.journeys = this.journeyStore.list().map(j => {
      const toks = this.tokens(j.name);
      const hitIdx = lowers.findIndex(p => toks.some(t => p.includes(t)));
      if (hitIdx >= 0) {
        return { ...j, alignment: 'partial', confidence: 55, test: testPaths[hitIdx].split('/').pop() || testPaths[hitIdx] } as Journey;
      }
      return { ...j, alignment: 'no-test', confidence: 0, test: undefined } as Journey;
    });
    this.matchNote = `Matched against ${testPaths.length} test file${testPaths.length === 1 ? '' : 's'} in `
      + `${this.shortRepo(this.selectedRepo)} — existence only; fidelity not verified (capped at “partial”).`;
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

  // ── coverage gaps list + projected uplift (image020 / 028 / 024) ──
  // Open gaps = no-test OR unaligned OR partial (consistent with the "Open gaps" KPI / the doc).
  get coverageGaps(): CoverageGap[] {
    return this.journeys.filter(j => this.isGap(j) || j.alignment === 'partial').map(j => ({
      j,
      cur: j.alignment === 'partial' ? 40 : j.alignment === 'unaligned' ? 5 : 0,
      target: j.criticality === 'high' ? 80 : j.criticality === 'medium' ? 70 : 60,
      points: j.criticality === 'high' ? 40 : j.criticality === 'medium' ? 25 : 10,
    }));
  }
  gapReason(j: Journey): string {
    if (j.alignment === 'no-test') { return 'No test exercises this journey — entirely uncovered.'; }
    if (j.alignment === 'partial') { return 'A test exists but doesn’t assert the journey outcome — partial coverage.'; }
    return 'A test exists but points at a placeholder / never exercises the journey — false confidence.';
  }
  /** Full potential uplift if EVERY gap were scaffolded & wired (shown in the header, like the mockup's "+75"). */
  get potentialIndex(): number {
    const fixed = this.coverageGaps.length;
    const projCov = this.journeys.length ? Math.round(100 * (this.covered + fixed) / this.journeys.length) : 0;
    return Math.round(projCov * this.wCov + 100 * this.wGap + this.acFreshness * this.wMut);
  }
  toggleGap(id: string): void { this.gapSel.has(id) ? this.gapSel.delete(id) : this.gapSel.add(id); }
  /** Projected journey coverage if the selected gaps were scaffolded & wired. */
  get projectedCoverage(): number {
    if (!this.journeys.length) { return 0; }
    return Math.round(100 * (this.covered + this.gapSel.size) / this.journeys.length);
  }
  get projectedIndex(): number {
    const projGaps = this.journeys.length ? Math.round(100 * Math.max(0, this.openGaps - this.gapSel.size) / this.journeys.length) : 0;
    return Math.round(this.projectedCoverage * this.wCov + (100 - projGaps) * this.wGap + this.acFreshness * this.wMut);
  }
  scaffoldAllSelected(): void {
    const first = this.journeys.find(j => this.gapSel.has(j.id));
    if (first) { this.scaffold(first); }
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

  get selectedSession(): string {
    return this.repos.find(r => r.repoUrl === this.selectedRepo)?.sessionId || '';
  }
  shortRepo(url: string): string { return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }
}
