import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';

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
  readonly apiBase = 'https://api.procap.ai';

  /** Two-step upload: get presigned S3 URL → PUT file to S3 → create job */
  createJob(seleniumZip: File): Observable<{ job_id: string }> {
    const urlForm = new FormData();
    urlForm.append('filename', seleniumZip.name);

    return this.http
      .post<{ upload_url: string; s3_key: string }>(
        `${this.apiBase}/playwright-convert/upload-url`,
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
              return this.http.post<{ job_id: string }>(
                `${this.apiBase}/playwright-convert/jobs`,
                jobForm
              );
            })
          )
        )
      );
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
