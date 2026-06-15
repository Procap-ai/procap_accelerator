import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface QualityOption {
  id: string;
  kind: 'coverage' | 'lint' | 'ci' | 'refactor' | 'config';
  title: string;
  description: string;
  est_effort: 'low' | 'medium' | 'high';
  target_files?: string[];
}

export interface QualityProgressEntry {
  ts: number;
  source?: 'agent' | 'system';
  msg?: string;
  type?: 'step' | 'info' | 'done' | 'error';
  title?: string;
}

export interface QualityAnalysis {
  summary: string;
  metrics?: Record<string, unknown>;
  stack?: string;
}

export interface QualityTaskResult {
  status: string;
  summary: string;
  files_changed?: string[];
  verification?: string;
  branch?: string;
  suggested_pr_title?: string;
  suggested_pr_body?: string;
}

export interface QualitySession {
  session_id: string;
  repo_url: string;
  status: string;
  stack?: string;
  branch?: string;
  progress: QualityProgressEntry[];
  options: QualityOption[];
  analysis?: QualityAnalysis | null;
  task_result?: QualityTaskResult | null;
  pr_url?: string | null;
  error?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ValidateResult {
  valid: boolean;
  owner?: string;
  repo?: string;
  default_branch?: string;
  language?: string;
  stack_hint?: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class QualityService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.procap.ai';

  validate(repoUrl: string): Observable<ValidateResult> {
    return this.http.post<ValidateResult>(`${this.apiBase}/quality/validate`, { repo_url: repoUrl });
  }

  createSession(repoUrl: string, githubToken?: string): Observable<{ session_id: string; repo: string; stack_hint: string }> {
    return this.http.post<{ session_id: string; repo: string; stack_hint: string }>(
      `${this.apiBase}/quality/sessions`, { repo_url: repoUrl, github_token: githubToken || '' });
  }

  getSession(sessionId: string): Observable<QualitySession> {
    return this.http.get<QualitySession>(`${this.apiBase}/quality/sessions/${sessionId}`);
  }

  runTask(sessionId: string, optionId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiBase}/quality/sessions/${sessionId}/command`, { type: 'run_task', option_id: optionId });
  }

  openPr(sessionId: string, githubToken: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiBase}/quality/sessions/${sessionId}/command`, { type: 'open_pr', github_token: githubToken });
  }
}
