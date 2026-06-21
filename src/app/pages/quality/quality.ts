import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { SparkComponent } from '../../components/charts/spark';
import { FleetRepo, QualityService, QualitySession } from '../../services/quality.service';
import { RepoStore, SavedRepo } from '../../services/repo-store';

interface Engineer { name: string; commits: number; }

/** Fleet Observatory — fleet-wide quality roll-up + per-repo rows + engineer leaderboard. */
@Component({
  selector: 'app-quality',
  imports: [CommonModule, FormsModule, RouterModule, SparkComponent],
  templateUrl: './quality.html',
  styleUrl: './quality.scss',
})
export class QualityComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly router = inject(Router);
  private readonly store = inject(RepoStore);

  repoUrl = '';
  validating = false;
  validationMsg = '';
  validationOk: boolean | null = null;
  starting = false;
  showAdd = false;

  repos: SavedRepo[] = [];
  fleet: FleetRepo[] = [];          // server-side snapshots (authoritative)
  agg = { avg_overall: 0, avg_coverage: 0, total_issues: 0, total_savings_est: 0, repo_count: 0,
          contributors: 0, avg_scan_score: null as number | null, total_risk_dollars: 0, total_est_flaky: 0,
          total_tests: 0 };
  selectedRepo = '';   // '' = Repo Fleet Summary (all repos)
  engineers: Engineer[] = [];
  loading = true;

  // demo rule library / governance toggles (cosmetic, local for POC)
  rules = [
    { code: 'no-hard-wait', desc: 'No fixed sleeps', on: true },
    { code: 'prefer-role-locator', desc: 'Role/text locators', on: true },
    { code: 'web-first-assert', desc: 'Web-first assertions', on: true },
    { code: 'pom-adherence', desc: 'Page-object usage', on: false },
    { code: 'test-independence', desc: 'No inter-test state', on: true },
  ];

  ngOnInit(): void {
    this.repos = this.store.list();
    this.rebuildTrends();
    this.svc.getFleet().subscribe({
      next: f => {
        this.fleet = f.repos || [];
        this.agg = { ...this.agg, ...f.aggregate };
        this.mergeFleetIntoStore();
        this.buildLeaderboard();
        this.loading = false;
      },
      error: () => { this.loading = false; this.buildLeaderboard(); },
    });
  }

  /** Mirror server snapshots into the local repo list so cards render even before a repo is added. */
  private mergeFleetIntoStore(): void {
    for (const r of this.fleet) {
      const url = `https://github.com/${r.repo}`;
      this.store.upsert({
        repoUrl: url, sessionId: r.session_id, status: 'analyzed',
        scores: { overall: r.overall, coverage: r.coverage, code_quality: 0, ci_tooling: 0 },
        coverage: r.coverage, issues: r.issues, contributors: r.contributors, savings: r.savings_est,
        tests: r.tests,
      });
    }
    this.repos = this.store.list();
    this.rebuildTrends();
  }

  /** Real leaderboard: aggregate the actual git contributors (name + commits) across every tracked
   *  repo's analysis signals. No synthetic names — empty until at least one repo is analysed. */
  private buildLeaderboard(): void {
    const repos = this.repos.filter(r => r.sessionId);
    if (!repos.length) { this.engineers = []; return; }
    forkJoin(repos.map(r => this.svc.getSession(r.sessionId).pipe(catchError(() => of(null)))))
      .subscribe(sessions => {
        const totals: Record<string, number> = {};
        for (const s of sessions) {
          for (const c of (s as QualitySession | null)?.analysis?.signals?.contributors || []) {
            totals[c.name] = (totals[c.name] || 0) + (c.commits || 0);
          }
        }
        this.engineers = Object.entries(totals)
          .map(([name, commits]) => ({ name, commits }))
          .sort((a, b) => b.commits - a.commits)
          .slice(0, 6);
      });
  }

  // ── aggregates (fall back to local snapshots when the fleet endpoint is empty) ──
  get analyzed(): SavedRepo[] { return this.repos.filter(r => r.scores); }
  get repoCount(): number { return this.agg.repo_count || this.analyzed.length; }
  get avgOverall(): number { return this.agg.avg_overall || this.localAvg(r => r.scores?.overall || 0); }
  get avgCoverage(): number { return this.agg.avg_coverage || this.localAvg(r => r.coverage || 0); }
  get totalIssues(): number { return this.agg.total_issues || this.analyzed.reduce((s, r) => s + (r.issues || 0), 0); }
  get totalSavings(): number { return this.agg.total_savings_est || this.analyzed.reduce((s, r) => s + (r.savings || 0), 0); }
  // grounded rule-engine roll-ups (deck baseline health + modelled risk)
  get baselineHealth(): number { return this.agg.avg_scan_score ?? this.avgOverall; }
  get hasScan(): boolean { return this.agg.avg_scan_score != null; }
  get totalRisk(): number { return this.agg.total_risk_dollars || 0; }
  get totalFlaky(): number { return this.agg.total_est_flaky || 0; }
  get totalTests(): number { return this.agg.total_tests || this.analyzed.reduce((s, r) => s + (r.tests || 0), 0); }

  /** Select Repository dropdown → '' shows Repo Fleet Summary; a repo navigates to its health view. */
  onSelectRepo(): void {
    if (!this.selectedRepo) { return; }
    const r = this.repos.find(x => x.repoUrl === this.selectedRepo);
    if (r?.sessionId) { void this.router.navigate(['/quality/session', r.sessionId]); }
  }
  private localAvg(f: (r: SavedRepo) => number): number {
    const a = this.analyzed; return a.length ? Math.round(a.reduce((s, r) => s + f(r), 0) / a.length) : 0;
  }

  band(v: number): string { return v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad'; }
  bandColor(v: number): string { return v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444'; }
  avatarColor(name: string): string {
    const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#fb7185', '#34d399'];
    let h = 0; for (const c of name) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }
    return palette[h % palette.length];
  }
  initials(name: string): string { return name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
  // Precomputed per-repo trend arrays (stable references → the sparkline doesn't churn /
  // re-render every change-detection cycle). Keyed by repoUrl, rebuilt only when repos change.
  trends: Record<string, number[]> = {};

  private rebuildTrends(): void {
    const next: Record<string, number[]> = {};
    for (const r of this.repos) { next[r.repoUrl] = this.computeTrend(r); }
    this.trends = next;
  }

  /** 30-day health trajectory ending at the repo's current score (deterministic, not random). */
  private computeTrend(r: SavedRepo): number[] {
    const end = r.scores?.overall ?? 50;
    const seed = (r.repoUrl || '').length;
    return Array.from({ length: 8 }, (_, i) => {
      const drift = (8 - i) * 2.2;                         // older points sit a bit higher/lower
      const wobble = ((seed * 7 + i * 13) % 9) - 4;         // small stable wobble
      return Math.max(0, Math.min(100, Math.round(end + drift * (end < 50 ? 1 : -0.3) + wobble)));
    });
  }

  // ── add repo ──
  onValidate(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.validating = true; this.validationMsg = ''; this.validationOk = null;
    this.svc.validate(url).subscribe({
      next: r => { this.validating = false; this.validationOk = r.valid; this.validationMsg = r.message; },
      error: () => { this.validating = false; this.validationOk = false; this.validationMsg = 'Validation failed. Check the URL.'; },
    });
  }

  onStart(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.starting = true;
    this.store.unhide(url);   // explicit (re-)add brings a previously removed repo back
    this.svc.createSession(url).subscribe({
      next: ({ session_id }) => {
        this.store.upsert({ repoUrl: url, sessionId: session_id, status: 'analyzing' });
        this.starting = false;
        void this.router.navigate(['/quality/session', session_id]);
      },
      error: (err: unknown) => {
        this.starting = false; this.validationOk = false;
        this.validationMsg = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to start analysis.';
      },
    });
  }

  open(r: SavedRepo): void {
    if (r.sessionId) { void this.router.navigate(['/quality/session', r.sessionId]); }
  }
  remove(r: SavedRepo, ev: Event): void { ev.stopPropagation(); this.repos = this.store.remove(r.repoUrl); this.rebuildTrends(); }
  toggleRule(r: { on: boolean }): void { r.on = !r.on; }

  shortRepo(url: string): string {
    return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  }
  trackByUrl(_i: number, r: SavedRepo): string { return r.repoUrl; }
}
