import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { Journey, JourneyStore } from '../../../services/journey-store';

type Framework = 'Playwright' | 'Selenium' | 'Cypress' | 'MABL';
type Health = 'Healthy' | 'Broken' | 'Stale' | 'Flaky';
type Suite = 'shallow' | 'deep';
type HealthFilter = 'all' | Health | 'attention';

interface PredTest {
  id: string;
  file: string;
  name: string;
  framework: Framework;
  health: Health;
  journey: string;
  aligned: number;          // per-test alignment % (modelled)
  runtimeS: number;
  suite: Suite;
  reasonTag: string;        // why this test was pulled in
  reason: string;
  healthNote: string;
}

interface CompRow { fw: Framework; n: number; pct: number; }

/** System & Business Assurance → Intelligent Suite Prediction (AJ email, image002).
 *  On a build drop, an agent predicts the Smoke/Sanity (shallow) and Regression (deep) suites
 *  most worth running — layering file-impact, journey-affinity and historical failure signals —
 *  then surfaces per-test script health so broken tests get healed before the run.
 *
 *  Prototype note: the build context + the four headline numbers are the modelled prediction
 *  summary (labelled measured / modelled, as drawn). The tab counts, suite composition, "need
 *  attention" tally and per-suite est. runtime are all derived live from the predicted-test list,
 *  and the tabs / health filter / confidence threshold / selection bar are fully interactive. */
