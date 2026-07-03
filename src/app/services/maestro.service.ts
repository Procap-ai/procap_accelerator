import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

// NOTE: the product is "Maestro" but the deployed backend (AWS resources + API paths) stays
// `procap-autopilot-*` / `/autopilot/*`. Only the Angular surface is named Maestro.
export type TargetKind = 'repo' | 'website';
export type CoverageLevel = 'minimal' | 'critical' | 'standard' | 'deep';
export type RunMode = 'reuse' | 'regenerate';

export type CandidateTier = 'minimal' | 'critical' | 'standard' | 'deep' | 'backlog';

export interface TargetTest {
  id: string;
  title: string;
  description?: string;
  file?: string;
  enabled: boolean;
}

/** A test change queued by the chat that the NEXT run applies (then clears). */
export interface PendingEdit {
  id: string;
  action: 'add' | 'edit' | 'delete';
  test_id?: string;
  details: string;
  added_at?: number;
}

/** One turn of the Maestro chat conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A ranked test candidate from the planning phase — powers the coverage dashboard + heat map. */
export interface TestCandidate {
  id: string;
  title: string;
  description?: string;
  area?: string;
  score: number;        // 0-100 business criticality (ranking key)
  confidence: number;   // 0-100 automatability (heat-map intensity)
  rank?: number;        // 1-based position in the ranked list
  tier?: CandidateTier; // lowest coverage level whose budget includes it
  implemented?: boolean;
  file?: string;
  enabled?: boolean;    // false once the user has curated/disabled it
}

export interface ProjectFile {
  path: string;
  bytes: number;
  content: string;
  truncated?: boolean;
}

export interface MaestroTarget {
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
  crawl_depth?: number;
  max_pages?: number;
  instructions?: string;
  coverage_max?: Record<string, number>;
  min_score?: number;
  suite_ready?: boolean;
  has_project?: boolean;
  tests?: TargetTest[];
  candidates?: TestCandidate[];
  pending_edits?: PendingEdit[];   // chat-queued test changes awaiting the next run
  // repo Selenium→Playwright conversion (repo targets only)
  source_framework?: string;      // e.g. "Selenium (standalone)" — the detected original stack
  converted_branch?: string;      // e.g. "maestro/playwright" — pushed feature branch (empty if not pushed)
  conversion_status?: string;     // "" | "converted" | "converted_local"
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

export interface MaestroRun {
  run_id: string;
  target_id: string;
  kind: TargetKind;
  name: string;
  url?: string;
  status: string;          // queued → exploring|cloning → generating → installing → running → triaging → done | failed
  mode?: RunMode;          // reuse = ran saved suite; regenerate = re-explored + regenerated
  progress: ProgressEntry[];
  bugs: Bug[];
  tests: TestResult[];
  summary?: RunSummary | null;
  artifacts?: RunArtifacts | null;
  healed?: number;
  converted_branch?: string;   // set on repo runs that converted a suite to Playwright
  source_framework?: string;
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
  bugs_count?: number;
  healed?: number;
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
  crawl_depth?: number;
  max_pages?: number;
  instructions?: string;
  repo_url?: string;
  site_url?: string;
  github_token?: string;
  creds?: { username: string; password: string; login_url?: string };
}

export interface TargetPatch {
  coverage?: CoverageLevel;
  name?: string;
  crawl_depth?: number;
  max_pages?: number;
  instructions?: string;
}

export interface ProjectFilesResult { files: ProjectFile[]; count: number; ready: boolean; }

@Injectable({ providedIn: 'root' })
export class MaestroService {
  private readonly http = inject(HttpClient);
  readonly apiBase = 'https://api.procap.ai';

  validate(payload: { repo_url?: string; site_url?: string; github_token?: string }): Observable<ValidateResult> {
    return this.http.post<ValidateResult>(`${this.apiBase}/autopilot/validate`, payload);
  }

  createTarget(payload: CreateTargetPayload): Observable<{ target_id: string; kind: TargetKind; name: string }> {
    return this.http.post<{ target_id: string; kind: TargetKind; name: string }>(
      `${this.apiBase}/autopilot/targets`, payload);
  }

  listTargets(): Observable<{ targets: MaestroTarget[] }> {
    return this.http.get<{ targets: MaestroTarget[] }>(`${this.apiBase}/autopilot/targets`);
  }

  getTarget(id: string): Observable<MaestroTarget> {
    return this.http.get<MaestroTarget>(`${this.apiBase}/autopilot/targets/${id}`);
  }

  deleteTarget(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.apiBase}/autopilot/targets/${id}`);
  }

  updateTarget(id: string, patch: TargetPatch): Observable<MaestroTarget> {
    return this.http.patch<MaestroTarget>(`${this.apiBase}/autopilot/targets/${id}`, patch);
  }

  getProjectFiles(id: string): Observable<ProjectFilesResult> {
    return this.http.get<ProjectFilesResult>(`${this.apiBase}/autopilot/targets/${id}/project`);
  }

  downloadUrl(id: string): string {
    return `${this.apiBase}/autopilot/targets/${id}/download`;
  }

  deleteTest(targetId: string, testId: string): Observable<{ disabled_tests: string[] }> {
    return this.http.delete<{ disabled_tests: string[] }>(
      `${this.apiBase}/autopilot/targets/${targetId}/tests/${testId}`);
  }

  regenerate(targetId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBase}/autopilot/targets/${targetId}/regenerate`, {});
  }

  createRun(targetId: string, mode?: RunMode): Observable<{ run_id: string; status: string; mode: RunMode }> {
    return this.http.post<{ run_id: string; status: string; mode: RunMode }>(
      `${this.apiBase}/autopilot/runs`, { target_id: targetId, mode });
  }

  listRuns(targetId?: string): Observable<{ runs: RunListItem[] }> {
    const q = targetId ? `?target_id=${encodeURIComponent(targetId)}` : '';
    return this.http.get<{ runs: RunListItem[] }>(`${this.apiBase}/autopilot/runs${q}`);
  }

  getRun(id: string): Observable<MaestroRun> {
    return this.http.get<MaestroRun>(`${this.apiBase}/autopilot/runs/${id}`);
  }

  /** Maestro chat: send the conversation, get the assistant reply + the (possibly-mutated) target. */
  chat(targetId: string, messages: ChatMessage[]): Observable<{ reply: string; target: MaestroTarget }> {
    return this.http.post<{ reply: string; target: MaestroTarget }>(
      `${this.apiBase}/autopilot/chat`, { target_id: targetId, messages });
  }

  captureUrl(runId: string, filename: string): string {
    return `${this.apiBase}/autopilot/runs/${runId}/capture/${filename}`;
  }

  artifactUrl(runId: string, filename: string): string {
    return `${this.apiBase}/autopilot/runs/${runId}/artifact/${filename}`;
  }
}
