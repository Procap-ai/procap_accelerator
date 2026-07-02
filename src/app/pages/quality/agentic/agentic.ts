import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  MaestroService, MaestroTarget, RunListItem, MaestroRun, TestCandidate, Bug,
  CoverageLevel, CreateTargetPayload,
} from '../../../services/maestro.service';
import { MaestroManagedStore } from '../../../services/maestro-managed.store';

/**
 * Meridian → Agentic Test Generation & Triage (powered by Maestro).
 *
 * A live view into the Maestro product from inside the Meridian observatory. From here you can add a
 * GitHub repo as a Maestro target, trigger an on-demand cloud run, and see the real stats Maestro
 * produces — KPIs, the latest run's pipeline + filmstrip, the ranked test-candidate dashboard, and
 * the triaged-bug feed. All data comes from the same `/autopilot/*` backend the standalone Maestro
 * product uses; "Open in Maestro" jumps to the full product (/maestro) to watch a run live or curate.
 *
 * NOTE: Meridian doesn't run tests — running happens in Maestro. Marking a repo "Auto-managed" here is
 * what surfaces it in the Maestro view so it can be run on demand (persisted client-side via
 * MaestroManagedStore; there's no backend scheduler yet — that's a follow-up).
 */
interface Stage { name: string; icon: string; }
interface Frame { label: string; src: string; fail: boolean; }

