import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  ConvertJobProgressEntry,
  ConvertJobResults,
  ConvertJobStatus,
  MablConvertService,
} from '../../services/mabl-convert.service';

type PipelineStepStatus = 'pending' | 'active' | 'done' | 'failed';

interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: PipelineStepStatus;
}

@Component({
  selector: 'app-convert-job',
  imports: [CommonModule, RouterModule],
  templateUrl: './convert-job.html',
  styleUrl: './convert-job.scss'
})
export class ConvertJobComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(MablConvertService);
  private readonly subs = new Subscription();

  jobId = '';
  status: ConvertJobStatus | null = null;
  results: ConvertJobResults | null = null;
  isLoading = true;
  errorMessage = '';

  private polling?: Subscription;

  pipeline: PipelineStep[] = [
    { id: 'analyse',  label: 'Analyse Selenium', icon: '📋', status: 'pending' },
    { id: 'intent',   label: 'Build Test Intent', icon: '🎯', status: 'pending' },
    { id: 'authoring', label: 'mabl Authoring', icon: '🤖', status: 'pending' },
    { id: 'results',  label: 'Write Results', icon: '✅', status: 'pending' },
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

  get isDone(): boolean {
    return this.status?.status === 'done';
  }

  get isFailed(): boolean {
    return this.status?.status === 'failed';
  }

  get progressEntries(): ConvertJobProgressEntry[] {
    return this.status?.progress ?? [];
  }

  get worklogEntries(): ConvertJobProgressEntry[] {
    return this.progressEntries.filter(e => e.msg && e.msg.trim().length > 0);
  }

  get liveAnalysis(): string {
    const entries = this.progressEntries;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].analysis_update) return entries[i].analysis_update!;
    }
    return '';
  }

  get downloadUrl(): string {
    return this.svc.getDownloadUrl(this.jobId);
  }

  get mablTestUrl(): string {
    return this.results?.mabl_test_url ?? '';
  }

  captureUrl(filename: string): string {
    return this.svc.getCaptureUrl(this.jobId, filename);
  }

  formatTime(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }

  private startPolling(): void {
    this.stopPolling();
    this.status = null;
    this.results = null;
    this.isLoading = true;
    this.errorMessage = '';
    this.resetPipeline();

    this.polling = timer(0, 3000)
      .pipe(switchMap(() => this.svc.getJob(this.jobId)))
      .subscribe({
        next: (job) => this.handleUpdate(job),
        error: () => {
          this.errorMessage = 'Could not load job status.';
          this.isLoading = false;
          this.stopPolling();
        }
      });
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = undefined;
  }

  private handleUpdate(job: ConvertJobStatus): void {
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

  private resetPipeline(): void {
    this.pipeline.forEach(s => (s.status = 'pending'));
  }

  private updatePipeline(job: ConvertJobStatus): void {
    const msgs = job.progress.map(e => e.msg.toLowerCase());
    const hasMsg = (kw: string) => msgs.some(m => m.includes(kw));

    const analysed  = hasMsg('step 1') || hasMsg('found') && hasMsg('unique test') || hasMsg('analysed selenium');
    const intent    = hasMsg('step 2') || hasMsg('mabl authoring initiated') || hasMsg('authoring_plan');
    const authoring = hasMsg('mabl authoring') && (hasMsg('in progress') || hasMsg('created') || hasMsg('initiated'));
    const resultsDone = hasMsg('step 3') || hasMsg('conversion_results') || hasMsg('conversion complete');

    if (job.status === 'failed') {
      this.pipeline.forEach(s => { if (s.status === 'active') s.status = 'failed'; });
      return;
    }

    if (resultsDone || job.status === 'done') {
      this.pipeline.forEach(s => { if (s.status !== 'failed') s.status = 'done'; });
    } else if (authoring) {
      this.setStep('analyse',  'done');
      this.setStep('intent',   'done');
      this.setStep('authoring','done');
      this.setStep('results',  'active');
    } else if (intent) {
      this.setStep('analyse',  'done');
      this.setStep('intent',   'done');
      this.setStep('authoring','active');
      this.setStep('results',  'pending');
    } else if (analysed) {
      this.setStep('analyse',  'done');
      this.setStep('intent',   'active');
      this.setStep('authoring','pending');
      this.setStep('results',  'pending');
    } else if (job.status === 'running') {
      this.setStep('analyse',  'active');
      this.setStep('intent',   'pending');
      this.setStep('authoring','pending');
      this.setStep('results',  'pending');
    }
  }

  private setStep(id: string, status: PipelineStepStatus): void {
    const step = this.pipeline.find(s => s.id === id);
    if (step) step.status = status;
  }
}
