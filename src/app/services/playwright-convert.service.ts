import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface PwConvertProgressEntry {
  ts: number;
  msg: string;
  screenshot?: string;
  source?: 'agent' | 'system';
  analysis_update?: string;
}

export interface PwConvertJobStatus {
  job_id: string;
  status: 'pending' | 'queued' | 'running' | 'done' | 'failed';
  selenium_zip_filename: string;
  created_at: number;
  updated_at: number;
  progress: PwConvertProgressEntry[];
  error?: string;
}

export interface PwConvertJobResults {
  job_id: string;
  status: string;
  playwright_zip_path: string;
}

@Injectable({ providedIn: 'root' })
export class PlaywrightConvertService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.lokaai.in';

  createJob(seleniumZip: File): Observable<{ job_id: string }> {
    const form = new FormData();
    form.append('selenium_zip', seleniumZip, seleniumZip.name);
    return this.http.post<{ job_id: string }>(`${this.apiBase}/playwright-convert/jobs`, form);
  }

  getJob(jobId: string): Observable<PwConvertJobStatus> {
    return this.http.get<PwConvertJobStatus>(`${this.apiBase}/playwright-convert/jobs/${jobId}`);
  }

  getJobResults(jobId: string): Observable<PwConvertJobResults> {
    return this.http.get<PwConvertJobResults>(`${this.apiBase}/playwright-convert/jobs/${jobId}/results`);
  }

  getDownloadUrl(jobId: string): string {
    return `${this.apiBase}/playwright-convert/jobs/${jobId}/download`;
  }

  getCaptureUrl(jobId: string, filename: string): string {
    return `${this.apiBase}/playwright-convert/jobs/${jobId}/capture/${filename}`;
  }
}
