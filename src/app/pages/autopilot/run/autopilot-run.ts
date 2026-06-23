import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AutopilotService, AutopilotRun, ProgressEntry, Bug, TestResult } from '../../../services/autopilot.service';

interface Stage { id: string; label: string; icon: string; }

@Component({
  selector: 'app-autopilot-run',
  imports: [CommonModule, RouterModule],
  templateUrl: './autopilot-run.html',
  styleUrl: './autopilot-run.scss',
})
export class AutopilotRunComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(AutopilotService);

  runId = '';
  run: AutopilotRun | null = null;
  loading = true;
  errorMessage = '';
  private polling?: Subscription;

  // queued is shown as the entry point; cloning/exploring share a slot by kind
  readonly websiteStages: Stage[] = [
    { id: 'exploring', label: 'Explore', icon: '🧭' },
    { id: 'generating', label: 'Generate', icon: '✍️' },
    { id: 'installing', label: 'Install', icon: '📦' },
    { id: 'running', label: 'Run', icon: '▶️' },
    { id: 'triaging', label: 'Triage', icon: '🔎' },
  ];
  readonly repoStages: Stage[] = [
    { id: 'cloning', label: 'Clone', icon: '⬇️' },
    { id: 'installing', label: 'Install', icon: '📦' },
    { id: 'running', label: 'Run', icon: '▶️' },
    { id: 'triaging', label: 'Triage', icon: '🔎' },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.runId = id; this.startPolling(); }
  }
  ngOnDestroy(): void { this.polling?.unsubscribe(); }

  private startPolling(): void {
    this.polling = timer(0, 4000)
      .pipe(switchMap(() => this.svc.getRun(this.runId)))
      .subscribe({
        next: (r) => {
          this.run = r; this.loading = false;
          if (r.status === 'done' || r.status === 'failed') { this.polling?.unsubscribe(); }
        },
        error: () => { this.errorMessage = 'Could not load run.'; this.loading = false; this.polling?.unsubscribe(); },
      });
  }

  get stages(): Stage[] { return this.run?.kind === 'repo' ? this.repoStages : this.websiteStages; }
  get isRunning(): boolean { return !!this.run && !['done', 'failed'].includes(this.run.status); }
  get isDone(): boolean { return this.run?.status === 'done'; }
  get isFailed(): boolean { return this.run?.status === 'failed'; }

  private readonly order = ['queued', 'cloning', 'exploring', 'generating', 'installing', 'running', 'triaging', 'done'];
  stageState(stageId: string): 'pending' | 'active' | 'done' {
    if (!this.run) return 'pending';
    if (this.run.status === 'failed') return 'pending';
    const cur = this.order.indexOf(this.run.status);
    const at = this.order.indexOf(stageId);
    if (this.isDone || cur > at) return 'done';
    if (cur === at) return 'active';
    return 'pending';
  }

  // progress entries that carry a live screenshot → filmstrip
  get filmstrip(): ProgressEntry[] {
    return (this.run?.progress ?? []).filter(e => !!e.capture);
  }
  // human-readable log (newest last)
  get log(): ProgressEntry[] {
    return (this.run?.progress ?? []).filter(e => (e.title && e.title.trim()) || (e.msg && e.msg.trim()));
  }
  get bugs(): Bug[] { return this.run?.bugs ?? []; }
  get tests(): TestResult[] { return this.run?.tests ?? []; }

  testClass(s: string): string {
    if (s === 'passed') return 'pass';
    if (['failed', 'timedOut', 'interrupted'].includes(s)) return 'fail';
    if (s === 'flaky') return 'flaky';
    return 'skip';
  }

  logClass(e: ProgressEntry): string {
    switch (e.type) {
      case 'pass': return 'pass';
      case 'fail': case 'error': return 'fail';
      case 'stage': return 'stage';
      case 'warn': return 'warn';
      default: return '';
    }
  }
  sevClass(s?: string): string { return s === 'high' ? 'high' : s === 'low' ? 'low' : 'med'; }

  captureUrl(f?: string): string { return f ? this.svc.captureUrl(this.runId, f) : ''; }
  artifactUrl(f: string): string { return this.svc.artifactUrl(this.runId, f); }
}
