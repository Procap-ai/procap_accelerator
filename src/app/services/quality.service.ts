import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type EffortLevel = 'low' | 'medium' | 'high';
export type CategoryKind = 'coverage' | 'lint' | 'ci' | 'refactor' | 'config';

export interface QualityMetric {
  unit: 'percent' | 'count';
  current: number;
  target: number;
}

/** A selectable node in the fix tree. A node with no `children` is a leaf (the unit of work). */
export interface QualityItem {
  id: string;
  title: string;
  description?: string;
  metric?: QualityMetric;
  impact: number;            // points added to the parent category headline if done
  est_effort: EffortLevel;
  target_files?: string[];
  children?: QualityItem[];
}

export interface QualityCategory {
  id: string;
  title: string;
  kind: CategoryKind;
  score: number;             // 0-100
  metric: QualityMetric;
  summary?: string;
  items: QualityItem[];
}

export interface QualityScores {
  overall: number;
  coverage: number;
  code_quality: number;
  ci_tooling: number;
  [k: string]: number;
}

export interface QualityAnalysis {
  summary: string;
  stack?: string;
  scores: QualityScores;
  categories: QualityCategory[];
  metrics?: Record<string, unknown>;
}

export interface QualityProgressEntry {
  ts: number;
  source?: 'agent' | 'system';
  msg?: string;
  type?: 'step' | 'info' | 'done' | 'error';
  title?: string;
}

export interface QualityTaskResult {
  status: string;
  summary: string;
  items_done?: string[];
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

  /** Implement a batch of selected leaf items as a single branch/PR. */
  runSelections(sessionId: string, itemIds: string[]): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiBase}/quality/sessions/${sessionId}/command`, { type: 'run_task', selections: itemIds });
  }

  openPr(sessionId: string, githubToken: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiBase}/quality/sessions/${sessionId}/command`, { type: 'open_pr', github_token: githubToken });
  }
}
