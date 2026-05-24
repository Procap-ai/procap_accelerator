import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  FindingsIssue,
  JobFindings,
  JobProgressEntry,
  ProcapJobResults,
  ProcapJobStatus,
  ProcapService,
} from '../../services/procap.service';

@Component({
  selector: 'app-job',
  imports: [CommonModule, RouterModule],
  templateUrl: './job.html',
  styleUrl: './job.scss'
})
export class JobComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(ProcapService);
  private readonly subs = new Subscription();

  jobId = '';
  status: ProcapJobStatus | null = null;
  results: ProcapJobResults | null = null;
  targetUrl = '';
  instructions = '';
  isLoading = true;
  errorMessage = '';
  copied = false;

  private polling?: Subscription;
  private copyTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.subs.add(
      this.route.queryParamMap.subscribe((p) => {
        this.targetUrl = p.get('target') || '';
      })
    );
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
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }

  get isRunning(): boolean {
    return this.status?.status === 'pending' || this.status?.status === 'running';
  }

  get isDone(): boolean {
    return this.status?.status === 'done';
  }

  get isFailed(): boolean {
    return this.status?.status === 'failed';
  }

  get findings(): JobFindings | null {
    return this.results?.findings ?? null;
  }

  get issues(): FindingsIssue[] {
    return this.findings?.issues ?? [];
  }

  get positives(): string[] {
    return this.findings?.positives ?? [];
  }

  get summary(): string {
    return this.findings?.summary?.trim() ?? '';
  }

  get instructionsSummary(): string {
    return this.findings?.instructions_summary?.trim() ?? '';
  }

  get liveAnalysis(): string {
    const entries = this.progressEntries;
    // Latest analysis_update from agent, or summary when done
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].analysis_update) return entries[i].analysis_update!;
    }
    return this.summary;
  }

  get progressEntries(): JobProgressEntry[] {
    return this.status?.progress ?? [];
  }

  get worklogEntries(): JobProgressEntry[] {
    // Show entries that have a meaningful msg (exclude analysis_update-only entries)
    return this.progressEntries.filter(e => e.msg && e.msg.trim().length > 0);
  }

  get highIssueCount(): number {
    return this.issues.filter(i => i.severity === 'high').length;
  }

  get mediumIssueCount(): number {
    return this.issues.filter(i => i.severity === 'medium').length;
  }

  get shareUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${window.location.pathname}#/job/${this.jobId}`;
  }

  displayUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  captureUrl(filename: string): string {
    return this.svc.getCaptureUrl(this.jobId, filename);
  }

  severityClass(severity: string): string {
    return `severity-${severity}`;
  }

  issueTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      bug: '🐛',
      ux: '🎨',
      content: '📝',
      performance: '⚡',
    };
    return icons[type] ?? '⚠️';
  }

  formatTime(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  copyLink(): void {
    const url = this.shareUrl;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => this.markCopied()).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.markCopied();
    }
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }

  private markCopied(): void {
    this.copied = true;
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => (this.copied = false), 2000);
  }

  private startPolling(): void {
    this.stopPolling();
    this.status = null;
    this.results = null;
    this.isLoading = true;
    this.errorMessage = '';

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

  private handleUpdate(job: ProcapJobStatus): void {
    this.status = job;
    if (job.url && !this.targetUrl) this.targetUrl = job.url;
    if (job.instructions && !this.instructions) this.instructions = job.instructions;
    this.isLoading = false;

    if (job.status === 'failed') {
      this.errorMessage = job.error ?? 'Analysis failed.';
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
}