@Component({
  selector: 'app-agentic',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  // Theme tokens (--bg/--panel/--accent/…) cascade from the ObservatoryShell's :host, so this page
  // only needs its own scoped styles — no need to inline the whole shared quality.scss.
  styleUrl: './agentic.scss',
  template: `
  <div class="ag">
    <!-- header -->
    <header class="ag-head">
      <div>
        <h1>Agentic Test Generation &amp; Triage <span class="ag-power">powered by Maestro</span></h1>
        <p class="ag-sub">Add a GitHub repo and an AI agent explores the app, writes a full Playwright suite,
          runs it in the cloud, heals its own flaky tests and files only the real bugs — on demand from here,
          or in the standalone <a routerLink="/maestro">Maestro</a> product.</p>
      </div>
      <div class="ag-head-acts">
        <button class="ag-open solid" (click)="showAdd = !showAdd">＋ Add repo</button>
        <a class="ag-open" routerLink="/maestro">Open in Maestro →</a>
      </div>
    </header>

    <div class="ag-loading" *ngIf="loading">Loading Maestro…</div>

    <ng-container *ngIf="!loading">
      <!-- auto-managed banner -->
      <div class="ag-banner" *ngIf="repos.length">
        <span class="ag-dot"></span>
        Meridian doesn't run tests. Repos marked <strong>Auto-managed</strong> are surfaced in the
        <a routerLink="/maestro">Maestro</a> view, where they can be run on demand.
      </div>

      <!-- KPIs (real run history) -->
      <div class="ag-kpis" *ngIf="hasRuns">
        <div class="ag-kpi"><span class="n">{{ kpi.passRate }}%</span><span class="l">pass rate</span></div>
        <div class="ag-kpi"><span class="n">{{ kpi.tests }}</span><span class="l">tests run</span></div>
        <div class="ag-kpi"><span class="n">{{ kpi.bugsOpen }}</span><span class="l">open bugs</span></div>
        <div class="ag-kpi"><span class="n">{{ kpi.healed }}</span><span class="l">auto-healed</span></div>
      </div>

      <!-- connected repositories -->
      <section class="ag-card">
        <div class="ag-card-head"><h2>Connected repositories</h2>
          <span class="ag-muted">converted to standard Playwright on a branch</span></div>

        <!-- add-repo form -->
        <div class="ag-add" *ngIf="showAdd">
          <div class="ag-add-row">
            <input class="ag-in" [(ngModel)]="repoUrl" placeholder="https://github.com/owner/repo" />
            <input class="ag-in" type="password" [(ngModel)]="githubToken" autocomplete="new-password"
              placeholder="Access token (private repos / to push branch)" />
            <select class="ag-in sel" [(ngModel)]="coverage">
              <option *ngFor="let c of coverageLevels" [value]="c">{{ c }}</option>
            </select>
            <button class="ag-open solid" [disabled]="submitting" (click)="addRepo()">
              {{ submitting ? 'Adding…' : 'Add' }}</button>
          </div>
          <p class="ag-err" *ngIf="formError">{{ formError }}</p>
        </div>

        <ul class="ag-repos" *ngIf="repos.length">
          <li class="ag-repo" *ngFor="let r of repos">
            <span class="ag-repo-ico">📦</span>
            <div class="ag-repo-body">
              <div class="ag-repo-top">
                <span class="ag-repo-name">{{ r.name }}</span>
                <span class="ag-repo-fw" *ngIf="r.source_framework">from {{ r.source_framework }}</span>
                <span class="ag-repo-tests" *ngIf="r.tests?.length">{{ r.tests?.length }} tests</span>
                <span class="ag-repo-tests" *ngIf="r.last_run_status" [ngClass]="statusClass(r.last_run_status)">
                  {{ r.last_run_status }}</span>
              </div>
              <span class="ag-repo-branch" *ngIf="r.converted_branch">🔀 {{ r.converted_branch }}</span>
            </div>
            <div class="ag-repo-acts">
              <button class="ag-switch sm" [class.on]="isManaged(r)" (click)="toggleManaged(r)"
                [attr.aria-pressed]="isManaged(r)"><span class="knob"></span>{{ isManaged(r) ? 'Auto-managed' : 'Enable' }}</button>
              <a class="ag-open sm" [routerLink]="['/maestro/target', r.target_id]">Open in Maestro →</a>
            </div>
          </li>
        </ul>

        <p class="ag-repo-empty" *ngIf="!repos.length && !showAdd">
          No repositories connected yet. <button class="ag-link" (click)="showAdd = true">Add a repo</button>
          to let Maestro build and run its suite.</p>

        <p class="ag-repo-note" *ngIf="repos.length">Auto-managed repos appear in Maestro, where Maestro owns
          the suite — it converts Selenium to standard Playwright on a <code>maestro/playwright</code> branch
          (your original branch untouched), then runs, self-heals and triages it on demand.</p>
      </section>

      <!-- latest run: pipeline + filmstrip -->
      <section class="ag-card" *ngIf="focusRun">
        <div class="ag-card-head"><h2>Latest run</h2>
          <span class="ag-muted">{{ focus?.name }} · {{ ago(focusRun.updated_at) }}</span></div>
        <div class="ag-pipe" *ngIf="stages.length">
          <ng-container *ngFor="let s of stages; let last = last">
            <div class="ag-stage">
              <span class="ag-stage-ico">{{ s.icon }}</span>
              <span class="ag-stage-name">{{ s.name }}</span>
            </div>
            <span class="ag-chev" *ngIf="!last">›</span>
          </ng-container>
        </div>
        <div class="ag-film" *ngIf="filmstrip.length">
          <div class="ag-frame" *ngFor="let f of filmstrip" [class.fail]="f.fail"
            [style.background-image]="'url(' + f.src + ')'"><span>{{ f.label }}</span></div>
        </div>
      </section>

      <div class="ag-grid" *ngIf="candidates.length || bugs.length">
        <!-- ranked candidates -->
        <section class="ag-card" *ngIf="candidates.length">
          <div class="ag-card-head"><h2>Ranked test candidates</h2>
            <span class="ag-muted">{{ focus?.name }}</span></div>
          <ul class="ag-cands">
            <li class="ag-cand" *ngFor="let c of candidates" [class.below]="c.enabled === false">
              <div class="ag-cand-top">
                <span class="ag-tier" [ngClass]="'tier-' + (c.tier || 'standard')">{{ c.tier || 'ranked' }}</span>
                <span class="ag-cand-title">{{ c.title }}</span>
                <span class="ag-cand-area" *ngIf="c.area">{{ c.area }}</span>
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
        <section class="ag-card" *ngIf="bugs.length">
          <div class="ag-card-head"><h2>Triaged bugs</h2><span class="ag-muted">real defects only</span></div>
          <ul class="ag-bugs">
            <li class="ag-bug" *ngFor="let b of bugs">
              <div class="ag-bug-top">
                <span class="ag-sev" [ngClass]="'sev-' + (b.severity || 'medium')">{{ b.severity || 'bug' }}</span>
                <span class="ag-bug-title">{{ b.title }}</span>
                <span class="ag-bug-page" *ngIf="b.page">{{ b.page }}</span>
              </div>
              <p class="ag-bug-line" *ngIf="b.expected"><span class="k">Expected</span>{{ b.expected }}</p>
              <p class="ag-bug-line" *ngIf="b.actual"><span class="k">Actual</span>{{ b.actual }}</p>
              <div class="ag-evi" *ngIf="focusRun && b.evidence_capture">
                <a [href]="cap(focusRun.run_id, b.evidence_capture)" target="_blank">▶ screenshot</a>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <!-- empty state: no repos and no runs at all -->
      <section class="ag-card ag-cta" *ngIf="!repos.length && !hasRuns">
        <h2>Let Maestro build &amp; run this app's tests</h2>
        <p>Connect a GitHub repo and mark it auto-managed — it stands up a standardized Playwright suite in
          Maestro, runnable on demand in the cloud, healing what breaks and filing the bugs it finds. Its
          stats show up right here in Meridian.</p>
        <button class="ag-open solid" (click)="showAdd = true">＋ Add a repo</button>
      </section>
    </ng-container>
  </div>`,
})
export class AgenticComponent implements OnInit {
  private readonly svc = inject(MaestroService);
  private readonly managed = inject(MaestroManagedStore);

  loading = true;
  targets: MaestroTarget[] = [];
  repos: MaestroTarget[] = [];
  allRuns: RunListItem[] = [];

  kpi = { passRate: 0, tests: 0, bugsOpen: 0, healed: 0 };
  get hasRuns(): boolean { return this.allRuns.length > 0; }

