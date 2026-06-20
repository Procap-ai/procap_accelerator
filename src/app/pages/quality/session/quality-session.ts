import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';

import { BarListComponent, BarRow } from '../../../components/charts/bar-list';
import { DonutComponent } from '../../../components/charts/donut';
import { ScoreRingComponent } from '../../../components/charts/score-ring';
import {
  Contributor, QualityAnalysis, QualityCategory, QualityItem, QualityService, QualitySession,
  QualitySignals, RecentCommit, RiskFile,
  ScanReport, ScanDiscipline, ScanDeviation, ScanHotspot,
} from '../../../services/quality.service';
import { RepoStore } from '../../../services/repo-store';
import { SparkComponent } from '../../../components/charts/spark';

const ACTIVE_STATUSES = ['created', 'analyzing', 'working', 'opening_pr'];
const EFFORT_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

@Component({
  selector: 'app-quality-session',
  imports: [CommonModule, FormsModule, RouterModule, ScoreRingComponent, DonutComponent, BarListComponent, SparkComponent],
  templateUrl: './quality-session.html',
  styleUrl: '../quality.scss',
})
export class QualitySessionComponent implements OnInit, OnDestroy {
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(RepoStore);

  session: QualitySession | null = null;
  selection = new Set<string>();
  expanded = new Set<string>();
  launching = false;

