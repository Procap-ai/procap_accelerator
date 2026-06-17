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
  ts: number;               // last updated (ms)
}

const KEY = 'procap_quality_repos';

@Injectable({ providedIn: 'root' })
export class RepoStore {
  list(): SavedRepo[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? (v as SavedRepo[]).sort((a, b) => b.ts - a.ts) : [];
    } catch {
      return [];
    }
  }

  get(repoUrl: string): SavedRepo | undefined {
    const k = norm(repoUrl);
    return this.list().find(r => norm(r.repoUrl) === k);
  }

  /** Insert or merge a repo entry, keyed by normalised repo URL. */
  upsert(patch: Partial<SavedRepo> & { repoUrl: string }): SavedRepo[] {
    const k = norm(patch.repoUrl);
    const list = this.list().filter(r => norm(r.repoUrl) !== k);
    const existing = this.list().find(r => norm(r.repoUrl) === k);
    const merged: SavedRepo = {
      sessionId: '', status: 'created',
      ...existing, ...patch, ts: Date.now(),
    } as SavedRepo;
    list.unshift(merged);
    this.save(list.slice(0, 40));
    return this.list();
  }

  remove(repoUrl: string): SavedRepo[] {
    const k = norm(repoUrl);
    this.save(this.list().filter(r => norm(r.repoUrl) !== k));
    return this.list();
  }

  private save(list: SavedRepo[]): void {
    localStorage.setItem(KEY, JSON.stringify(list));
  }
}

function norm(url: string): string {
  return (url || '').trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}
