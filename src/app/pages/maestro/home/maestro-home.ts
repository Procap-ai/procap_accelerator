import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApexAxisChartSeries } from 'ng-apexcharts';

import {
  MaestroService, MaestroTarget, RunListItem, TargetKind, CreateTargetPayload, CoverageLevel,
} from '../../../services/maestro.service';
import { MaestroManagedStore } from '../../../services/maestro-managed.store';
import { TrendLineComponent } from '../../../components/charts/trend-line';

interface Dash {
  targets: number; runs: number; passRate: number; testsRun: number;
  bugsOpen: number; bugsResolved: number; healed: number;
  passSeries: ApexAxisChartSeries; passCats: string[];
  bugSeries: ApexAxisChartSeries; bugCats: string[]; hasTrend: boolean;
}

@Component({
  selector: 'app-maestro-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TrendLineComponent],
  templateUrl: './maestro-home.html',
  styleUrl: '../maestro.scss',
})
export class MaestroHomeComponent implements OnInit {
  private readonly svc = inject(MaestroService);
  private readonly router = inject(Router);
  private readonly managed = inject(MaestroManagedStore);

  targets: MaestroTarget[] = [];
  runs: RunListItem[] = [];
  allRuns: RunListItem[] = [];
  dash: Dash | null = null;
  loading = true;

  // ── add-target form ──
  showForm = false;
  kind: TargetKind = 'website';
  name = '';
  coverage: CoverageLevel = 'minimal';
  siteUrl = '';
  repoUrl = '';
  githubToken = '';
  withCreds = false;
  username = '';
  password = '';
  loginUrl = '';
  advOpen = false;
  depth = 2;
  maxPages = 12;
  instructions = '';

  submitting = false;
  formError = '';
  runningTargetId = '';

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.loading = true;
    this.svc.listTargets().subscribe({
      // Only auto-managed repos (toggled on in Meridian's Agentic page) surface here.
      next: ({ targets }) => {
        this.targets = targets.filter(t => this.managed.isManaged(t.target_id));
        this.loading = false; this.computeDash();
      },
      error: () => { this.loading = false; },
    });
    this.svc.listRuns().subscribe({ next: ({ runs }) => {
      const scoped = runs.filter(r => this.managed.isManaged(r.target_id));
      this.allRuns = scoped; this.runs = scoped.slice(0, 12); this.computeDash();
    } });
  }

  /** Roll up real run history into the customer-facing analytics dashboard. */
  private computeDash(): void {
    const runs = this.allRuns;
    const completed = runs.filter(r => r.summary && (r.summary.total ?? 0) >= 0);
    const rate = (r: RunListItem) => {
      const s = r.summary!; return s.total ? Math.round((s.passed / s.total) * 100) : 0;
    };
    const withTotals = completed.filter(r => (r.summary!.total ?? 0) > 0);
    const passRate = withTotals.length
      ? Math.round(withTotals.reduce((a, r) => a + rate(r), 0) / withTotals.length) : 0;
    const testsRun = completed.reduce((a, r) => a + (r.summary!.total ?? 0), 0);
    const healed = runs.reduce((a, r) => a + (r.healed ?? 0), 0);

    // per-target: open = latest run's bugs; resolved = sum of positive drops between consecutive runs
    let bugsOpen = 0, bugsResolved = 0;
    const byTarget = new Map<string, RunListItem[]>();
    for (const r of completed) {
      const arr = byTarget.get(r.target_id) ?? [];
      arr.push(r); byTarget.set(r.target_id, arr);
    }
    for (const arr of byTarget.values()) {
      const asc = [...arr].sort((a, b) => a.created_at - b.created_at);
      bugsOpen += asc[asc.length - 1]?.bugs_count ?? 0;
      for (let i = 1; i < asc.length; i++) {
        bugsResolved += Math.max(0, (asc[i - 1].bugs_count ?? 0) - (asc[i].bugs_count ?? 0));
      }
    }

    // trends — last 12 completed runs, chronological
    const recent = [...completed].sort((a, b) => a.created_at - b.created_at).slice(-12);
    const cats = recent.map(r => new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

    this.dash = {
      targets: this.targets.length, runs: runs.length, passRate, testsRun,
      bugsOpen, bugsResolved, healed,
      passSeries: [{ name: 'Pass rate', data: recent.map(rate) }], passCats: cats,
      bugSeries: [{ name: 'Bugs found', data: recent.map(r => r.bugs_count ?? 0) }], bugCats: cats,
      hasTrend: recent.length >= 2,
    };
  }

  toggleForm(): void { this.showForm = !this.showForm; this.formError = ''; }
  setKind(k: TargetKind): void { this.kind = k; this.formError = ''; }

  addTarget(): void {
    this.formError = '';
    const payload: CreateTargetPayload = { kind: this.kind, name: this.name.trim() || undefined, coverage: this.coverage };
    if (this.kind === 'website') {
      if (!this.siteUrl.trim()) { this.formError = 'Enter a website URL.'; return; }
      payload.site_url = this.siteUrl.trim();
      payload.crawl_depth = this.depth;
      payload.max_pages = this.maxPages;
      if (this.instructions.trim()) payload.instructions = this.instructions.trim();
      if (this.withCreds && this.username && this.password) {
        payload.creds = { username: this.username, password: this.password, login_url: this.loginUrl.trim() || undefined };
      }
    } else {
      if (!this.repoUrl.trim()) { this.formError = 'Enter a GitHub repo URL.'; return; }
      payload.repo_url = this.repoUrl.trim();
      if (this.githubToken.trim()) payload.github_token = this.githubToken.trim();
    }
    this.submitting = true;
    this.svc.createTarget(payload).subscribe({
      next: () => { this.submitting = false; this.resetForm(); this.refresh(); },
      error: (err: unknown) => {
        this.submitting = false;
        this.formError = (err as { error?: { error?: string } })?.error?.error ?? 'Could not add target.';
      },
    });
  }

  resetForm(): void {
    this.showForm = false;
    this.name = ''; this.coverage = 'minimal'; this.siteUrl = ''; this.repoUrl = ''; this.githubToken = '';
    this.withCreds = false; this.username = ''; this.password = ''; this.loginUrl = '';
    this.advOpen = false; this.depth = 2; this.maxPages = 12; this.instructions = '';
  }

  runNow(t: MaestroTarget): void {
    this.runningTargetId = t.target_id;
    this.svc.createRun(t.target_id).subscribe({
      next: ({ run_id }) => { this.runningTargetId = ''; void this.router.navigate(['/maestro/run', run_id]); },
      error: (err: unknown) => {
        this.runningTargetId = '';
        alert((err as { error?: { error?: string } })?.error?.error ?? 'Could not start run.');
      },
    });
  }

  remove(t: MaestroTarget): void {
    if (!confirm(`Delete target "${t.name}"? Its credentials will be removed.`)) return;
    this.svc.deleteTarget(t.target_id).subscribe({ next: () => this.refresh() });
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
