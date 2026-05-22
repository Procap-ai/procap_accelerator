import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { CreateJobRequest, InputType, ProcapLimits, ProcapService } from '../../services/procap.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent {
  private readonly procapService = inject(ProcapService);
  private readonly router = inject(Router);

  readonly logoUrl = 'https://framerusercontent.com/images/O6vOCZlrgab4i9yukLuUTBWzZ3w.png';

  activeTab: InputType = 'url';
  limits: ProcapLimits | null = null;
  websiteUrl = '';
  githubUrl = '';
  notes = '';
  selectedFile: File | null = null;
  isSubmitting = false;
  isDragOver = false;
  errorMessage = '';

  constructor() {
    this.loadLimits();
  }

  get remaining(): number | null {
    return this.limits?.remaining ?? null;
  }

  get usageLabel(): string {
    return `${this.limits?.remaining ?? '—'} of ${this.limits?.total ?? 10} free analyses remaining today`;
  }

  get submitLabel(): string {
    if (this.isSubmitting) {
      return 'Analyzing...';
    }

    if (this.remaining === 0) {
      return 'Daily limit reached';
    }

    return 'Run AI Analysis →';
  }

  get submitDisabled(): boolean {
    return this.isSubmitting || this.remaining === 0;
  }

  setTab(tab: InputType): void {
    this.activeTab = tab;
    this.errorMessage = '';
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.setSelectedFile(input?.files?.[0] ?? null);
  }

  handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    this.setSelectedFile(event.dataTransfer?.files?.[0] ?? null);
  }

  clearFile(): void {
    this.selectedFile = null;
  }

  submit(): void {
    this.errorMessage = '';

    if (this.submitDisabled) {
      return;
    }

    const request = this.buildRequest();

    if (!request) {
      return;
    }

    const target = request.url ?? request.githubUrl ?? request.file?.name ?? '';

    this.isSubmitting = true;
    this.procapService
      .createJob(request)
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: ({ job_id }) => {
          void this.router.navigate(['/job', job_id], {
            queryParams: target ? { target } : undefined
          });
        },
        error: (error: unknown) => {
          this.errorMessage = this.getErrorMessage(error);
        }
      });
  }

  private loadLimits(): void {
    this.procapService.getLimits().subscribe({
      next: (limits) => {
        this.limits = limits;
      },
      error: () => {
        this.limits = null;
      }
    });
  }

  private buildRequest(): CreateJobRequest | null {
    const notes = this.notes.trim();

    switch (this.activeTab) {
      case 'url': {
        const url = this.websiteUrl.trim();
        if (!this.isValidHttpUrl(url)) {
          this.errorMessage = 'Enter a valid website URL.';
          return null;
        }

        return {
          inputType: 'url',
          url,
          notes: notes || undefined
        };
      }
      case 'github': {
        const githubUrl = this.githubUrl.trim();
        if (!this.isValidHttpUrl(githubUrl) || !githubUrl.includes('github.com/')) {
          this.errorMessage = 'Enter a valid GitHub repository URL.';
          return null;
        }

        return {
          inputType: 'github',
          githubUrl,
          notes: notes || undefined
        };
      }
      case 'zip': {
        if (!this.selectedFile) {
          this.errorMessage = 'Upload a .zip file containing Selenium tests.';
          return null;
        }

        return {
          inputType: 'zip',
          file: this.selectedFile,
          notes: notes || undefined
        };
      }
      default:
        return null;
    }
  }

  private setSelectedFile(file: File | null): void {
    if (!file) {
      this.selectedFile = null;
      return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      this.errorMessage = 'Upload a .zip file containing Selenium tests.';
      return;
    }

    this.errorMessage = '';
    this.selectedFile = file;
  }

  private isValidHttpUrl(value: string): boolean {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
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
        'Something went wrong while creating the analysis job.'
      );
    }

    return 'Something went wrong while creating the analysis job.';
  }
}
