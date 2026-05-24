import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ProcapLimits {
  used: number;
  total: number;
  remaining: number;
}

export interface JobProgressEntry {
  ts: number;
  msg: string;
  screenshot?: string;
}

export interface FindingsIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  screenshot?: string;
}

export interface JobFindings {
  url: string;
  instructions_summary?: string;
  summary?: string;
  score?: number;
  issues?: FindingsIssue[];
  positives?: string[];
}

export interface ProcapJobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  url: string;
  instructions: string;
  progress: JobProgressEntry[];
  error?: string;
}

export interface ProcapJobResults {
  job_id: string;
  status: string;
  url: string;
  findings: JobFindings;
  playwright_test: string;
}

@Injectable({ providedIn: 'root' })
export class ProcapService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.lokaai.in';

  getLimits(): Observable<ProcapLimits> {
    return this.http.get<ProcapLimits>(`${this.apiBase}/procap/limits`);
  }

  createJob(url: string, instructions: string): Observable<{ job_id: string }> {
    return this.http.post<{ job_id: string }>(
      `${this.apiBase}/procap/jobs`,
      { url, instructions }
    );
  }

  getJob(jobId: string): Observable<ProcapJobStatus> {
    return this.http.get<ProcapJobStatus>(`${this.apiBase}/procap/jobs/${jobId}`);
  }

  getJobResults(jobId: string): Observable<ProcapJobResults> {
    return this.http.get<ProcapJobResults>(`${this.apiBase}/procap/jobs/${jobId}/results`);
  }

  getDownloadUrl(jobId: string): string {
    return `${this.apiBase}/procap/jobs/${jobId}/download`;
  }

  getCaptureUrl(jobId: string, filename: string): string {
    return `${this.apiBase}/procap/jobs/${jobId}/capture/${filename}`;
  }
}
