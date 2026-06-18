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
  confidence?: number;       // 0-100, model's certainty this is a real gap (predicted-gaps view)
  tags?: string[];           // short labels e.g. ['playwright','code-to-journey']
  target_files?: string[];
  children?: QualityItem[];
}

// ── deterministic git/repo signals attached by the worker (grounds the reporting screens) ──
export interface Contributor { name: string; commits: number; last_ts: number; }
export interface RecentCommit { author: string; subject: string; ts: number; }
export interface RiskFile { path: string; churn: number; coverage: number | null; risk: number; }
export interface QualitySignals {
  contributors: Contributor[];
  velocity: number[];        // commits/week, oldest→newest
  recent_commits: RecentCommit[];
  risk_files: RiskFile[];
  commit_count: number;
}

export interface SavingsEst { items: number; hours: number; usd: number; rate: number; }

// ── deterministic static-scan report (deck epics B–E) ──
export interface ScanDiscipline { id: string; title: string; adherence: number; findings: number; weight: number; }
export interface ScanDeviation {
  rule: string; title: string; discipline: string; severity: string;
  count: number; weight: number; autofix: boolean; impact: number; bar: number;
}
export interface ScanHotspot { path: string; findings: number; errors: number; score: number; }
export interface ScanRiskDriver { rule: string; count: number; sec_per_run: number; label: string; }
export interface ScanRisk {
  label: string;                 // 'modelled'
  wasted_min_per_run: number;
  est_flaky_tests: number;
  maint_hours_per_year: number;
  dollars_per_year: number;
  runs_per_year: number;
  rate_per_hour: number;
  drivers: ScanRiskDriver[];
  assumptions: string;
}
export interface ScanFinding { rule: string; discipline: string; severity: string; file: string; line: number; snippet: string; }
export interface ScanReport {
  stack: string;
  files_scanned: number;
  test_cases: number;
  score: number;                 // baseline health, 0-100 (measured)
  score_label: string;
  total_findings: number;
  disciplines: ScanDiscipline[];
  deviations: ScanDeviation[];
  hotspots: ScanHotspot[];
  risk: ScanRisk;                // modelled
  findings: ScanFinding[];
  provenance: string;
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
  signals?: QualitySignals;
  scan?: ScanReport;
  metrics?: Record<string, unknown>;
}

// ── fleet roll-up (GET /quality/fleet) ──
export interface FleetRepo {
  repo: string;
  session_id: string;
  stack?: string;
  overall: number;
  coverage: number;
  issues: number;
  contributors: number;
  savings_est: number;
  ts: number;
  scan_score?: number | null;   // grounded baseline health (deck)
  scan_findings?: number;
  risk_dollars?: number;        // modelled annual maintenance risk
  est_flaky?: number;
}
export interface FleetAggregate {
  repo_count: number;
  avg_overall: number;
  avg_coverage: number;
  total_issues: number;
  total_savings_est: number;
  contributors: number;
  avg_scan_score?: number | null;
  total_risk_dollars?: number;
  total_est_flaky?: number;
}
export interface FleetResponse { repos: FleetRepo[]; aggregate: FleetAggregate; }

export interface Snapshot {
  ts: number;
  kind: string;
  scores: QualityScores;
  coverage: number;
  issues: number;
  savings_est: SavingsEst | null;
  scan_score?: number | null;
  risk_dollars?: number;
  est_flaky?: number;
}
export interface SnapshotsResponse { repo: string; snapshots: Snapshot[]; }

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

  /** Fleet aggregate roll-up across all analysed repos (from the snapshots time-series). */
  getFleet(): Observable<FleetResponse> {
    return this.http.get<FleetResponse>(`${this.apiBase}/quality/fleet`);
  }

  /** Time-series of scorecard snapshots for one repo (owner/repo). */
  getSnapshots(repo: string): Observable<SnapshotsResponse> {
    return this.http.get<SnapshotsResponse>(`${this.apiBase}/quality/snapshots/${repo}`);
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
