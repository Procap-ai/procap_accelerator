import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  PwConvertJobStatus,
  PwConvertJobResults,
  PwConvertProgressEntry,
  PlaywrightConvertService,
} from '../../services/playwright-convert.service';

type PipelineStepStatus = 'pending' | 'active' | 'done' | 'failed';

interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: PipelineStepStatus;
}

@Component({
  selector: 'app-playwright-convert-job',
  imports: [CommonModule, RouterModule],
  templateUrl: './playwright-convert-job.html',
  styleUrl: './playwright-convert-job.scss'
})
export class PlaywrightConvertJobComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(PlaywrightConvertService);
  private readonly subs = new Subscription();

  jobId = '';
  status: PwConvertJobStatus | null = null;
  results: PwConvertJobResults | null = null;
  isLoading = true;
  errorMessage = '';

  private polling?: Subscription;

  pipeline: PipelineStep[] = [
    { id: 'analyse', label: 'Analyse Selenium', icon: '📋', status: 'pending' },
    { id: 'setup', label: 'Setup Playwright Project', icon: '🔧', status: 'pending' },
    { id: 'convert', label: 'Convert & Run Tests', icon: '🔄', status: 'pending' },
    { id: 'zip', label: 'Package ZIP', icon: '📦', status: 'pending' },
  ];

  ngOnInit(): void {
    this.subs.add(
      this.route.paramMap.subscribe((p) => {
        const id = p.get('id');
        if (id && id !== this.jobId) {
          this.jobId = id;
          this.startPolling();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.subs.unsubscribe();
  }

  get isRunning(): boolean {
    return this.status?.status === 'pending' || this.status?.status === 'running' || this.status?.status === 'queued';
  }

  get isDone(): boolean { return this.status?.status === 'done'; }
  get isFailed(): boolean { return this.status?.status === 'failed'; }

  get progressEntries(): PwConvertProgressEntry[] { return this.status?.progress ?? []; }

  get worklogEntries(): PwConvertProgressEntry[] {
    return this.progressEntries.filter(e => e.msg && e.msg.trim().length > 0);
  }

  get liveAnalysis(): string {
    const entries = this.progressEntries;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].analysis_update) return entries[i].analysis_update!;
    }
    return '';
  }

  get downloadUrl(): string { return this.svc.getDownloadUrl(this.jobId); }

  captureUrl(filename: string): string { return this.svc.getCaptureUrl(this.jobId, filename); }

  formatTime(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  goHome(): void { void this.router.navigate(['/']); }

  private startPolling(): void {
    this.stopPolling();
    this.status = null; this.results = null;
    this.isLoading = true; this.errorMessage = '';
    this.resetPipeline();

    this.polling = timer(0, 3000)
      .pipe(switchMap(() => this.svc.getJob(this.jobId)))
      .subscribe({
        next: (job) => this.handleUpdate(job),
        error: () => { this.errorMessage = 'Could not load job status.'; this.isLoading = false; this.stopPolling(); }
      });
  }

  private stopPolling(): void { this.polling?.unsubscribe(); this.polling = undefined; }

  private handleUpdate(job: PwConvertJobStatus): void {
    this.status = job;
    this.isLoading = false;
    this.updatePipeline(job);

    if (job.status === 'failed') {
      this.errorMessage = job.error ?? 'Conversion failed.';
      this.stopPolling();
      return;
    }
    if (job.status === 'done') {
      this.stopPolling();
      this.svc.getJobResults(this.jobId).subscribe({
        next: (r) => (this.results = r),
        error: () => (this.errorMessage = 'Could not load results.')
      });
    }
  }

  private resetPipeline(): void { this.pipeline.forEach(s => (s.status = 'pending')); }

  private updatePipeline(job: PwConvertJobStatus): void {
    const msgs = job.progress.map(e => e.msg.toLowerCase());
    const hasMsg = (kw: string) => msgs.some(m => m.includes(kw));

    const analysed = hasMsg('step 1');
    const setup = hasMsg('step 2') || hasMsg('playwright project created');
    const converting = hasMsg('step 3') || hasMsg('convert') || hasMsg('running test');
    const zipped = hasMsg('step 4') || hasMsg('playwright_tests.zip') || hasMsg('package');

    if (job.status === 'failed') {
      this.pipeline.forEach(s => { if (s.status === 'active') s.status = 'failed'; });
      return;
    }
    if (job.status === 'done') {
      this.pipeline.forEach(s => { if (s.status !== 'failed') s.status = 'done'; });
      return;
    }
    if (zipped) {
      this.setStep('analyse', 'done'); this.setStep('setup', 'done');
      this.setStep('convert', 'done'); this.setStep('zip', 'active');
    } else if (converting) {
      this.setStep('analyse', 'done'); this.setStep('setup', 'done');
      this.setStep('convert', 'active'); this.setStep('zip', 'pending');
    } else if (setup) {
      this.setStep('analyse', 'done'); this.setStep('setup', 'done');
      this.setStep('convert', 'active'); this.setStep('zip', 'pending');
    } else if (analysed) {
      this.setStep('analyse', 'done'); this.setStep('setup', 'active');
      this.setStep('convert', 'pending'); this.setStep('zip', 'pending');
    } else if (job.status === 'running') {
      this.setStep('analyse', 'active');
      this.setStep('setup', 'pending'); this.setStep('convert', 'pending'); this.setStep('zip', 'pending');
    }
  }

  private setStep(id: string, status: PipelineStepStatus): void {
    const step = this.pipeline.find(s => s.id === id);
    if (step) step.status = status;
  }
}
