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
export interface ScanUsdBreakdown { rule: string; label: string; count: number; weight: number; points: number; usd: number; }
export interface ScanUsdModel {
  label: string;                 // 'modelled'
  visibility: string;            // 'exec' — hide from Architect/Lead dashboard
  dollars: number;
  points: number;
  usd_per_point: number;
  tech_debt_multiplier: number;
  formula: string;
  breakdown: ScanUsdBreakdown[];
}
export interface ScanRulesetMeta { overridden: string[]; disabled: string[]; added: string[]; bad_regex: string[]; active_count: number; }
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
  usd_model: ScanUsdModel;       // tech-debt $ (modelled, exec-only)
  settings?: Record<string, number>;
  ruleset_meta?: ScanRulesetMeta;
  findings: ScanFinding[];
  provenance: string;
}

// ── grounding ruleset (Configuration → Rule Management) ──
export interface RulesetSettings {
  tech_debt_multiplier?: number;
  usd_per_point?: number;
  runs_per_year?: number;
  rate_per_hour?: number;
}
export interface RulesetRule {
  id: string;
  disabled?: boolean;
  pattern?: string;
  discipline?: string;
  severity?: string;
  weight?: number;
  why?: string;
  fix?: string;
  autofix?: boolean;
  flaky?: boolean;
  cost_sec?: number;
}
export interface RulesetConfig { settings: RulesetSettings; rules: RulesetRule[]; }
export interface RulesetSaveResponse { saved: boolean; config: RulesetConfig; warnings: string[]; rule_count: number; }

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
  tests?: number;               // total tests in repo
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
  total_tests?: number;
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

  /** Global active grounding-ruleset (settings + custom rule overlay). */
  getRuleset(): Observable<{ config: RulesetConfig }> {
    return this.http.get<{ config: RulesetConfig }>(`${this.apiBase}/quality/ruleset`);
  }

  /** Save the active grounding-ruleset (validated server-side). */
  putRuleset(config: RulesetConfig): Observable<RulesetSaveResponse> {
    return this.http.put<RulesetSaveResponse>(`${this.apiBase}/quality/ruleset`, config);
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

  // ── direct GitHub calls (public, unauthenticated; rate-limited 60/hr — fine for the demo) ──
  /** Current HEAD commit SHA of a repo's branch — used for change-detection ("new commits since
   *  last scan"). owner/repo parsed from the GitHub URL; branch defaults to the repo default. */
  githubHead(owner: string, repo: string, branch = 'HEAD'): Observable<GithubCommit> {
    const ref = branch === 'HEAD' ? '' : `/${branch}`;
    return this.http.get<GithubCommit>(
      `https://api.github.com/repos/${owner}/${repo}/commits${ref || '/HEAD'}`);
  }

  /** Live state of a pull request (open / closed / merged) for the Approval queue PR tracker. */
  githubPr(owner: string, repo: string, num: number): Observable<GithubPr> {
    return this.http.get<GithubPr>(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}`);
  }

  /** Recursive file tree at a commit/tree sha — used to match journeys against real test files. */
  githubTree(owner: string, repo: string, sha: string): Observable<GithubTree> {
    return this.http.get<GithubTree>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
  }
}

export interface GithubTree { sha: string; truncated: boolean; tree: { path: string; type: string }[]; }

export interface GithubCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
}
export interface GithubPr {
  number: number; state: 'open' | 'closed'; merged: boolean; title: string;
  html_url: string; created_at: string; updated_at: string; user: { login: string };
}

// ── candidate user journeys + risk weighting (Configuration → Journeys; feeds AC alignment) ──
export interface CandidateJourney {
  id: string; name: string; criticality: 'low' | 'medium' | 'high';
  weightUsd: number; source: string;
}
