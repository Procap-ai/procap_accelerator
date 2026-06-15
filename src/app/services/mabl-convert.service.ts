import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';

export interface ConvertJobProgressEntry {
  ts: number;
  msg: string;
  screenshot?: string;
  source?: 'agent' | 'system';
  analysis_update?: string;
  /** Event metadata from the agent's progress/ folder */
  type?: 'step' | 'mcp_request' | 'mcp_response' | 'validate' | 'info' | 'done' | 'error';
  title?: string;
  tool?: string;
  call?: number;
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

export interface MablKeyValidation {
  valid: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class MablConvertService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.procap.ai';

  validateKeys(apiKey: string, workspaceId: string): Observable<MablKeyValidation> {
    const form = new FormData();
    form.append('api_key', apiKey.trim());
    if (workspaceId.trim()) form.append('workspace_id', workspaceId.trim());
    return this.http.post<MablKeyValidation>(`${this.apiBase}/mabl-convert/validate-keys`, form);
  }

  /** Two-step upload: get presigned S3 URL → PUT file to S3 → create job */
  createJob(seleniumZip: File, mablApiKey: string, workspaceId: string): Observable<{ job_id: string }> {
    const urlForm = new FormData();
    urlForm.append('filename', seleniumZip.name);

    return this.http
      .post<{ upload_url: string; s3_key: string }>(
        `${this.apiBase}/mabl-convert/upload-url`,
        urlForm
      )
      .pipe(
        switchMap(({ upload_url, s3_key }) =>
          from(
            fetch(upload_url, { method: 'PUT', body: seleniumZip }).then(res => {
              if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
              return s3_key;
            })
          ).pipe(
            switchMap(key => {
              const jobForm = new FormData();
              jobForm.append('s3_key', key);
              jobForm.append('filename', seleniumZip.name);
              if (mablApiKey.trim()) jobForm.append('mabl_api_key', mablApiKey.trim());
              if (workspaceId.trim()) jobForm.append('workspace_id', workspaceId.trim());
              return this.http.post<{ job_id: string }>(
                `${this.apiBase}/mabl-convert/jobs`,
                jobForm
              );
            })
          )
        )
      );
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
