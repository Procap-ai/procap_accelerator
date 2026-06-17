import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { QualityItem, QualityService, QualitySession } from '../../../services/quality.service';
import { RepoStore } from '../../../services/repo-store';

interface QueueItem {
  sessionId: string; repo: string; id: string; title: string; description?: string;
  impact: number; confidence: number; effort: string; tags: string[];
}

/** Approval Index & My Queue — high-impact, model-generated fix items across the fleet, ranked
 *  for review. "Approve & push" launches the implement→PR flow on the session. */
@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Approval queue</h1>
    <span class="sub">{{ items.length }} item{{ items.length === 1 ? '' : 's' }} across {{ repoCount }} repos</span>
    <span class="spacer"></span>
    <div class="kpi" style="padding:8px 14px"><span class="val sky" style="font-size:22px">{{ avgConfidence }}%</span>
      <span class="lbl">avg confidence</span></div>
  </div>

  <div class="panel">
    <p class="empty-hint" *ngIf="loading" style="margin:4px 0">Gathering candidates…</p>
    <p class="empty-hint" *ngIf="!loading && !items.length" style="margin:4px 0">
      No pending items. Analyze a repo to populate the queue.</p>
    <div class="queue-row" *ngFor="let it of items">
      <div>
        <div class="q-head">
          <span class="sev" [ngClass]="sev(it)">{{ sev(it) }}</span>
          <span class="q-title">{{ it.title }}</span>
          <span class="tag" *ngFor="let t of it.tags.slice(0, 2)">{{ t }}</span>
          <span class="impact">+{{ it.impact }}</span>
        </div>
        <div class="q-repo">{{ it.repo }} · confidence <b class="conf">{{ it.confidence }}%</b> · {{ it.effort }} effort</div>
        <div class="q-desc" *ngIf="it.description">{{ it.description }}</div>
      </div>
      <div class="q-actions">
        <button class="ghost" (click)="review(it)">Review</button>
        <button class="primary" (click)="approve(it)" [disabled]="busy === it.id">
          {{ busy === it.id ? 'Pushing…' : 'Approve & push' }}</button>
      </div>
    </div>
  </div>
  `,
})
export class QueueComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly store = inject(RepoStore);
  private readonly router = inject(Router);

  items: QueueItem[] = [];
  loading = true;
  busy = '';
  repoCount = 0;

  ngOnInit(): void {
    const repos = this.store.list().filter(r => r.sessionId);
    this.repoCount = repos.length;
    if (!repos.length) { this.loading = false; return; }
    forkJoin(repos.map(r => this.svc.getSession(r.sessionId).pipe(
      catchError(() => of(null)),
      map(s => ({ s, repo: r.repoUrl })),
    ))).subscribe(results => {
      const out: QueueItem[] = [];
      for (const { s, repo } of results) {
        if (!s?.analysis) { continue; }
        const name = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        for (const cat of s.analysis.categories) {
          for (const item of cat.items) {
            for (const leaf of this.leaves(item)) {
              out.push({
                sessionId: s.session_id, repo: name, id: leaf.id, title: leaf.title,
                description: leaf.description, impact: leaf.impact || 0,
                confidence: leaf.confidence ?? 70, effort: leaf.est_effort, tags: leaf.tags || [],
              });
            }
          }
        }
      }
      this.items = out.sort((a, b) => (b.confidence + b.impact) - (a.confidence + a.impact)).slice(0, 40);
      this.loading = false;
    });
  }

  private leaves(n: QualityItem): QualityItem[] {
    return n.children?.length ? n.children.flatMap(c => this.leaves(c)) : [n];
  }

  get avgConfidence(): number {
    return this.items.length ? Math.round(this.items.reduce((s, i) => s + i.confidence, 0) / this.items.length) : 0;
  }
  sev(it: QueueItem): string { return it.confidence >= 90 ? 'critical' : it.confidence >= 75 ? 'high' : 'medium'; }

  review(it: QueueItem): void { void this.router.navigate(['/quality/session', it.sessionId]); }

  approve(it: QueueItem): void {
    this.busy = it.id;
    this.svc.runSelections(it.sessionId, [it.id]).subscribe({
      next: () => { void this.router.navigate(['/quality/session', it.sessionId]); },
      error: () => { this.busy = ''; },
    });
  }
}
