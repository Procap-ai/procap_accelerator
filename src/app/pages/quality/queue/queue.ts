import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { QualityService } from '../../../services/quality.service';
import { RepoStore } from '../../../services/repo-store';

type PrState = 'open' | 'merged' | 'closed' | 'draft' | 'unknown';

interface PrRow {
  repo: string; sessionId: string; number: number; title: string; url: string;
  state: PrState; author: string; updatedAt: number; loading: boolean;
}

/** Approval queue → PR tracker. Lists the pull requests Meridian has raised across tracked repos
 *  and their live status (open / merged / closed), fetched from the GitHub API on load. The fix
 *  approval/implement actions now live on each repo's "Take action & Optimize" page. */
@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Approval queue</h1>
    <span class="sub">Pull requests raised by Meridian · live status</span>
    <span class="spacer"></span>
    <div class="kpi" style="padding:8px 14px"><span class="val good" style="font-size:22px">{{ openCount }}</span>
      <span class="lbl">open</span></div>
    <div class="kpi" style="padding:8px 14px"><span class="val sky" style="font-size:22px">{{ mergedCount }}</span>
      <span class="lbl">merged</span></div>
  </div>

  <div class="panel">
    <p class="empty-hint" *ngIf="loading" style="margin:4px 0">Gathering pull requests…</p>
    <p class="empty-hint" *ngIf="!loading && !rows.length" style="margin:4px 0">
      No pull requests yet. Open one from a repo's <b>Take action &amp; Optimize</b> page.</p>

    <div class="queue-row" *ngFor="let r of rows">
      <div>
        <div class="q-head">
          <span class="sev" [ngClass]="badgeClass(r.state)">{{ r.state === 'unknown' ? 'raised' : r.state }}</span>
          <span class="q-title">{{ r.title }}</span>
          <span class="tag">#{{ r.number }}</span>
        </div>
        <div class="q-repo">{{ r.repo }}
          <span *ngIf="r.author"> · by {{ r.author }}</span>
          <span *ngIf="r.updatedAt"> · updated {{ ago(r.updatedAt) }}</span>
          <span *ngIf="r.loading" style="color:var(--muted)"> · checking status…</span></div>
      </div>
      <div class="q-actions">
        <a class="ghost" [routerLink]="['/quality/session', r.sessionId]">Repo overview</a>
        <a class="primary" [href]="r.url" target="_blank" rel="noopener"
           style="padding:7px 14px;border-radius:8px;text-decoration:none">View PR ↗</a>
      </div>
    </div>
  </div>
  `,
})
export class QueueComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly store = inject(RepoStore);

  rows: PrRow[] = [];
  loading = true;

  ngOnInit(): void {
    // Discover sessions from BOTH the browser's tracked repos and the server fleet, so a raised PR
    // shows even if this browser never tracked that repo locally.
    this.svc.getFleet().pipe(catchError(() => of({ repos: [], aggregate: {} as never }))).subscribe(fleet => {
      const byId = new Map<string, string>();
      for (const r of this.store.list()) { if (r.sessionId) { byId.set(r.sessionId, r.repoUrl); } }
      for (const r of fleet.repos || []) { if (r.session_id) { byId.set(r.session_id, `https://github.com/${r.repo}`); } }
      const repos = [...byId].map(([sessionId, repoUrl]) => ({ sessionId, repoUrl }));
      if (!repos.length) { this.loading = false; return; }
      this.loadSessions(repos);
    });
  }

  private loadSessions(repos: { sessionId: string; repoUrl: string }[]): void {
    forkJoin(repos.map(r => this.svc.getSession(r.sessionId).pipe(
      catchError(() => of(null)),
      map(s => ({ s, repo: r.repoUrl })),
    ))).subscribe(results => {
      const out: PrRow[] = [];
      for (const { s, repo } of results) {
        if (!s?.pr_url) { continue; }
        const name = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        const parsed = this.parsePr(s.pr_url);
        out.push({
          repo: name, sessionId: s.session_id,
          number: parsed?.number ?? 0,
          title: s.task_result?.suggested_pr_title || 'Meridian fixes',
          url: s.pr_url, state: 'unknown', author: '', updatedAt: 0, loading: !!parsed,
        });
      }
      this.rows = out;
      this.loading = false;
      // hydrate live status from GitHub (best-effort; public repos, rate-limited)
      for (const row of this.rows) {
        const p = this.parsePr(row.url);
        if (!p) { row.loading = false; continue; }
        this.svc.githubPr(p.owner, p.repo, p.number).subscribe({
          next: pr => {
            row.state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
            row.title = pr.title || row.title;
            row.author = pr.user?.login || '';
            row.updatedAt = new Date(pr.updated_at).getTime();
            row.loading = false;
          },
          error: () => { row.loading = false; },
        });
      }
    });
  }

  private parsePr(url: string): { owner: string; repo: string; number: number } | null {
    const m = (url || '').match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
  }

  get openCount(): number { return this.rows.filter(r => r.state === 'open' || r.state === 'draft').length; }
  get mergedCount(): number { return this.rows.filter(r => r.state === 'merged').length; }

  badgeClass(state: PrState): string {
    return state === 'merged' ? 'high' : state === 'open' ? 'critical' : state === 'closed' ? 'medium' : 'medium';
  }
  ago(ms: number): string {
    const d = Math.max(0, (Date.now() - ms) / 1000);
    if (d < 3600) { return `${Math.round(d / 60)}m ago`; }
    if (d < 86400) { return `${Math.round(d / 3600)}h ago`; }
    return `${Math.round(d / 86400)}d ago`;
  }
}