@Component({
  selector: 'app-suite-prediction',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar sp-head">
    <div class="sp-head-l">
      <h1>Intelligent Prediction</h1>
      <div class="sp-buildmeta">
        <span class="tag mono">build #4472</span> commit <span class="tag mono">abc123f</span>
        · touched <b>8 files</b> in <b>payment-service</b> &amp; <b>cart</b> · 12m ago
      </div>
    </div>
    <span class="spacer"></span>
    <button class="ghost" (click)="repredict()">↻ Re-predict</button>
    <button class="primary" (click)="runFull()">Run full suite</button>
  </div>

  <p class="sp-msg" *ngIf="msg">{{ msg }}</p>

  <!-- ── headline: 1 dashboard summarising the build-level prediction ── -->
  <div class="sp-cards">
    <div class="sp-card" data-accent="good">
      <div class="sp-card-top"><span class="sp-num good">96%</span>
        <span class="tag measured">measured</span></div>
      <div class="sp-card-lbl">Prediction confidence</div>
      <div class="sp-card-sub">vs full-suite risk coverage</div>
    </div>
    <div class="sp-card" data-accent="violet">
      <div class="sp-card-top"><span class="sp-num">{{ total }}</span><span class="sp-unit">tests</span></div>
      <div class="sp-card-lbl">Predicted for build</div>
      <div class="sp-card-sub">{{ shallowCount }} shallow · {{ deepCount }} deep</div>
    </div>
    <div class="sp-card" data-accent="warn">
      <div class="sp-card-top"><span class="sp-num warn">{{ healthyCount }}</span><span class="sp-unit">/{{ total }}</span>
        <span class="tag modelled">modelled</span></div>
      <div class="sp-card-lbl">Script health</div>
      <div class="sp-card-sub bad">{{ attentionCount }} need attention</div>
    </div>
    <div class="sp-card" data-accent="good">
      <div class="sp-card-top"><span class="sp-num good">62%</span></div>
      <div class="sp-card-lbl">Runtime saved</div>
      <div class="sp-card-sub">~22 min vs full run <span class="tag est">est.</span></div>
    </div>
  </div>

  <!-- ── line tabs: switch shallow / deep / combined suites ── -->
  <div class="sp-tabrow">
    <div class="cfg-tabs sp-tabs">
      <button class="cfg-tab" [class.active]="tab === 'shallow'" (click)="setTab('shallow')">
        Shallow · Smoke/Sanity <span class="sp-count">{{ shallowCount }}</span></button>
      <button class="cfg-tab" [class.active]="tab === 'deep'" (click)="setTab('deep')">
        Deep · Regression <span class="sp-count">{{ deepCount }}</span></button>
      <button class="cfg-tab" [class.active]="tab === 'combined'" (click)="setTab('combined')">
        Combined <span class="sp-count">{{ total }}</span></button>
    </div>
    <label class="sp-filter">Filter:
      <select class="repo-select" [(ngModel)]="healthFilter">
        <option value="all">All health states</option>
        <option value="attention">Needs attention only</option>
        <option value="Healthy">Healthy</option>
        <option value="Broken">Broken</option>
        <option value="Stale">Stale</option>
        <option value="Flaky">Flaky</option>
      </select>
    </label>
  </div>

  <div class="sp-grid">
    <!-- ── predicted-test list ── -->
    <div class="panel">
      <div class="sp-list-head">
        <h3 style="margin:0">Predicted for {{ tabLabel }} · {{ visible.length }} test{{ visible.length === 1 ? '' : 's' }}</h3>
        <span class="spacer" style="flex:1"></span>
        <span class="rule-desc" style="text-transform:none;letter-spacing:0">est. {{ fmtTime(visibleRuntime) }} · {{ visibleAttention }} need attention</span>
      </div>
      <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.5;margin:2px 0 10px">
        {{ tab === 'shallow' ? 'Critical-path tests selected for fast pre-merge feedback.' :
           tab === 'deep' ? 'Broad regression coverage across journeys the build could disturb.' :
           'The full predicted set — shallow smoke plus deep regression.' }}
        Tick tests to plan a bulk heal or exclude before run.</p>

      <p class="empty-hint" *ngIf="!visible.length" style="margin:8px 0">
        No predicted tests match this filter{{ hiddenByThreshold ? ' or the ' + thresholdPct + '% alignment threshold' : '' }}.</p>

      <div class="sp-test" *ngFor="let t of shown; trackBy: trackById">
        <span class="cb" [attr.data-state]="sel.has(t.id) ? 'checked' : 'unchecked'" (click)="toggle(t.id)"></span>
        <div class="sp-test-body">
          <div class="sp-test-top">
            <span class="sp-test-name"><span class="mono">{{ t.file }}</span> › {{ t.name }}</span>
            <span class="spacer" style="flex:1"></span>
            <span class="sp-health" [attr.data-h]="t.health">{{ t.health }}</span>
          </div>
          <div class="sp-test-meta">
            <span class="tag" [attr.data-fw]="t.framework">{{ t.framework }}</span>
            journey <b class="sp-jrn">{{ t.journey }}</b> · {{ t.aligned }}% aligned · runtime {{ t.runtimeS }}s
          </div>
          <div class="sp-test-reason"><span class="sp-tag-sel">SELECTED</span> {{ t.reasonTag }} · {{ t.reason }}</div>
          <div class="sp-test-health" [attr.data-h]="t.health" *ngIf="t.health !== 'Healthy'">
            <span class="sp-tag-h">HEALTH</span> {{ t.healthNote }}</div>
        </div>
      </div>

      <button class="ghost sp-more" *ngIf="visible.length > previewN" (click)="showAll = !showAll">
        {{ showAll ? 'Show fewer' : 'Show ' + (visible.length - previewN) + ' more ' + tabLabel + ' tests' }}</button>
    </div>

    <!-- ── right rail: how it predicted / composition / heal engines ── -->
    <div class="sp-rail">
      <div class="panel sp-side">
        <div class="sp-side-label">How Meridian predicted</div>
        <div class="sp-layer"><span>Layer 1 · File impact</span><b>58</b></div>
        <div class="sp-layer"><span>Layer 2 · Journey affinity</span><b class="up">+12</b></div>
        <div class="sp-layer"><span>Layer 3 · Historical</span><b class="up">+8</b></div>
        <div class="sp-layer strong"><span>{{ tabLabel | titlecase }} filter</span><b class="good">{{ visible.length }}</b></div>
        <div class="sp-thresh">
          <div class="sp-thresh-lbl">Confidence threshold</div>
          <div class="sp-thresh-row">
            <input type="number" step="0.05" min="0" max="1" [(ngModel)]="threshold">
            <span class="rule-desc" style="text-transform:none;letter-spacing:0">min. per-test alignment</span>
          </div>
        </div>
      </div>

      <div class="panel sp-side">
        <div class="sp-side-label">Suite composition</div>
        <div class="sp-comp" *ngFor="let c of composition">
          <span class="sp-comp-fw">{{ c.fw }}</span>
          <span class="sp-comp-bar"><span class="sp-comp-fill" [attr.data-fw]="c.fw" [style.width.%]="c.pct"></span></span>
          <b class="sp-comp-n">{{ c.n }}</b>
        </div>
        <p class="empty-hint" *ngIf="!composition.length" style="margin:4px 0">No tests in this view.</p>
      </div>

      <div class="panel sp-side">
        <div class="sp-side-label">Auto-heal engines</div>
        <div class="sp-engine"><span>Playwright</span><b class="good">✓ native</b></div>
        <div class="sp-engine"><span>Selenium</span><b class="good">✓ native</b></div>
        <div class="sp-engine"><span>Cypress</span><b class="good">✓ native</b></div>
        <div class="sp-engine"><span>Robot</span><b class="warn">● partial</b></div>
        <div class="sp-engine strong"><span>MABL Studio</span><b class="violet">✓ push</b></div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.5;margin-top:10px">
          Native heals rewrite the test file. MABL push delegates to MABL’s healing engine.</p>
      </div>
    </div>
  </div>

  <!-- ── selection / run bar ── -->
  <div class="sp-actionbar" [class.active]="sel.size">
    <div class="sp-sel-count"><b>{{ sel.size }}</b> test{{ sel.size === 1 ? '' : 's' }} selected
      <span class="rule-desc" *ngIf="sel.size" style="text-transform:none;letter-spacing:0">
        · {{ selBroken }} broken · {{ selStale }} stale</span></div>
    <span class="spacer" style="flex:1"></span>
    <button class="ghost" [disabled]="!sel.size" (click)="skip()">Skip</button>
    <button class="ghost" [disabled]="!selNative" (click)="heal('native')">Auto-heal native ({{ selNative }})</button>
    <button class="ghost" [disabled]="!selMabl" (click)="heal('mabl')">MABL Studio</button>
    <button class="primary" (click)="run()">Run predicted → {{ fmtTime(runRuntime) }}</button>
  </div>
  `,
})
export class SuitePredictionComponent implements OnInit {
  private readonly journeyStore = inject(JourneyStore);

  tests: PredTest[] = [];
  tab: 'shallow' | 'deep' | 'combined' = 'shallow';
  healthFilter: HealthFilter = 'all';
  threshold = 0.85;
  sel = new Set<string>();
  showAll = false;
  readonly previewN = 5;
  msg = '';

  ngOnInit(): void {
    this.tests = this.build(this.journeyStore.list());
  }

  // ── tab / filter derived views ─────────────────────────────────────────────
  setTab(t: 'shallow' | 'deep' | 'combined'): void { this.tab = t; this.showAll = false; }
  get thresholdPct(): number { return Math.round(this.threshold * 100); }
  get tabLabel(): string { return this.tab === 'combined' ? 'combined' : this.tab; }

  /** Tests for the active suite tab (before the health / threshold filters). */
  get suiteTests(): PredTest[] {
    return this.tab === 'combined' ? this.tests : this.tests.filter(t => t.suite === this.tab);
  }
  /** The visible list: suite tab ∩ health filter ∩ confidence threshold. */
  get visible(): PredTest[] {
    return this.suiteTests
      .filter(t => this.healthMatch(t))
      .filter(t => t.aligned >= this.thresholdPct);
  }
  get shown(): PredTest[] { return this.showAll ? this.visible : this.visible.slice(0, this.previewN); }
  get hiddenByThreshold(): boolean {
    return this.suiteTests.filter(t => this.healthMatch(t)).some(t => t.aligned < this.thresholdPct);
  }
  private healthMatch(t: PredTest): boolean {
    if (this.healthFilter === 'all') { return true; }
    if (this.healthFilter === 'attention') { return t.health !== 'Healthy'; }
    return t.health === this.healthFilter;
  }

  // ── headline / list roll-ups (derived from the predicted set) ───────────────
  get total(): number { return this.tests.length; }
  get shallowCount(): number { return this.tests.filter(t => t.suite === 'shallow').length; }
  get deepCount(): number { return this.tests.filter(t => t.suite === 'deep').length; }
  get healthyCount(): number { return this.tests.filter(t => t.health === 'Healthy').length; }
  get attentionCount(): number { return this.tests.filter(t => t.health !== 'Healthy').length; }
  get visibleRuntime(): number { return this.visible.reduce((s, t) => s + t.runtimeS, 0); }
  get visibleAttention(): number { return this.visible.filter(t => t.health !== 'Healthy').length; }

  /** Suite composition (framework mix) of the current visible view. */
  get composition(): CompRow[] {
    const counts = new Map<Framework, number>();
    for (const t of this.visible) { counts.set(t.framework, (counts.get(t.framework) || 0) + 1); }
    const max = Math.max(1, ...counts.values());
    const order: Framework[] = ['Playwright', 'Selenium', 'Cypress', 'MABL'];
    return order.filter(fw => counts.has(fw))
      .map(fw => ({ fw, n: counts.get(fw)!, pct: Math.round(100 * counts.get(fw)! / max) }));
  }

  // ── selection bar ───────────────────────────────────────────────────────────
  toggle(id: string): void { this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); }
  trackById(_i: number, t: PredTest): string { return t.id; }
  private selected(): PredTest[] { return this.tests.filter(t => this.sel.has(t.id)); }
  get selBroken(): number { return this.selected().filter(t => t.health === 'Broken').length; }
  get selStale(): number { return this.selected().filter(t => t.health === 'Stale').length; }
  get selNative(): number { return this.selected().filter(t => t.framework !== 'MABL').length; }
  get selMabl(): number { return this.selected().filter(t => t.framework === 'MABL').length; }
  /** Run estimate: the selected tests if any are ticked, else the whole visible suite. */
  get runRuntime(): number {
    return this.sel.size ? this.selected().reduce((s, t) => s + t.runtimeS, 0) : this.visibleRuntime;
  }

  repredict(): void { this.msg = 'Re-predicting against build #4472 (checksum + visual diff)… layers recomputed.'; }
  runFull(): void { this.msg = 'Queued the full suite (155 tests, ~35 min) — bypassing prediction for this run.'; }
  skip(): void { this.msg = `Skipped ${this.sel.size} test(s) for build #4472 — excluded from this run.`; this.sel.clear(); }
  heal(kind: 'native' | 'mabl'): void {
    this.msg = kind === 'native'
      ? `Auto-heal queued for ${this.selNative} native-framework test(s) — locator rewrites drafted for review.`
      : `Delegated ${this.selMabl} test(s) to MABL Studio’s healing engine.`;
  }
  run(): void {
    const n = this.sel.size || this.visible.length;
    this.msg = `Running ${n} predicted test(s) → est. ${this.fmtTime(this.runRuntime)}. (Prototype — not dispatched.)`;
  }

  fmtTime(s: number): string {
    const m = Math.floor(s / 60), sec = s % 60;
    return m ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
  }

  // ── the predicted set ────────────────────────────────────────────────────────
  /** Featured rows mirror image002; the remainder are generated deterministically so the tab
   *  counts (12 shallow / 47 deep), the "need attention" tally (9 total) and the composition
   *  bars are all real functions of the list rather than hard-coded KPI text. Journey names are
   *  drawn from the configured JourneyStore where they line up, keeping this view connected to
   *  Configuration → Journeys. */
  private build(journeys: Journey[]): PredTest[] {
    const featured: PredTest[] = [
      { id: 's1', file: 'login.spec.ts', name: 'user signs in with SSO', framework: 'Playwright', health: 'Broken',
        journey: 'Login — SSO+MFA', aligned: 84, runtimeS: 18, suite: 'shallow',
        reasonTag: 'Critical journey', reason: 'direct file impact on auth-service/sso.ts',
        healthNote: 'Selector #sso-btn deprecated in this build · test will fail' },
      { id: 's2', file: 'checkout.spec.ts', name: 'pays with saved card', framework: 'Playwright', health: 'Healthy',
        journey: 'Checkout — saved card', aligned: 92, runtimeS: 34, suite: 'shallow',
        reasonTag: 'Critical journey', reason: 'high production traffic (12K/day)', healthNote: '' },
      { id: 's3', file: 'cart.spec.ts', name: 'add to cart and proceed', framework: 'Playwright', health: 'Stale',
        journey: 'Cart to checkout', aligned: 88, runtimeS: 22, suite: 'shallow',
        reasonTag: 'Critical journey', reason: 'payment path in change set',
        healthNote: 'AC updated 3d ago · test hasn’t been touched in 47d' },
      { id: 's4', file: 'auth_reset.robot', name: 'password reset flow', framework: 'Selenium', health: 'Flaky',
        journey: 'Login — recovery', aligned: 76, runtimeS: 41, suite: 'shallow',
        reasonTag: 'Auth surface change', reason: 'historical correlation with build type',
        healthNote: '24% flake rate over last 30d · unstable timing on email step' },
      { id: 's5', file: 'checkout_journey.mabl', name: 'guest express pay', framework: 'MABL', health: 'Broken',
        journey: 'Guest checkout — express', aligned: 81, runtimeS: 28, suite: 'shallow',
        reasonTag: 'Journey affinity', reason: 'production traffic surfaced in telemetry',
        healthNote: 'Element locator drift detected via MABL healing signal' },
    ];

    // remaining shallow: fill to 12, all Healthy → keeps shallow "need attention" at 4.
    // Framework top-up hits the mockup's composition (Playwright 8, Selenium 2, Cypress 1, MABL 1).
    const shallowFill: Array<[string, Framework]> = [
      ['product.spec.ts › view product detail', 'Playwright'],
      ['nav.spec.ts › primary navigation loads', 'Playwright'],
      ['search.spec.ts › keyword search returns results', 'Playwright'],
      ['account.spec.ts › view order history', 'Playwright'],
      ['header.spec.ts › mini-cart badge updates', 'Playwright'],
      ['smoke_login.side › standard credential login', 'Selenium'],
      ['home.cy.js › landing renders above the fold', 'Cypress'],
    ];
    const jNames = journeys.map(j => j.name);
    const shallow2 = shallowFill.map((row, i) => this.gen('sf' + i, row[0], row[1], 'shallow', 'Healthy',
      jNames[i % jNames.length] || 'Browse — catalogue', 9 + (i * 3) % 11, i));

    // deep regression: 47 tests, exactly 5 not-Healthy → total attention = 4 + 5 = 9 (Script health 50/59).
    const deep: PredTest[] = [];
    const dFrames: Framework[] = ['Playwright', 'Playwright', 'Selenium', 'Cypress', 'Playwright', 'MABL'];
    const attentionAt = new Set([3, 11, 19, 28, 40]);   // deterministic "need attention" positions
    const attHealth: Health[] = ['Stale', 'Flaky', 'Broken', 'Flaky', 'Stale'];
    let attIdx = 0;
    for (let i = 0; i < 47; i++) {
      const isAtt = attentionAt.has(i);
      const health: Health = isAtt ? attHealth[attIdx++] : 'Healthy';
      const fw = dFrames[i % dFrames.length];
      const jn = jNames[i % jNames.length] || 'Browse — catalogue';
      const slug = jn.toLowerCase().split(/[^a-z0-9]+/)[0] || 'regression';
      const file = fw === 'MABL' ? `${slug}_regression.mabl`
        : fw === 'Selenium' ? `${slug}RegressionTest.java`
        : fw === 'Cypress' ? `${slug}.cy.js` : `${slug}.regression.spec.ts`;
      deep.push(this.gen('d' + i, `${file} › ${jn.split('—')[1]?.trim() || 'regression path'}`, fw, 'deep', health, jn, 12 + (i * 7) % 60, i));
    }

    return [...featured, ...shallow2, ...deep];
  }

  /** Build a generated (non-featured) row from a "file › name" string, deriving honest-looking
   *  reason / health text from the health state. */
  private gen(id: string, label: string, fw: Framework, suite: Suite, health: Health, journey: string, runtimeS: number, i: number): PredTest {
    const [file, ...rest] = label.split('›');
    const aligned = health === 'Healthy' ? 78 + (i * 5) % 20 : 70 + (i * 3) % 15;
    const reasonTag = suite === 'shallow' ? 'Critical journey' : (i % 3 === 0 ? 'Adjacent to change set' : i % 3 === 1 ? 'Journey affinity' : 'Historical failure cluster');
    const reason = suite === 'shallow' ? 'core smoke path for this build'
      : i % 3 === 0 ? 'module neighbours the touched files'
      : i % 3 === 1 ? 'maps to a production journey near the change'
      : 'defect-prone area — checked regardless of diff';
    const healthNote = health === 'Broken' ? 'Locator no longer resolves in this build · will fail'
      : health === 'Stale' ? `not updated in ${40 + i % 30}d · AC drift likely`
      : health === 'Flaky' ? `${15 + i % 20}% flake rate over last 30d · timing-sensitive`
      : '';
    return { id, file: (file || label).trim(), name: (rest.join('›') || '').trim(), framework: fw, health, journey, aligned, runtimeS, suite, reasonTag, reason, healthNote };
  }
}
