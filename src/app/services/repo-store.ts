import { Injectable } from '@angular/core';

import { QualityScores } from './quality.service';

/** One saved repo card on the dashboard, persisted to localStorage. */
export interface SavedRepo {
  repoUrl: string;
  sessionId: string;
  status: string;
  scores?: QualityScores;   // last analysed score snapshot
  coverage?: number;        // headline coverage %
  issues?: number;          // headline open-issue count
  contributors?: number;    // distinct recent contributors
  savings?: number;         // cumulative est. savings (USD)
  tests?: number;           // total tests in repo
  scanScore?: number | null;// deterministic baseline health (scan) — the headline health number
  findings?: number;        // total rule deviations (scan)
  prUrl?: string;           // last raised PR url (for the Approval queue tracker)
  scannedSha?: string;      // repo HEAD sha captured when this analysis was recorded
  scannedAt?: number;       // when the scan was recorded (ms) — for "new commits since" banner
  ts: number;               // last updated (ms)
}

const KEY = 'procap_quality_repos';
const HIDDEN_KEY = 'meridian_hidden_repos';

@Injectable({ providedIn: 'root' })
export class RepoStore {
  /** Visible repos = stored list minus any the user has explicitly removed. The hidden set is what
   *  keeps a removed repo gone after refresh, even though the /quality/fleet response re-supplies it. */
  list(): SavedRepo[] {
    const hidden = this.hidden();
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(v)) { return []; }
      return (v as SavedRepo[]).filter(r => !hidden.has(norm(r.repoUrl))).sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  }

  get(repoUrl: string): SavedRepo | undefined {
    const k = norm(repoUrl);
    return this.list().find(r => norm(r.repoUrl) === k);
  }

  /** Insert or merge a repo entry, keyed by normalised repo URL. A hidden repo stays hidden unless
   *  it is explicitly re-added (call unhide() first, as the add-repo flow does). */
  upsert(patch: Partial<SavedRepo> & { repoUrl: string }): SavedRepo[] {
    const k = norm(patch.repoUrl);
    const raw = this.raw();
    const existing = raw.find(r => norm(r.repoUrl) === k);
    const rest = raw.filter(r => norm(r.repoUrl) !== k);
    const merged: SavedRepo = {
      sessionId: '', status: 'created',
      ...existing, ...patch, ts: Date.now(),
    } as SavedRepo;
    rest.unshift(merged);
    this.save(rest.slice(0, 40));
    return this.list();
  }

  remove(repoUrl: string): SavedRepo[] {
    const k = norm(repoUrl);
    const h = this.hidden();
    h.add(k);
    this.saveHidden(h);
    this.save(this.raw().filter(r => norm(r.repoUrl) !== k));
    return this.list();
  }

  /** Un-hide a repo so an explicit re-add brings it back. */
  unhide(repoUrl: string): void {
    const h = this.hidden();
    if (h.delete(norm(repoUrl))) { this.saveHidden(h); }
  }

  private raw(): SavedRepo[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? (v as SavedRepo[]) : [];
    } catch { return []; }
  }
  private hidden(): Set<string> {
    try {
      const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      return new Set(Array.isArray(v) ? (v as string[]) : []);
    } catch { return new Set(); }
  }
  private saveHidden(h: Set<string>): void { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...h])); }
  private save(list: SavedRepo[]): void { localStorage.setItem(KEY, JSON.stringify(list)); }
}

function norm(url: string): string {
  return (url || '').trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}
