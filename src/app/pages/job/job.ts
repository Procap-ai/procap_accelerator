import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AnalysisPage, JobProgressEntry, ProcapJobResults, ProcapJobStatus, ProcapService } from '../../services/procap.service';

type ResultTab = 'analysis' | 'playwright' | 'mabl';

interface DisplayPage {
  title: string;
  url: string;
  aesthetic_score: number;
  positives: string[];
  bugs: string[];
  improvements: string[];
  isDynamicState: boolean;
}

@Component({
  selector: 'app-job',
  imports: [CommonModule],
  templateUrl: './job.html',
  styleUrl: './job.scss'
})
export class JobComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly procapService = inject(ProcapService);
  private readonly subscriptions = new Subscription();

  readonly logoUrl = 'https://framerusercontent.com/images/O6vOCZlrgab4i9yukLuUTBWzZ3w.png';
  readonly steps = ['Setup', 'Browsing', 'Generating', 'Done'];

  jobId = '';
  jobStatus: ProcapJobStatus | null = null;
  jobResults: ProcapJobResults | null = null;
  displayTarget = 'Preparing your target';
  activeResultTab: ResultTab = 'analysis';
  errorMessage = '';
  isLoading = true;
  analysisPages: DisplayPage[] = [];
  copiedKey: string | null = null;

  private pollingSubscription?: Subscription;
  private copyTimeoutHandle?: number;

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const target = params.get('target');
        if (target) {
          this.displayTarget = target;
        }
      })
    );

    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => {
        const id = params.get('id');
        if (!id || id === this.jobId) {
          return;
        }

        this.jobId = id;
        this.activeResultTab = 'analysis';
        this.startPolling();
      })
    );
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.subscriptions.unsubscribe();
    if (this.copyTimeoutHandle) {
      window.clearTimeout(this.copyTimeoutHandle);
    }
  }

  get progressEntries(): JobProgressEntry[] {
    if (this.jobStatus?.progress?.length) {
      return this.jobStatus.progress;
    }

    return [{ ts: '', msg: 'Waiting for the AI pipeline to start...' }];
  }

  get currentStepIndex(): number {
    if (this.jobStatus?.status === 'done') {
      return 3;
    }

    const messages = this.progressEntries.map((entry) => entry.msg.toLowerCase());

    if (messages.some((message) => /(generat|playwright|mabl|script|summary|compose|final|deliverable)/.test(message))) {
      return 2;
    }

    if (messages.some((message) => /(browse|crawl|scan|page|visit|navigate|collect|screenshot|inspecting|analyzing)/.test(message))) {
      return 1;
    }

    return 0;
  }

  get isFailed(): boolean {
    return this.jobStatus?.status === 'failed';
  }

  get hasResults(): boolean {
    return !!this.jobResults;
  }

  get analysisSummary(): string {
    return this.jobResults?.analysis?.summary?.trim() || '';
  }

  get shareUrl(): string {
    return `${window.location.origin}${window.location.pathname}#/job/${this.jobId}`;
  }

  get downloadUrl(): string {
    return this.procapService.getDownloadUrl(this.jobId);
  }

  get hasPlaywright(): boolean {
    return !!(this.jobResults?.playwright_test?.trim());
  }

  get hasMabl(): boolean {
    return !!(this.jobResults?.mabl_script?.trim());
  }

  setActiveTab(tab: ResultTab): void {
    this.activeResultTab = tab;
  }

  stepState(index: number): 'complete' | 'active' | 'idle' {
    if (this.jobStatus?.status === 'done') {
      return 'complete';
    }

    if (index < this.currentStepIndex) {
      return 'complete';
    }

    if (index === this.currentStepIndex) {
      return 'active';
    }

    return 'idle';
  }

  logIcon(message: string): string {
    if (message.startsWith('✅')) return '✅';
    if (message.startsWith('❌') || /error|failed/i.test(message)) return '❌';
    if (message.startsWith('⚠')) return '⚠️';
    const emojiMatch = message.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?)/u);
    return emojiMatch?.[1] ?? '▶';
  }

  logText(message: string): string {
    const icon = this.logIcon(message);
    if (message.startsWith(icon)) {
      return message.slice(icon.length).trim() || message;
    }
    return message;
  }

  screenshotUrl(pageUrl: string): string {
    return this.procapService.getScreenshotUrl(this.jobId, pageUrl);
  }

  copyJobLink(): void {
    this.copyText(this.shareUrl, 'job-link');
  }

  downloadResults(): void {
    const a = document.createElement('a');
    a.href = this.downloadUrl;
    a.download = `procap_results_${this.jobId.slice(0, 8)}.zip`;
    a.click();
  }

  retry(): void {
    void this.router.navigate(['/']);
  }

  private startPolling(): void {
    this.stopPolling();
    this.jobStatus = null;
    this.jobResults = null;
    this.analysisPages = [];
    this.errorMessage = '';
    this.isLoading = true;

    this.pollingSubscription = timer(0, 3000)
      .pipe(switchMap(() => this.procapService.getJob(this.jobId)))
      .subscribe({
        next: (job) => this.handleJobUpdate(job),
        error: (error: unknown) => {
          this.errorMessage = this.getErrorMessage(error);
          this.isLoading = false;
          this.stopPolling();
        }
      });
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = undefined;
  }

  private handleJobUpdate(job: ProcapJobStatus): void {
    const progress = Array.isArray(job.progress) ? [...job.progress] : [];
    progress.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    this.jobStatus = { ...job, progress };
    this.displayTarget = this.resolveTarget();
    this.isLoading = false;

    if (job.status === 'failed') {
      this.errorMessage = job.error ?? 'The analysis could not be completed.';
      this.stopPolling();
      return;
    }

    if (job.status === 'done') {
      this.stopPolling();
      this.loadResults();
    }
  }

  private loadResults(): void {
    this.procapService.getJobResults(this.jobId).subscribe({
      next: (results) => {
        this.jobResults = results;
        this.displayTarget = this.resolveTarget();
        this.analysisPages = this.normalizePages(results.analysis?.pages ?? []);
      },
      error: (error: unknown) => {
        this.errorMessage = this.getErrorMessage(error);
      }
    });
  }

  private normalizePages(pages: AnalysisPage[]): DisplayPage[] {
    const seenUrls = new Set<string>();
    return pages.map((page, index) => {
      const url = (page.page_url ?? page.url ?? this.jobResults?.target_url ?? '').trim();
      const isDynamicState = url !== '' && seenUrls.has(url);
      if (url) seenUrls.add(url);
      return {
        title: page.title?.trim() || `Page ${index + 1}`,
        url,
        aesthetic_score: typeof page.aesthetic_score === 'number' ? Math.min(10, Math.max(0, page.aesthetic_score)) : 0,
        positives: this.toStringArray(page.positives),
        bugs: this.toStringArray(page.bugs),
        improvements: this.toStringArray(page.improvements),
        isDynamicState
      };
    });
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private resolveTarget(): string {
    const fromQuery = this.route.snapshot.queryParamMap.get('target');
    if (fromQuery) return fromQuery;

    const fromResults = this.jobResults?.target_url?.trim();
    if (fromResults) return fromResults;

    for (const entry of this.jobStatus?.progress ?? []) {
      const extracted = this.extractUrl(entry.msg);
      if (extracted) return extracted;
    }

    return this.displayTarget;
  }

  private extractUrl(value: string): string | null {
    const match = value.match(/https?:\/\/[^\s)]+/);
    return match ? match[0].replace(/[.,;:)]*$/, '') : null;
  }

  private copyText(text: string, key: string): void {
    if (!text) return;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => this.markCopied(key))
        .catch(() => this.copyTextFallback(text, key));
      return;
    }

    this.copyTextFallback(text, key);
  }

  private copyTextFallback(text: string, key: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    this.markCopied(key);
  }

  private markCopied(key: string): void {
    this.copiedKey = key;
    if (this.copyTimeoutHandle) {
      window.clearTimeout(this.copyTimeoutHandle);
    }
    this.copyTimeoutHandle = window.setTimeout(() => {
      this.copiedKey = null;
    }, 1800);
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const candidate = error as {
        error?: { detail?: string; message?: string };
        message?: string;
      };
      return (
        candidate.error?.detail ??
        candidate.error?.message ??
        candidate.message ??
        'We could not load the selected job.'
      );
    }
    return 'We could not load the selected job.';
  }
}