  showTokenInput = false;
  githubToken = '';
  prError = '';

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
        if (this.launching && s.status !== 'analyzed') { this.launching = false; }
        if (!this.isActive(s.status)) { this.stopPolling(); }
      },
      error: () => { /* keep retrying */ },
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
  // Keep the analysis report visible once it exists — not only while status==='analyzed'.
  // Otherwise it vanishes after run_task / open_pr (status task_done | pr_open | failed).
  get isAnalyzed(): boolean {
    return !!this.analysis?.categories?.length && !this.isActive(this.session?.status);
  }

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

  // ── tree helpers ──
  leaves(node: QualityItem): QualityItem[] {
    return node.children?.length ? node.children.flatMap(c => this.leaves(c)) : [node];
  }
  catLeaves(cat: QualityCategory): QualityItem[] {
    return cat.items.flatMap(i => this.leaves(i));
  }
  hasChildren(node: QualityItem): boolean { return !!node.children?.length; }
  isExpanded(id: string): boolean { return this.expanded.has(id); }
  toggleExpand(id: string): void {
    this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id);
  }

  nodeState(node: QualityItem): 'checked' | 'unchecked' | 'indeterminate' {
    const ls = this.leaves(node);
    const sel = ls.filter(l => this.selection.has(l.id)).length;
    if (sel === 0) { return 'unchecked'; }
    return sel === ls.length ? 'checked' : 'indeterminate';
  }
  toggleNode(node: QualityItem): void {
    const ls = this.leaves(node);
    const all = ls.every(l => this.selection.has(l.id));
    for (const l of ls) { all ? this.selection.delete(l.id) : this.selection.add(l.id); }
  }

  // ── live estimate ──
  private selImpact(cat: QualityCategory): number {
    return this.catLeaves(cat).filter(l => this.selection.has(l.id))
      .reduce((s, l) => s + (l.impact || 0), 0);
  }
  isPercent(cat: QualityCategory): boolean { return cat.metric?.unit === 'percent'; }
  isCount(cat: QualityCategory): boolean { return cat.metric?.unit === 'count'; }

  projectedScore(cat: QualityCategory): number {
    const imp = this.selImpact(cat);
    if (this.isCount(cat)) {
      const cur = cat.metric.current || 0;
      if (cur <= 0) { return cat.score; }
      return Math.min(100, Math.round(cat.score + (100 - cat.score) * Math.min(1, imp / cur)));
    }
    return Math.min(100, Math.round(cat.score + imp));
  }
  projectedHeadline(cat: QualityCategory): number {
    const imp = this.selImpact(cat);
    if (this.isCount(cat)) { return Math.max(0, (cat.metric.current || 0) - imp); }
    return Math.min(cat.metric.target || 100, (cat.metric.current || 0) + imp);
  }

  get coverageCategory(): QualityCategory | undefined {
    return this.categories.find(c => c.kind === 'coverage' || c.id === 'coverage');
  }
  get countCategories(): QualityCategory[] { return this.categories.filter(c => this.isCount(c)); }
  get totalIssuesNow(): number { return this.countCategories.reduce((s, c) => s + (c.metric.current || 0), 0); }
  get totalIssuesProjected(): number {
    return this.countCategories.reduce((s, c) => s + this.projectedHeadline(c), 0);
  }
  get overallNow(): number { return this.analysis?.scores?.overall ?? 0; }
  get overallProjected(): number {
    if (!this.categories.length) { return this.overallNow; }
    // Anchor on the model's reported overall and add the *improvement* (avg projected − avg
    // current category score) so that with nothing selected projected === now.
    const base = this.categories.reduce((s, c) => s + c.score, 0) / this.categories.length;
    const proj = this.categories.reduce((s, c) => s + this.projectedScore(c), 0) / this.categories.length;
    return Math.round(Math.min(100, this.overallNow + (proj - base)));
  }
  get coverageNow(): number { return Math.round(this.coverageCategory?.metric?.current ?? 0); }
  get coverageProjected(): number {
    return this.coverageCategory ? Math.round(this.projectedHeadline(this.coverageCategory)) : 0;
  }

  get selectedCount(): number { return this.selection.size; }
  get effortLabel(): string {
    let w = 0;
    for (const cat of this.categories) {
      for (const l of this.catLeaves(cat)) {
        if (this.selection.has(l.id)) { w += EFFORT_WEIGHT[l.est_effort] || 1; }
      }
    }
    if (w === 0) { return '—'; }
    if (w <= 2) { return 'Quick'; }
    if (w <= 5) { return 'Moderate'; }
    if (w <= 9) { return 'Significant'; }
    return 'Heavy';
  }

  /** Per-feature bars for the coverage panel. */
  coverageBars(): BarRow[] {
    const cat = this.coverageCategory;
    if (!cat) { return []; }
    return cat.items.map(i => {
      const sel = this.leaves(i).some(l => this.selection.has(l.id));
      const cur = i.metric?.current ?? 0;
      const tgt = i.metric?.target ?? 100;
      return {
        label: i.title,
        value: cur,
        projected: sel ? tgt : cur,
        caption: `${Math.round(cur)}% → ${Math.round(tgt)}%`,
      } as BarRow;
    });
  }

  // ── metric chip per node ──
  metricChip(node: QualityItem): string {
    const m = node.metric;
    if (!m) { return ''; }
    if (m.unit === 'percent') { return `${Math.round(m.current)}% → ${Math.round(m.target)}%`; }
    return `${Math.round(m.current)} issue${m.current === 1 ? '' : 's'}`;
  }

  // ── implement / PR ──
  implement(): void {
    if (!this.session || !this.selection.size) { return; }
    this.launching = true;
    this.svc.runSelections(this.session.session_id, [...this.selection]).subscribe({
      next: () => this.startPolling(this.session!.session_id),
      error: () => { this.launching = false; },
    });
  }

  toggleTokenInput(): void { this.showTokenInput = !this.showTokenInput; this.prError = ''; }
  submitPr(): void {
    if (!this.session || !this.githubToken.trim()) { this.prError = 'Enter a GitHub token.'; return; }
    this.prError = '';
    this.svc.openPr(this.session.session_id, this.githubToken.trim()).subscribe({
      next: () => { this.showTokenInput = false; this.githubToken = ''; this.startPolling(this.session!.session_id); },
      error: (err: unknown) => { this.prError = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to open PR.'; },
    });
  }

  // ── view helpers ──
  progressLine(p: { title?: string; msg?: string }): string { return p.title || p.msg || ''; }
  shortRepo(url?: string): string {
    return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  }
  trackByTs(_i: number, p: { ts: number }): number { return p.ts; }
  trackById(_i: number, n: { id: string }): string { return n.id; }
}
