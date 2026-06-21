import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

import {
  QualityAnalysis, QualityCategory, QualityItem, QualityService,
} from '../../../services/quality.service';

interface Gap extends QualityItem { categoryTitle: string; }

/** Phase-2 "State of quality / genome" + predicted gaps — a lighter editorial view derived
 *  entirely from data we already produce (scores, signals, item confidence/tags). */
@Component({
  selector: 'app-genome',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Business assurance</h1>
    <span class="sub">{{ repo }}</span>
    <span class="spacer"></span>
    <a class="ghost-link" [routerLink]="['/quality/session', id, 'optimize']" *ngIf="id">Targeted actions to improve →</a>
  </div>

  <ng-container *ngIf="analysis as a; else loading">
    <!-- editorial genome card -->
    <div class="genome">
      <div class="eyebrow">The state of quality · this week</div>
      <h2>Where your software is breathing, and where it isn't.</h2>
      <p class="lede">{{ a.summary }}</p>

      <div class="g-kpis">
        <div class="g-kpi"><b>{{ coverage }}%</b><span>Coverage</span></div>
        <div class="g-kpi"><b>{{ issues }}</b><span>Open gaps</span></div>
        <div class="g-kpi"><b>{{ commits }}</b><span>Commits · history</span></div>
        <div class="g-kpi"><b>{{ a.scores.overall }}</b><span>Assurance index</span></div>
      </div>

      <div class="g-grid" style="margin-top:8px">
        <div>
          <div class="g-section">Risk chromosomes</div>
          <div class="chromo" *ngFor="let c of chromosomes; let i = index">
            <span class="idx">{{ (i + 1) | number: '2.0' }}</span>
            <span class="c-name">{{ c.name }}</span>
            <span style="font-family:Inter,sans-serif;font-size:12px;color:#8a7d6c">{{ c.value }}%</span>
            <span class="c-track"><span class="c-fill" [style.width.%]="c.value" [style.background]="c.color"></span></span>
          </div>
        </div>
        <div>
          <div class="g-section">Live ledger</div>
          <div class="ledger-e" *ngFor="let l of ledger">
            <span class="led-when">{{ ago(l.ts) }}</span>
            <span class="led-txt"><b>{{ l.who }}</b> — {{ l.what }}</span>
          </div>
          <p *ngIf="!ledger.length" style="font-family:Inter,sans-serif;font-size:13px;color:#8a7d6c">No recent commit activity.</p>
        </div>
      </div>
    </div>

    <!-- predicted gaps -->
    <div class="obs-topbar" style="margin-top:8px"><h1 style="font-size:18px">The week's predicted gaps</h1>
      <span class="sub">ranked by model confidence</span></div>
    <div class="gap-cards">
      <div class="gap-card" *ngFor="let g of gaps">
        <div class="gc-head">
          <span class="sev" [ngClass]="sev(g)">{{ sev(g) }}</span>
          <span class="tag" *ngFor="let t of (g.tags || []).slice(0, 2)">{{ t }}</span>
        </div>
        <div class="gc-title">{{ g.title }}</div>
        <div class="gc-desc">{{ g.description }}</div>
        <div class="gc-foot">
          <span style="font-size:11px;color:var(--muted)">Confidence</span>
          <span class="conf">{{ g.confidence || 70 }}%</span>
        </div>
      </div>
      <p class="empty-hint" *ngIf="!gaps.length">No predicted gaps in this analysis.</p>
    </div>
  </ng-container>
  <ng-template #loading><p class="empty-hint">Loading…</p></ng-template>
  `,
})
export class GenomeComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);

  id = '';
  repo = '';
  analysis: QualityAnalysis | null = null;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.id) { return; }
    this.svc.getSession(this.id).subscribe(s => {
      this.analysis = s.analysis ?? null;
      this.repo = (s.repo_url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    });
  }

  private leaves(n: QualityItem): QualityItem[] {
    return n.children?.length ? n.children.flatMap(c => this.leaves(c)) : [n];
  }
  get coverage(): number {
    const c = this.analysis?.categories.find(x => x.kind === 'coverage' || x.id === 'coverage');
    return Math.round(c?.metric?.current ?? this.analysis?.scores?.coverage ?? 0);
  }
  get issues(): number {
    return (this.analysis?.categories || []).filter(c => c.metric?.unit === 'count')
      .reduce((s, c) => s + (c.metric.current || 0), 0);
  }
  get commits(): number { return this.analysis?.signals?.commit_count ?? 0; }

  /** Feature regions ranked — prefer coverage features, else risk files. */
  get chromosomes(): { name: string; value: number; color: string }[] {
    const cov = this.analysis?.categories.find(c => c.kind === 'coverage' || c.id === 'coverage');
    if (cov?.items?.length) {
      return cov.items.map(i => {
        const v = Math.round(i.metric?.current ?? 0);
        return { name: i.title, value: v, color: v >= 66 ? '#3f7d4f' : v >= 33 ? '#c08a2e' : '#b04b3c' };
      }).sort((a, b) => a.value - b.value).slice(0, 6);
    }
    return (this.analysis?.signals?.risk_files || []).map(f => ({
      name: f.path.split('/').pop() || f.path, value: f.risk,
      color: f.risk >= 66 ? '#b04b3c' : f.risk >= 33 ? '#c08a2e' : '#3f7d4f',
    })).slice(0, 6);
  }

  get ledger(): { ts: number; who: string; what: string }[] {
    return (this.analysis?.signals?.recent_commits || [])
      .slice(0, 6).map(c => ({ ts: c.ts, who: c.author, what: c.subject }));
  }

  get gaps(): Gap[] {
    const out: Gap[] = [];
    for (const cat of this.analysis?.categories || []) {
      for (const item of cat.items) {
        for (const leaf of this.leaves(item)) { out.push({ ...leaf, categoryTitle: cat.title }); }
      }
    }
    return out.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 6);
  }
  sev(g: Gap): string {
    const c = g.confidence ?? 70;
    return c >= 90 ? 'critical' : c >= 75 ? 'high' : 'medium';
  }
  ago(ts: number): string {
    const d = Math.max(0, Date.now() / 1000 - ts);
    if (d < 3600) { return `${Math.round(d / 60)}m ago`; }
    if (d < 86400) { return `${Math.round(d / 3600)}h ago`; }
    return `${Math.round(d / 86400)}d ago`;
  }
}
