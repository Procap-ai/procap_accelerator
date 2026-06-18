import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { SparkComponent } from '../../components/charts/spark';
import { FleetRepo, QualityService } from '../../services/quality.service';
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
          contributors: 0, avg_scan_score: null as number | null, total_risk_dollars: 0, total_est_flaky: 0 };
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
      });
    }
    this.repos = this.store.list();
  }

  private buildLeaderboard(): void {
    // POC: distribute fleet contributor counts into a demo leaderboard (real names need a richer
    // endpoint; the per-repo Health view shows the actual git contributors).
    const total = this.agg.contributors || this.repos.reduce((s, r) => s + (r.contributors || 0), 0);
    const names = ['Priya N.', 'Marco T.', 'Sora L.', 'Dana R.', 'Ken B.', 'Ava P.'];
    const n = Math.max(1, Math.min(names.length, total || 4));
    this.engineers = names.slice(0, n).map((name, i) => ({ name, commits: Math.max(1, Math.round((total || 12) / (i + 1.5))) }))
      .sort((a, b) => b.commits - a.commits);
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
  demoSpark(seed: number): number[] {
    return Array.from({ length: 8 }, (_, i) => 40 + ((seed * 7 + i * 11) % 50));
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
  remove(r: SavedRepo, ev: Event): void { ev.stopPropagation(); this.repos = this.store.remove(r.repoUrl); }
  toggleRule(r: { on: boolean }): void { r.on = !r.on; }

  shortRepo(url: string): string {
    return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  }
  trackByUrl(_i: number, r: SavedRepo): string { return r.repoUrl; }
}
