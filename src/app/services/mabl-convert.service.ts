import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ConvertJobProgressEntry {
  ts: number;
  msg: string;
  screenshot?: string;
  source?: 'agent' | 'system';
  analysis_update?: string;
}

export interface ConvertJobStatus {
  job_id: string;
  status: 'pending' | 'queued' | 'running' | 'done' | 'failed';
  selenium_zip_filename: string;
  created_at: number;
  updated_at: number;
  progress: ConvertJobProgressEntry[];
  error?: string;
}

export interface ConvertJobResults {
  job_id: string;
  status: string;
  playwright_zip_path: string;
  mabl_test_id: string;
  mabl_test_url: string;
}

@Injectable({ providedIn: 'root' })
export class MablConvertService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.lokaai.in';

  createJob(seleniumZip: File, mablApiKey: string, workspaceId: string): Observable<{ job_id: string }> {
    const form = new FormData();
    form.append('selenium_zip', seleniumZip, seleniumZip.name);
    if (mablApiKey.trim()) form.append('mabl_api_key', mablApiKey.trim());
    if (workspaceId.trim()) form.append('workspace_id', workspaceId.trim());
    return this.http.post<{ job_id: string }>(`${this.apiBase}/mabl-convert/jobs`, form);
  }

  getJob(jobId: string): Observable<ConvertJobStatus> {
    return this.http.get<ConvertJobStatus>(`${this.apiBase}/mabl-convert/jobs/${jobId}`);
  }

  getJobResults(jobId: string): Observable<ConvertJobResults> {
    return this.http.get<ConvertJobResults>(`${this.apiBase}/mabl-convert/jobs/${jobId}/results`);
  }

  getDownloadUrl(jobId: string): string {
    return `${this.apiBase}/mabl-convert/jobs/${jobId}/download`;
  }

  getCaptureUrl(jobId: string, filename: string): string {
    return `${this.apiBase}/mabl-convert/jobs/${jobId}/capture/${filename}`;
  }
}
