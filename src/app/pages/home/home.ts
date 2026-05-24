import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ProcapLimits, ProcapService } from '../../services/procap.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent implements OnInit {
  private readonly procapService = inject(ProcapService);
  private readonly router = inject(Router);

  url = '';
  instructions = '';
  isSubmitting = false;
  errorMessage = '';
  limits: ProcapLimits | null = null;
  showInstructions = false;

  ngOnInit(): void {
    this.procapService.getLimits().subscribe({
      next: (l) => (this.limits = l),
      error: () => {}
    });
  }

  get remaining(): number {
    return this.limits?.remaining ?? 20;
  }

  get usageText(): string {
    if (!this.limits) return '';
    return `${this.limits.remaining} of ${this.limits.total} free tests remaining today`;
  }

  submit(): void {
    const url = this.url.trim();
    if (!url) {
      this.errorMessage = 'Please enter a URL to test.';
      return;
    }
    this.errorMessage = '';
    this.isSubmitting = true;

    this.procapService.createJob(url, this.instructions.trim()).subscribe({
      next: ({ job_id }) => {
        void this.router.navigate(['/job', job_id], {
          queryParams: { target: url }
        });
      },
      error: (err: unknown) => {
        const detail = (err as { error?: { detail?: string } })?.error?.detail;
        this.errorMessage = detail ?? 'Failed to start analysis. Please try again.';
        this.isSubmitting = false;
      }
    });
  }
}
