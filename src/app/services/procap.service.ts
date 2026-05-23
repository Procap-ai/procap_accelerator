import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type InputType = 'url' | 'github' | 'zip';

export interface ProcapLimits {
  used: number;
  total: number;
  remaining: number;
}

export interface CreateJobRequest {
  inputType: InputType;
  url?: string;
  githubUrl?: string;
  file?: File;
  credentials?: string;
  notes?: string;
}

export interface CreateJobResponse {
  job_id: string;
}

export interface JobProgressEntry {
  ts: string;
  msg: string;
}

export interface ProcapJobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: JobProgressEntry[];
  error?: string;
}

export interface AnalysisPage {
  title?: string;
  url?: string;
  page_url?: string;
  aesthetic_score?: number;
  screenshot_file?: string;
  positives?: unknown;
  bugs?: unknown;
  improvements?: unknown;
}

export interface AnalysisResult {
  summary?: string;
  pages?: AnalysisPage[];
}

export interface ProcapJobResults {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  target_url?: string;
  analysis: AnalysisResult;
  playwright_test: string;
  mabl_script: string;
}

@Injectable({ providedIn: 'root' })
export class ProcapService {
  private readonly http = inject(HttpClient);
  readonly apiBaseUrl = 'https://api.lokaai.in';

  getLimits(): Observable<ProcapLimits> {
    return this.http.get<ProcapLimits>(`${this.apiBaseUrl}/procap/limits`);
  }

  createJob(request: CreateJobRequest): Observable<CreateJobResponse> {
    const formData = new FormData();
    formData.append('input_type', request.inputType);

    if (request.url) {
      formData.append('url', request.url);
    }

    if (request.githubUrl) {
      formData.append('github_url', request.githubUrl);
    }

    if (request.file) {
      formData.append('file', request.file, request.file.name);
    }

    if (request.credentials?.trim()) {
      formData.append('credentials', request.credentials.trim());
    }

    if (request.notes?.trim()) {
      formData.append('notes', request.notes.trim());
    }

    return this.http.post<CreateJobResponse>(`${this.apiBaseUrl}/procap/jobs`, formData);
  }

  getJob(jobId: string): Observable<ProcapJobStatus> {
    return this.http.get<ProcapJobStatus>(`${this.apiBaseUrl}/procap/jobs/${jobId}`);
  }

  getJobResults(jobId: string): Observable<ProcapJobResults> {
    return this.http.get<ProcapJobResults>(`${this.apiBaseUrl}/procap/jobs/${jobId}/results`);
  }

  getDownloadUrl(jobId: string): string {
    return `${this.apiBaseUrl}/procap/jobs/${jobId}/download`;
  }

  getScreenshotUrl(jobId: string, pageUrl: string, screenshotFile?: string): string {
    if (screenshotFile) {
      return `${this.apiBaseUrl}/procap/jobs/${jobId}/capture/${screenshotFile}`;
    }
    try {
      const host = new URL(pageUrl).hostname.replace(/\./g, '-');
      return `${this.apiBaseUrl}/procap/screenshot/${jobId}/${host}.jpeg?u=${encodeURIComponent(pageUrl)}`;
    } catch {
      return `${this.apiBaseUrl}/procap/screenshot/${jobId}/page.jpeg?u=${encodeURIComponent(pageUrl)}`;
    }
  }
}