  // focused target/run driving the per-app panels (latest run overall)
  focus: MaestroTarget | null = null;
  focusRun: MaestroRun | null = null;
  stages: Stage[] = [];
  filmstrip: Frame[] = [];
  candidates: TestCandidate[] = [];
  bugs: Bug[] = [];

  // add-repo form
  showAdd = false;
  repoUrl = '';
  githubToken = '';
  coverage: CoverageLevel = 'minimal';
  readonly coverageLevels: CoverageLevel[] = ['minimal', 'critical', 'standard', 'deep'];
  submitting = false;
  formError = '';

  ngOnInit(): void { this.refresh(); }

  isManaged(t: MaestroTarget): boolean { return this.managed.isManaged(t.target_id); }
  toggleManaged(t: MaestroTarget): void { this.managed.toggle(t.target_id); }

  refresh(): void {
    this.loading = true;
    this.svc.listTargets().subscribe({
      next: ({ targets }) => {
        this.targets = targets;
        this.repos = targets.filter(t => t.kind === 'repo');
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
    this.svc.listRuns().subscribe({
      next: ({ runs }) => {
        this.allRuns = [...runs].sort((a, b) => b.created_at - a.created_at);
        this.computeKpi();
        const latest = this.allRuns[0];
        if (latest) this.loadFocus(latest.target_id, latest.run_id);
      },
    });
  }

  /** Roll up real run history into the KPI strip (mirrors Maestro home). */
  private computeKpi(): void {
    const completed = this.allRuns.filter(r => r.summary);
    const rate = (r: RunListItem) => { const s = r.summary!; return s.total ? (s.passed / s.total) * 100 : 0; };
    const withTotals = completed.filter(r => (r.summary!.total ?? 0) > 0);
    const passRate = withTotals.length
      ? Math.round(withTotals.reduce((a, r) => a + rate(r), 0) / withTotals.length) : 0;
    const tests = completed.reduce((a, r) => a + (r.summary!.total ?? 0), 0);
    const healed = this.allRuns.reduce((a, r) => a + (r.healed ?? 0), 0);

    // open bugs = latest run per target
    let bugsOpen = 0;
    const seen = new Set<string>();
    for (const r of this.allRuns) {              // already newest-first
      if (seen.has(r.target_id)) continue;
      seen.add(r.target_id);
      bugsOpen += r.bugs_count ?? 0;
    }
    this.kpi = { passRate, tests, bugsOpen, healed };
  }

  private loadFocus(targetId: string, runId: string): void {
    this.svc.getTarget(targetId).subscribe({
      next: t => {
        this.focus = t;
        this.candidates = [...(t.candidates ?? [])].sort((a, b) => b.score - a.score).slice(0, 6);
      },
    });
    this.svc.getRun(runId).subscribe({
      next: r => {
        this.focusRun = r;
        this.stages = (r.progress ?? [])
          .filter(p => p.type === 'stage')
          .map(p => ({ name: p.title || p.msg || 'stage', icon: this.stageIcon(p.title || p.msg || '') }));
        this.filmstrip = (r.progress ?? [])
          .filter(p => p.capture)
          .slice(-8)
          .map(p => ({ label: p.title || p.msg || '', fail: p.type === 'fail', src: this.cap(r.run_id, p.capture!) }));
        this.bugs = r.bugs ?? [];
      },
    });
  }

  addRepo(): void {
    this.formError = '';
    if (!this.repoUrl.trim()) { this.formError = 'Enter a GitHub repo URL.'; return; }
    this.submitting = true;
    const payload: CreateTargetPayload = { kind: 'repo', repo_url: this.repoUrl.trim(), coverage: this.coverage };
    if (this.githubToken.trim()) payload.github_token = this.githubToken.trim();
    this.svc.createTarget(payload).subscribe({
      next: () => {
        this.submitting = false; this.repoUrl = ''; this.githubToken = ''; this.showAdd = false;
        this.refresh();
      },
      error: (err: unknown) => {
        this.submitting = false;
        this.formError = (err as { error?: { error?: string } })?.error?.error ?? 'Could not add repo.';
      },
    });
  }

  cap(runId: string, file: string): string { return this.svc.captureUrl(runId, file); }

  private stageIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('explor') || n.includes('crawl') || n.includes('map')) return '🔎';
    if (n.includes('clone')) return '📥';
    if (n.includes('convert')) return '🔀';
    if (n.includes('generat') || n.includes('writ') || n.includes('plan')) return '✍️';
    if (n.includes('install')) return '📦';
    if (n.includes('heal')) return '🩹';
    if (n.includes('triage') || n.includes('bug')) return '🧭';
    if (n.includes('run') || n.includes('test')) return '▶';
    if (n.includes('done') || n.includes('complet')) return '✅';
    return '•';
  }

  statusClass(s?: string): string {
    if (!s) return '';
    if (s === 'done' || s === 'pr_open') return 'ok';
    if (s === 'failed') return 'bad';
    return 'busy';
  }

  ago(ts?: number): string {
    if (!ts) return '';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }
}
