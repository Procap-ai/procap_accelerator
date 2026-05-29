import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { PlaywrightConvertService } from '../../services/playwright-convert.service';

interface PastRun {
  jobId: string;
  mode: 'playwright' | 'mabl';
  filename: string;
  ts: number;
  route: string;
}

@Component({
  selector: 'app-playwright-convert-home',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './playwright-convert-home.html',
  styleUrl: './playwright-convert-home.scss'
})
export class PlaywrightConvertHomeComponent {
  private readonly svc = inject(PlaywrightConvertService);
  private readonly router = inject(Router);

  selectedFile: File | null = null;
  isSubmitting = false;
  errorMessage = '';

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        this.errorMessage = 'Please select a .zip file containing your Selenium project.';
        this.selectedFile = null;
        return;
      }
      this.selectedFile = file;
      this.errorMessage = '';
    }
  }

  submit(): void {
    if (!this.selectedFile) {
      this.errorMessage = 'Please select a Selenium project ZIP file.';
      return;
    }
    this.errorMessage = '';
    this.isSubmitting = true;

    this.svc.createJob(this.selectedFile).subscribe({
      next: ({ job_id }) => {
        try {
          const stored = localStorage.getItem('procap_past_runs');
          const runs: PastRun[] = stored ? JSON.parse(stored) : [];
          runs.push({
            jobId: job_id,
            mode: 'playwright',
            filename: this.selectedFile!.name,
            ts: Date.now(),
            route: `/playwright-convert/job/${job_id}`,
          });
          localStorage.setItem('procap_past_runs', JSON.stringify(runs.slice(-20)));
        } catch { /* ignore */ }
        void this.router.navigate(['/playwright-convert/job', job_id]);
      },
      error: (err: unknown) => {
        const detail = (err as { error?: { detail?: string } })?.error?.detail;
        this.errorMessage = detail ?? 'Failed to start conversion. Please try again.';
        this.isSubmitting = false;
      }
    });
  }
}
