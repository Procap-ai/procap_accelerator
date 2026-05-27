import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MablConvertService } from '../../services/mabl-convert.service';

@Component({
  selector: 'app-convert-home',
  imports: [CommonModule, FormsModule],
  templateUrl: './convert-home.html',
  styleUrl: './convert-home.scss'
})
export class ConvertHomeComponent {
  private readonly svc = inject(MablConvertService);
  private readonly router = inject(Router);

  selectedFile: File | null = null;
  mablApiKey = '';
  workspaceId = '';
  showMablConfig = false;
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

    this.svc.createJob(this.selectedFile, this.mablApiKey, this.workspaceId).subscribe({
      next: ({ job_id }) => {
        void this.router.navigate(['/convert/job', job_id]);
      },
      error: (err: unknown) => {
        const detail = (err as { error?: { detail?: string } })?.error?.detail;
        this.errorMessage = detail ?? 'Failed to start conversion. Please try again.';
        this.isSubmitting = false;
      }
    });
  }
}
