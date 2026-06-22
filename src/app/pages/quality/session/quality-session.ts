import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';

import { ScoreRingComponent } from '../../../components/charts/score-ring';
import {
  Contributor, QualityAnalysis, QualityCategory, QualityService, QualitySession,
  QualitySignals, RecentCommit, RiskFile,
  ScanReport, ScanDiscipline, ScanDeviation, ScanHotspot,
} from '../../../services/quality.service';
import { RepoStore } from '../../../services/repo-store';
import { SparkComponent } from '../../../components/charts/spark';

const ACTIVE_STATUSES = ['created', 'analyzing', 'working', 'opening_pr'];

/** Repository Overview (read-only). The actionable fix-planner + PR flow now lives on the
 *  "Take action & Optimize" page (session/:id/optimize) per AJ's email split. */
@Component({
  selector: 'app-quality-session',
  imports: [CommonModule, FormsModule, RouterModule, ScoreRingComponent, SparkComponent],
  templateUrl: './quality-session.html',
  styleUrl: '../quality.scss',
})
export class QualitySessionComponent implements OnInit, OnDestroy {
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(RepoStore);

  session: QualitySession | null = null;

  // change-detection ("new commits since last scan")
  hasNewCommits = false;
  latestCommitSubject = '';
  private shaChecked = false;

