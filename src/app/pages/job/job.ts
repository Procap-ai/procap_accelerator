import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AnalysisPage, JobProgressEntry, ProcapJobResults, ProcapJobStatus, ProcapService } from '../../services/procap.service';

type ResultTab = 'analysis' | 'playwright' | 'mabl';
type CodeLanguage = 'typescript' | 'shell';

interface DisplayPage {
  title: string;
  url: string;
  bugs: string[];
  improvements: string[];
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
  private readonly sanitizer = inject(DomSanitizer);
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
  playwrightMarkup: SafeHtml | null = null;
  mablMarkup: SafeHtml | null = null;
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

    return [
      {
        ts: '',
        msg: 'Waiting for the AI pipeline to start...'
      }
    ];
  }

  get currentStepIndex(): number {
    if (this.jobStatus?.status === 'done') {
      return 3;
    }

    const messages = this.progressEntries.map((entry) => entry.msg.toLowerCase());

    if (messages.some((message) => /(generat|playwright|mabl|script|summary|compose|final)/.test(message))) {
      return 2;
    }

    if (messages.some((message) => /(browse|crawl|scan|page|visit|navigate|collect|screenshot)/.test(message))) {
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
    return this.jobResults?.analysis?.summary?.trim() || 'The AI summary will appear here once the analysis completes.';
  }

  get shareUrl(): string {
    return `${window.location.origin}${window.location.pathname}#/job/${this.jobId}`;
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
    if (message.startsWith('✅')) {
      return '✅';
    }

    if (message.startsWith('❌') || /error|failed/i.test(message)) {
      return '❌';
    }

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

  copyJobLink(): void {
    this.copyText(this.shareUrl, 'job-link');
  }

  copyCode(kind: 'playwright' | 'mabl'): void {
    const content = kind === 'playwright' ? this.jobResults?.playwright_test ?? '' : this.jobResults?.mabl_script ?? '';
    this.copyText(content, kind);
  }

  downloadCode(filename: string, content: string): void {
    if (!content) {
      return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  retry(): void {
    void this.router.navigate(['/']);
  }

  screenshotUrl(pageUrl: string): string {
    return `https://image.thum.io/get/width/1280/${encodeURIComponent(pageUrl)}`;
  }

  private startPolling(): void {
    this.stopPolling();
    this.jobStatus = null;
    this.jobResults = null;
    this.analysisPages = [];
    this.playwrightMarkup = null;
    this.mablMarkup = null;
    this.errorMessage = '';
    this.isLoading = true;

    this.pollingSubscription = timer(0, 3000)
      .pipe(switchMap(() => this.procapService.getJob(this.jobId)))
      .subscribe({
        next: (job) => {
          this.handleJobUpdate(job);
        },
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
    progress.sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());

    this.jobStatus = {
      ...job,
      progress
    };
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
        this.playwrightMarkup = this.renderCode(results.playwright_test ?? '', 'typescript');
        this.mablMarkup = this.renderCode(results.mabl_script ?? '', 'shell');
      },
      error: (error: unknown) => {
        this.errorMessage = this.getErrorMessage(error);
      }
    });
  }

  private normalizePages(pages: AnalysisPage[]): DisplayPage[] {
    return pages.map((page, index) => {
      const url = (page.page_url ?? page.url ?? this.jobResults?.target_url ?? '').trim();

      return {
        title: page.title?.trim() || `Page ${index + 1}`,
        url,
        bugs: this.toStringArray(page.bugs),
        improvements: this.toStringArray(page.improvements)
      };
    });
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  private resolveTarget(): string {
    const fromQuery = this.route.snapshot.queryParamMap.get('target');
    if (fromQuery) {
      return fromQuery;
    }

    const fromResults = this.jobResults?.target_url?.trim();
    if (fromResults) {
      return fromResults;
    }

    for (const entry of this.jobStatus?.progress ?? []) {
      const extracted = this.extractUrl(entry.msg);
      if (extracted) {
        return extracted;
      }
    }

    return this.displayTarget;
  }

  private extractUrl(value: string): string | null {
    const match = value.match(/https?:\/\/[^\s)]+/);
    return match ? match[0].replace(/[.,;:)]*$/, '') : null;
  }

  private copyText(text: string, key: string): void {
    if (!text) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
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
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
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

  private renderCode(content: string, language: CodeLanguage): SafeHtml {
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const markup = lines
      .map((line) => `<span class="code-line">${this.highlightLine(line, language)}</span>`)
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(markup);
  }

  private highlightLine(line: string, language: CodeLanguage): string {
    if (!line) {
      return '&nbsp;';
    }

    let escaped = this.escapeHtml(line);
    const placeholders: string[] = [];
    const stringPattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
    const commentPattern = language === 'shell' ? /(^\s*#.*$|\s#.*$)/g : /(\/\/.*$)/g;
    const keywordPattern =
      language === 'shell'
        ? /\b(if|then|fi|for|do|done|echo|export|curl|chmod|bash|sh|set|mkdir|cat)\b/g
        : /\b(import|from|export|const|let|var|function|return|await|async|if|else|for|while|try|catch|throw|new|class|interface|type|describe|test|expect|page)\b/g;

    escaped = escaped.replace(stringPattern, (match) => this.capturePlaceholder(placeholders, match, 'string'));
    escaped = escaped.replace(commentPattern, (match) => this.capturePlaceholder(placeholders, match, 'comment'));
    escaped = escaped.replace(keywordPattern, '<span class="token keyword">$1</span>');
    escaped = escaped.replace(/\b(\d+)\b/g, '<span class="token number">$1</span>');

    return placeholders.reduce(
      (currentLine, token, index) => currentLine.replace(`__TOKEN_${index}__`, token),
      escaped
    );
  }

  private capturePlaceholder(placeholders: string[], content: string, className: string): string {
    const placeholder = `__TOKEN_${placeholders.length}__`;
    placeholders.push(`<span class="token ${className}">${content}</span>`);
    return placeholder;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
