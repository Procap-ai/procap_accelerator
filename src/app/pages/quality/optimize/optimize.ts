import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';

import {
  CategoryKind, QualityAnalysis, QualityCategory, QualityItem, QualityService, QualitySession,
} from '../../../services/quality.service';

const ACTIVE_STATUSES = ['created', 'analyzing', 'working', 'opening_pr'];
const EFFORT_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

interface FixType { id: string; label: string; kinds: CategoryKind[]; }

/** "Take action & Optimize" — the actionable fix-planner moved off the repo Overview (AJ email).
 *  A Fix-type dropdown filters the category list; users select items one-by-one or in bulk, then
 *  implement them as a single branch / pull request. */
@Component({
  selector: 'app-optimize',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './optimize.html',
  styleUrl: '../quality.scss',
})
export class OptimizeComponent implements OnInit, OnDestroy {
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);

  session: QualitySession | null = null;
  selection = new Set<string>();
  expanded = new Set<string>();
  launching = false;

  showTokenInput = false;
  githubToken = '';
  prError = '';

  fixType = 'all';
  // Coverage is intentionally excluded here — per AJ's email it belongs to the System & Business
  // Assurance group, not Automation Quality Governance. This page manages script-level quality only.
  readonly fixTypes: FixType[] = [
    { id: 'all', label: 'All fix types', kinds: [] },
    { id: 'antipattern', label: 'Anti-patterns', kinds: ['lint', 'refactor'] },
    { id: 'hygiene', label: 'Repo hygiene', kinds: ['config'] },
    { id: 'ci', label: 'CI & tooling', kinds: ['ci'] },
  ];

  private poll?: Subscription;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.startPolling(id); }
  }
  ngOnDestroy(): void { this.stopPolling(); }

  private startPolling(id: string): void {
    this.stopPolling();
    this.poll = interval(4000).pipe(startWith(0), switchMap(() => this.svc.getSession(id))).subscribe({
      next: s => {
        this.session = s;
        if (this.launching && s.status !== 'analyzed') { this.launching = false; }
        if (!this.isActive(s.status)) { this.stopPolling(); }
      },
      error: () => { /* keep retrying */ },
    });
  }
  private stopPolling(): void { this.poll?.unsubscribe(); this.poll = undefined; }

  isActive(status?: string): boolean { return !!status && ACTIVE_STATUSES.includes(status); }
  /** True while a job is in flight (locally launched or running on AWS) — gates all actions. */
  get running(): boolean { return this.launching || this.isActive(this.session?.status); }
  get analysis(): QualityAnalysis | null { return this.session?.analysis ?? null; }
  /** Governance fix planner excludes coverage categories (those live under Business Assurance). */
  get categories(): QualityCategory[] {
    return (this.analysis?.categories ?? []).filter(c => c.kind !== 'coverage' && c.id !== 'coverage');
  }
  get isAnalyzed(): boolean { return !!this.analysis?.categories?.length; }

  /** Categories visible for the chosen Fix-type. */
  get visibleCategories(): QualityCategory[] {
    const ft = this.fixTypes.find(f => f.id === this.fixType);
    if (!ft || !ft.kinds.length) { return this.categories; }
    return this.categories.filter(c => ft.kinds.includes(c.kind));
  }

  // ── tree helpers ──
  leaves(node: QualityItem): QualityItem[] {
    return node.children?.length ? node.children.flatMap(c => this.leaves(c)) : [node];
  }
  catLeaves(cat: QualityCategory): QualityItem[] { return cat.items.flatMap(i => this.leaves(i)); }
  hasChildren(node: QualityItem): boolean { return !!node.children?.length; }
  isExpanded(id: string): boolean { return this.expanded.has(id); }
  toggleExpand(id: string): void { this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id); }

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

  // ── bulk actions over the visible fix-type ──
  selectAllVisible(): void {
    for (const c of this.visibleCategories) { for (const l of this.catLeaves(c)) { this.selection.add(l.id); } }
  }
  clearSelection(): void { this.selection.clear(); }
  selectGroup(cat: QualityCategory): void {
    const ls = this.catLeaves(cat);
    const all = ls.every(l => this.selection.has(l.id));
    for (const l of ls) { all ? this.selection.delete(l.id) : this.selection.add(l.id); }
  }
  get visibleLeafCount(): number {
    return this.visibleCategories.reduce((s, c) => s + this.catLeaves(c).length, 0);
  }

  // ── KPI strip across all governance fixes (image017: Critical / High / Avg conf / Low effort) ──
  get allLeaves(): QualityItem[] { return this.categories.flatMap(c => this.catLeaves(c)); }
  conf(l: QualityItem): number { return l.confidence ?? 70; }
  sev(l: QualityItem): string { const c = this.conf(l); return c >= 90 ? 'critical' : c >= 75 ? 'high' : 'medium'; }
  get criticalCount(): number { return this.allLeaves.filter(l => this.sev(l) === 'critical').length; }
  get highCount(): number { return this.allLeaves.filter(l => this.sev(l) === 'high').length; }
  get avgConfidence(): number {
    const ls = this.allLeaves; return ls.length ? Math.round(ls.reduce((s, l) => s + this.conf(l), 0) / ls.length) : 0;
  }
  get lowEffortCount(): number { return this.allLeaves.filter(l => l.est_effort === 'low').length; }
  get totalLeaves(): number { return this.allLeaves.length; }

  // ── live estimate ──
  private selImpact(cat: QualityCategory): number {
    return this.catLeaves(cat).filter(l => this.selection.has(l.id)).reduce((s, l) => s + (l.impact || 0), 0);
  }
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
  get countCategories(): QualityCategory[] { return this.categories.filter(c => this.isCount(c)); }
  get totalIssuesNow(): number { return this.countCategories.reduce((s, c) => s + (c.metric.current || 0), 0); }
  get totalIssuesProjected(): number { return this.countCategories.reduce((s, c) => s + this.projectedHeadline(c), 0); }
  get overallNow(): number { return this.analysis?.scores?.overall ?? 0; }
  get overallProjected(): number {
    if (!this.categories.length) { return this.overallNow; }
    const base = this.categories.reduce((s, c) => s + c.score, 0) / this.categories.length;
    const proj = this.categories.reduce((s, c) => s + this.projectedScore(c), 0) / this.categories.length;
    return Math.round(Math.min(100, this.overallNow + (proj - base)));
  }
  get selectedCount(): number { return this.selection.size; }
  get effortLabel(): string {
    let w = 0;
    for (const cat of this.categories) {
      for (const l of this.catLeaves(cat)) { if (this.selection.has(l.id)) { w += EFFORT_WEIGHT[l.est_effort] || 1; } }
    }
    if (w === 0) { return '—'; }
    if (w <= 2) { return 'Quick'; }
    if (w <= 5) { return 'Moderate'; }
    if (w <= 9) { return 'Significant'; }
    return 'Heavy';
  }
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

  progressLine(p: { title?: string; msg?: string }): string { return p.title || p.msg || ''; }
  shortRepo(url?: string): string { return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }
  trackByTs(_i: number, p: { ts: number }): number { return p.ts; }
  trackById(_i: number, n: { id: string }): string { return n.id; }
}