  private snapshotWritten = false;
  private poll?: Subscription;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.startPolling(id); }
  }
  ngOnDestroy(): void { this.stopPolling(); }

  // ── polling ──
  // Poll only while the backend is actively working. On any terminal/idle status we fetch once
  // and stop; the next user action (implement / open PR) restarts polling.
  private startPolling(id: string): void {
    this.stopPolling();
    this.poll = interval(4000).pipe(
      startWith(0),
      switchMap(() => this.svc.getSession(id)),
    ).subscribe({
      next: s => {
        this.session = s;
        this.syncSnapshot(s);
        if (!this.shaChecked && s.analysis && !this.isActive(s.status)) { this.checkChanges(s); }
        if (!this.isActive(s.status)) { this.stopPolling(); }
      },
      error: () => { /* keep retrying */ },
    });
  }

  // ── change detection: compare the repo's current HEAD to the sha captured at scan time ──
  private parseRepo(url?: string): { owner: string; repo: string } | null {
    const m = (url || '').match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }
  private checkChanges(s: QualitySession): void {
    this.shaChecked = true;
    const pr = this.parseRepo(s.repo_url);
    if (!pr) { return; }
    const saved = this.store.get(s.repo_url);
    this.svc.githubHead(pr.owner, pr.repo).subscribe({
      next: head => {
        if (!saved?.scannedSha) {
          // first time we've seen this repo analysed — record the baseline sha
          this.store.upsert({ repoUrl: s.repo_url, scannedSha: head.sha, scannedAt: Date.now() });
        } else if (saved.scannedSha !== head.sha) {
          this.hasNewCommits = true;
          this.latestCommitSubject = (head.commit?.message || '').split('\n')[0];
        }
      },
      error: () => { /* GitHub rate-limit / private repo — skip silently */ },
    });
  }
  /** Trigger a fresh analysis on the same repo (new session) to pick up the latest commits. */
  reanalyze(): void {
    const url = this.session?.repo_url;
    if (!url) { return; }
    this.svc.createSession(url).subscribe(({ session_id }) => {
      this.store.upsert({ repoUrl: url, sessionId: session_id, status: 'analyzing', scannedSha: undefined });
      void this.router.navigate(['/quality/session', session_id]);
    });
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
  }

  /** Mirror the analysed scorecard into localStorage so the dashboard renders it offline. */
  private syncSnapshot(s: QualitySession): void {
    const patch: Record<string, unknown> = { repoUrl: s.repo_url, sessionId: s.session_id, status: s.status };
    if (s.analysis?.scores && !this.snapshotWritten) {
      patch['scores'] = s.analysis.scores;
      patch['coverage'] = Math.round(this.coverageCategory?.metric?.current ?? s.analysis.scores.coverage ?? 0);
      patch['issues'] = this.totalIssuesNow;
      this.snapshotWritten = true;
    }
    this.store.upsert(patch as { repoUrl: string });
  }

  isActive(status?: string): boolean { return !!status && ACTIVE_STATUSES.includes(status); }
  get analysis(): QualityAnalysis | null { return this.session?.analysis ?? null; }
  get categories(): QualityCategory[] { return this.analysis?.categories ?? []; }
  /** Score rings on the governance Overview exclude coverage (lives under Business Assurance). */
  get ringCategories(): QualityCategory[] {
    return this.categories.filter(c => c.kind !== 'coverage' && c.id !== 'coverage');
  }
  // Keep the analysis report visible whenever it exists — including while a job is re-running on
  // AWS (analyzing / working / opening_pr). The activity strip conveys the running state; the
  // dashboard must NOT disappear on refresh mid-job. Only the very first analysis (no report yet)
  // shows the progress feed instead.
  get isAnalyzed(): boolean { return !!this.analysis?.categories?.length; }

  // ── git/repo signals (Repository Health enrichment) ──
  get signals(): QualitySignals | null { return this.analysis?.signals ?? null; }
  get contributors(): Contributor[] { return this.signals?.contributors ?? []; }
  get riskFiles(): RiskFile[] { return this.signals?.risk_files ?? []; }
  get recentCommits(): RecentCommit[] { return this.signals?.recent_commits ?? []; }
  get velocity(): number[] { return this.signals?.velocity ?? []; }
  // ── deterministic static scan (deck epics B–E: score / disciplines / deviations / risk) ──
  get scan(): ScanReport | null { return this.analysis?.scan ?? null; }
  get disciplines(): ScanDiscipline[] { return this.scan?.disciplines ?? []; }
  get deviations(): ScanDeviation[] { return this.scan?.deviations ?? []; }
  get hotspots(): ScanHotspot[] { return this.scan?.hotspots ?? []; }
  adhColor(v: number): string { return v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444'; }
  fileName(p: string): string { return (p || '').split('/').pop() || p; }
  // Tech-debt $ is exec-only per AJ's email — gate it behind a view toggle (default hidden on
  // the Architect/Lead repo view). usd_model carries visibility:"exec".
  get usd(): ScanReport['usd_model'] | null { return this.scan?.usd_model ?? null; }
  showExecDollars = false;

  riskColor(v: number): string { return v >= 66 ? '#ef4444' : v >= 33 ? '#f59e0b' : '#22c55e'; }
  avatarColor(name: string): string {
    const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#fb7185', '#34d399'];
    let h = 0; for (const c of name || '') { h = (h * 31 + c.charCodeAt(0)) >>> 0; }
    return palette[h % palette.length];
  }
  initials(name: string): string { return (name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); }
  ago(ts: number): string {
    const d = Math.max(0, Date.now() / 1000 - ts);
    if (d < 3600) { return `${Math.round(d / 60)}m`; }
    if (d < 86400) { return `${Math.round(d / 3600)}h`; }
    return `${Math.round(d / 86400)}d`;
  }

  // ── summary metrics used by the overview + the localStorage snapshot ──
  isCount(cat: QualityCategory): boolean { return cat.metric?.unit === 'count'; }
  get coverageCategory(): QualityCategory | undefined {
    return this.categories.find(c => c.kind === 'coverage' || c.id === 'coverage');
  }
  get countCategories(): QualityCategory[] { return this.categories.filter(c => this.isCount(c)); }
  get totalIssuesNow(): number { return this.countCategories.reduce((s, c) => s + (c.metric.current || 0), 0); }
  get overallNow(): number { return this.analysis?.scores?.overall ?? 0; }

  // ── execution economics (modelled, per-repo) — AJ: cost-per-run/frequency belongs on Overview ──
  get runsPerYear(): number { return this.scan?.risk?.runs_per_year ?? 0; }
  get annualUpkeep(): number { return this.scan?.risk?.dollars_per_year ?? 0; }
  get costPerRun(): number {
    return this.runsPerYear ? Math.round(this.annualUpkeep / this.runsPerYear) : 0;
  }
  get hasEconomics(): boolean { return this.runsPerYear > 0; }

  // ── view helpers ──
  progressLine(p: { title?: string; msg?: string }): string { return p.title || p.msg || ''; }
  shortRepo(url?: string): string {
    return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  }
  trackByTs(_i: number, p: { ts: number }): number { return p.ts; }
  trackById(_i: number, n: { id: string }): string { return n.id; }
}
