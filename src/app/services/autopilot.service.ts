import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type TargetKind = 'repo' | 'website';
export type CoverageLevel = 'minimal' | 'critical' | 'standard' | 'deep';

export interface TargetTest {
  id: string;
  title: string;
  description?: string;
  file?: string;
  enabled: boolean;
}

export interface AutopilotTarget {
  target_id: string;
  kind: TargetKind;
  name: string;
  repo_url?: string;
  site_url?: string;
  host?: string;
  owner?: string;
  repo?: string;
  default_branch?: string;
  stack_hint?: string;
  private?: boolean;
  has_creds: boolean;
  coverage?: CoverageLevel;
  suite_ready?: boolean;
  tests?: TargetTest[];
  last_run_id?: string;
  last_run_status?: string;
  created_at: number;
  updated_at: number;
}

export interface ProgressEntry {
  ts?: number;
  source?: string;
  msg?: string;
  type?: string;     // stage | info | pass | fail | run | warn | error | done
  title?: string;
  capture?: string;  // screenshot filename → /capture/{file}
}

export interface TestResult {
  id?: string;
  title: string;
  description?: string;
  file?: string;
  status: string;    // passed | failed | timedOut | skipped | ...
  duration_ms?: number;
  error?: string;
}

export interface Bug {
  id: string;
  title: string;
  severity?: string;       // high | medium | low
  test?: string;
  page?: string;
  expected?: string;
  actual?: string;
  evidence_capture?: string;
  confidence?: number;
  rationale?: string;
}

export interface RunSummary { total: number; passed: number; failed: number; flaky?: number; }
export interface RunArtifacts { videos?: string[]; traces?: string[]; report?: string | null; }

export interface AutopilotRun {
  run_id: string;
  target_id: string;
  kind: TargetKind;
  name: string;
  url?: string;
  status: string;          // queued → exploring|cloning → generating → installing → running → triaging → done | failed
  progress: ProgressEntry[];
  bugs: Bug[];
  tests: TestResult[];
  summary?: RunSummary | null;
  artifacts?: RunArtifacts | null;
  error?: string;
  created_at: number;
  updated_at: number;
}

export interface RunListItem {
  run_id: string;
  target_id: string;
  kind: TargetKind;
  name: string;
  status: string;
  summary?: RunSummary | null;
  created_at: number;
  updated_at: number;
}

export interface ValidateResult {
  valid: boolean;
  message?: string;
  owner?: string;
  repo?: string;
  host?: string;
  private?: boolean;
  default_branch?: string;
  stack_hint?: string;
}

export interface CreateTargetPayload {
  kind: TargetKind;
  name?: string;
  coverage?: CoverageLevel;
  repo_url?: string;
  site_url?: string;
  github_token?: string;
  creds?: { username: string; password: string; login_url?: string };
}

@Injectable({ providedIn: 'root' })
export class AutopilotService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.procap.ai';

  validate(payload: { repo_url?: string; site_url?: string; github_token?: string }): Observable<ValidateResult> {
    return this.http.post<ValidateResult>(`${this.apiBase}/autopilot/validate`, payload);
  }

  createTarget(payload: CreateTargetPayload): Observable<{ target_id: string; kind: TargetKind; name: string }> {
    return this.http.post<{ target_id: string; kind: TargetKind; name: string }>(
      `${this.apiBase}/autopilot/targets`, payload);
  }

  listTargets(): Observable<{ targets: AutopilotTarget[] }> {
    return this.http.get<{ targets: AutopilotTarget[] }>(`${this.apiBase}/autopilot/targets`);
  }

  getTarget(id: string): Observable<AutopilotTarget> {
    return this.http.get<AutopilotTarget>(`${this.apiBase}/autopilot/targets/${id}`);
  }

  deleteTarget(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.apiBase}/autopilot/targets/${id}`);
  }

  updateTarget(id: string, patch: { coverage?: CoverageLevel; name?: string }): Observable<AutopilotTarget> {
    return this.http.patch<AutopilotTarget>(`${this.apiBase}/autopilot/targets/${id}`, patch);
  }

  deleteTest(targetId: string, testId: string): Observable<{ disabled_tests: string[] }> {
    return this.http.delete<{ disabled_tests: string[] }>(
      `${this.apiBase}/autopilot/targets/${targetId}/tests/${testId}`);
  }

  regenerate(targetId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBase}/autopilot/targets/${targetId}/regenerate`, {});
  }

  createRun(targetId: string): Observable<{ run_id: string; status: string }> {
    return this.http.post<{ run_id: string; status: string }>(
      `${this.apiBase}/autopilot/runs`, { target_id: targetId });
  }

  listRuns(targetId?: string): Observable<{ runs: RunListItem[] }> {
    const q = targetId ? `?target_id=${encodeURIComponent(targetId)}` : '';
    return this.http.get<{ runs: RunListItem[] }>(`${this.apiBase}/autopilot/runs${q}`);
  }

  getRun(id: string): Observable<AutopilotRun> {
    return this.http.get<AutopilotRun>(`${this.apiBase}/autopilot/runs/${id}`);
  }

  captureUrl(runId: string, filename: string): string {
    return `${this.apiBase}/autopilot/runs/${runId}/capture/${filename}`;
  }

  artifactUrl(runId: string, filename: string): string {
    return `${this.apiBase}/autopilot/runs/${runId}/artifact/${filename}`;
  }
}
