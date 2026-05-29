import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { MablConvertService } from '../../services/mabl-convert.service';

@Component({
  selector: 'app-convert-home',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './convert-home.html',
  styleUrl: './convert-home.scss'
})
export class ConvertHomeComponent {
  private readonly svc = inject(MablConvertService);
  private readonly router = inject(Router);

  selectedFile: File | null = null;
  mablApiKey = '';
  workspaceId = '';
  isSubmitting = false;
  errorMessage = '';

  // mabl key validation state
  isValidatingKeys = false;
  keysValidated = false;
  keysValidationError = '';
  validatedWorkspaceName = '';

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

  onMablKeyChange(): void {
    this.keysValidated = false;
    this.keysValidationError = '';
    this.validatedWorkspaceName = '';
  }

  get mablKeysEntered(): boolean {
    return !!(this.mablApiKey.trim() && this.workspaceId.trim());
  }

  get canSubmit(): boolean {
    if (!this.selectedFile) return false;
    if (!this.keysValidated) return false;
    return true;
  }

  validateMablKeys(): void {
    if (!this.mablApiKey.trim() || !this.workspaceId.trim()) {
      this.keysValidationError = 'Enter both the API key and Workspace ID to validate.';
      return;
    }
    this.isValidatingKeys = true;
    this.keysValidated = false;
    this.keysValidationError = '';

    this.svc.validateKeys(this.mablApiKey, this.workspaceId).subscribe({
      next: (res) => {
        this.isValidatingKeys = false;
        if (res.valid) {
          this.keysValidated = true;
          this.keysValidationError = '';
        } else {
          this.keysValidationError = res.message || 'Validation failed. Check your keys.';
        }
      },
      error: () => {
        this.isValidatingKeys = false;
        this.keysValidationError = 'Could not reach validation service. Try again.';
      }
    });
  }

  submit(): void {
    if (!this.selectedFile) {
      this.errorMessage = 'Please select a Selenium project ZIP file.';
      return;
    }
    if (this.mablApiKey.trim() && !this.keysValidated) {
      this.errorMessage = 'Please validate your mabl API keys before converting.';
      return;
    }
    this.errorMessage = '';
    this.isSubmitting = true;

    this.svc.createJob(this.selectedFile, this.mablApiKey, this.workspaceId).subscribe({
      next: ({ job_id }) => {
        try {
  const stored = localStorage.getItem('procap_past_runs');
  const runs = stored ? JSON.parse(stored) : [];
  runs.push({
    jobId: job_id, mode: 'mabl',
    filename: this.selectedFile!.name,
    ts: Date.now(),
    route: `/mabl-convert/job/${job_id}`,
  });
  localStorage.setItem('procap_past_runs', JSON.stringify(runs.slice(-20)));
} catch { /* ignore */ }
void this.router.navigate(['/mabl-convert/job', job_id]);
      },
      error: (err: unknown) => {
        const detail = (err as { error?: { detail?: string } })?.error?.detail;
        this.errorMessage = detail ?? 'Failed to start conversion. Please try again.';
        this.isSubmitting = false;
      }
    });
  }
}
