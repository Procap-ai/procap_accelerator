import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import {
  AutopilotService, AutopilotTarget, RunListItem, CoverageLevel, TargetTest,
} from '../../../services/autopilot.service';

interface CoverageOpt { id: CoverageLevel; label: string; blurb: string; }

@Component({
  selector: 'app-autopilot-target',
  imports: [CommonModule, RouterModule],
  templateUrl: './autopilot-target.html',
  styleUrl: './autopilot-target.scss',
})
export class AutopilotTargetComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(AutopilotService);

  targetId = '';
  target: AutopilotTarget | null = null;
  runs: RunListItem[] = [];
  loading = true;
  busy = false;

  readonly coverageOpts: CoverageOpt[] = [
    { id: 'minimal', label: 'Minimal', blurb: 'One deep test — verifies every page is reachable. Critical only. (default)' },
    { id: 'critical', label: 'Critical', blurb: 'A few deep P0 journeys plus navigation.' },
    { id: 'standard', label: 'Standard', blurb: 'The important user flows — still few, deep tests.' },
    { id: 'deep', label: 'Deep', blurb: 'Broader coverage of flows. More tests.' },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.targetId = id; this.load(); }
  }

  load(): void {
    this.loading = true;
    this.svc.getTarget(this.targetId).subscribe({
      next: (t) => { this.target = t; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.svc.listRuns(this.targetId).subscribe({ next: ({ runs }) => { this.runs = runs.slice(0, 10); } });
  }

  get coverage(): CoverageLevel { return this.target?.coverage ?? 'minimal'; }
  get tests(): TargetTest[] { return this.target?.tests ?? []; }
  get enabledCount(): number { return this.tests.filter(t => t.enabled).length; }

  setCoverage(c: CoverageLevel): void {
    if (this.busy || c === this.coverage) return;
    this.busy = true;
    this.svc.updateTarget(this.targetId, { coverage: c }).subscribe({
      next: (t) => { this.target = t; this.busy = false; },
      error: () => { this.busy = false; },
    });
  }

  regenerate(): void {
    if (!confirm('Regenerate the test suite on the next run? Current generated tests will be replaced.')) return;
    this.busy = true;
    this.svc.regenerate(this.targetId).subscribe({
      next: () => { this.busy = false; this.load(); },
      error: () => { this.busy = false; },
    });
  }

  removeTest(t: TargetTest): void {
    if (!confirm(`Delete test "${t.title}"? Future runs will skip it.`)) return;
    this.svc.deleteTest(this.targetId, t.id).subscribe({ next: () => this.load() });
  }

  runNow(): void {
    this.busy = true;
    this.svc.createRun(this.targetId).subscribe({
      next: ({ run_id }) => { this.busy = false; void this.router.navigate(['/autopilot/run', run_id]); },
      error: (err: unknown) => {
        this.busy = false;
        alert((err as { error?: { error?: string } })?.error?.error ?? 'Could not start run.');
      },
    });
  }

  statusClass(s?: string): string {
    if (!s) return '';
    if (s === 'done') return 'ok';
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
