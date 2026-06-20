import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { QualityService } from '../../../services/quality.service';
import { RepoStore, SavedRepo } from '../../../services/repo-store';

type Tab = 'coverage' | 'ac';

/** System & Business Assurance (AJ email): the former "Business view" pages grouped here.
 *  Tab 1 "Coverage snapshot & gaps" is data-driven (links to each repo's genome view); tab 2
 *  "AC criteria alignment" is a static preview (real requirement/AC ingestion is out of POC scope). */
@Component({
  selector: 'app-assurance',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>System &amp; Business Assurance</h1>
    <span class="sub">Coverage, gaps &amp; requirement alignment</span>
  </div>

  <div class="cfg-tabs">
    <button class="cfg-tab" [class.active]="tab === 'coverage'" (click)="tab = 'coverage'">Coverage snapshot &amp; gaps</button>
    <button class="cfg-tab" [class.active]="tab === 'ac'" (click)="tab = 'ac'">AC criteria alignment
      <span class="tag" style="background:#2a2f3a;color:var(--muted)">static</span></button>
  </div>

  <!-- coverage snapshot & gaps -->
  <ng-container *ngIf="tab === 'coverage'">
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span class="val sky">{{ avgCoverage }}%</span><span class="lbl">Avg. coverage across fleet</span></div>
      <div class="kpi"><span class="val">{{ repos.length }}</span><span class="lbl">Repositories assured</span></div>
      <div class="kpi"><span class="val" [class.warn]="totalGaps > 0">{{ totalGaps }}</span>
        <span class="lbl">Open coverage gaps
          <i class="info">i<span class="tip">Sum of open-issue counts across analysed repos — a proxy for untested flows.</span></i></span></div>
    </div>

    <div class="panel">
      <h3>Per-repository assurance</h3>
      <div class="repo-rows">
        <div class="repo-row" *ngFor="let r of repos" [routerLink]="r.sessionId ? ['/quality/genome', r.sessionId] : null"
             [style.cursor]="r.sessionId ? 'pointer' : 'default'">
          <span class="score-dot" *ngIf="r.scores" [style.background]="band(r.scores.overall) + '22'"
                [style.color]="band(r.scores.overall)">{{ r.scores.overall }}</span>
          <div>
            <div class="rr-name">{{ shortRepo(r.repoUrl) }}</div>
            <div class="rr-stack">{{ r.tests || 0 }} tests · {{ r.coverage ?? '—' }}% coverage</div>
          </div>
          <div class="rr-metrics">
            <div class="rr-metric"><b [style.color]="(r.issues || 0) > 0 ? 'var(--warn)' : 'var(--good)'">{{ r.issues ?? 0 }}</b><span>gaps</span></div>
            <span class="nav-link" style="padding:4px 8px">Business view →</span>
          </div>
        </div>
      </div>
      <p class="empty-hint" *ngIf="!repos.length" style="margin:6px 0;font-size:13px">Analyze a repo to populate assurance.</p>
    </div>
  </ng-container>

  <!-- AC criteria alignment (static preview) -->
  <div class="panel" *ngIf="tab === 'ac'">
    <h3>Acceptance-criteria alignment <span class="tag" style="background:#2a2f3a;color:var(--muted)">static preview</span></h3>
    <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.6;margin:0 0 14px">
      Maps product acceptance criteria to the tests that exercise them. Requires Jira / Aha! /
      Productboard ingestion (Meridian Phase-2) — shown here as a layout preview.</p>
    <div class="disc-row" *ngFor="let a of acRows">
      <span class="disc-name" style="flex:1;max-width:none">{{ a.story }}</span>
      <span class="disc-track" style="max-width:160px"><span class="disc-fill" [style.width.%]="a.pct"
        [style.background]="a.pct >= 75 ? 'var(--good)' : a.pct >= 50 ? 'var(--warn)' : 'var(--bad)'"></span></span>
      <span class="disc-val" [style.color]="a.pct >= 75 ? 'var(--good)' : a.pct >= 50 ? 'var(--warn)' : 'var(--bad)'">{{ a.pct }}%</span>
    </div>
  </div>
  `,
})
export class AssuranceComponent implements OnInit {
  private readonly store = inject(RepoStore);
  private readonly svc = inject(QualityService);
  private readonly route = inject(ActivatedRoute);

  tab: Tab = 'coverage';
  repos: SavedRepo[] = [];

  acRows = [
    { story: 'Checkout — pay with saved card', pct: 82 },
    { story: 'Checkout — promo code applied', pct: 64 },
    { story: 'Login — SSO + MFA', pct: 48 },
    { story: 'Cart — quantity edit & persistence', pct: 71 },
    { story: 'Refund — partial refund flow', pct: 33 },
  ];

  ngOnInit(): void {
    this.repos = this.store.list();
    this.svc.getFleet().subscribe({
      next: f => {
        for (const r of f.repos || []) {
          this.store.upsert({
            repoUrl: `https://github.com/${r.repo}`, sessionId: r.session_id, status: 'analyzed',
            scores: { overall: r.overall, coverage: r.coverage, code_quality: 0, ci_tooling: 0 },
            coverage: r.coverage, issues: r.issues, tests: r.tests,
          });
        }
        this.repos = this.store.list();
      },
      error: () => { /* keep local */ },
    });
    const t = this.route.snapshot.queryParamMap.get('tab');
    if (t === 'ac') { this.tab = 'ac'; }
  }

  get avgCoverage(): number {
    const a = this.repos.filter(r => r.coverage != null);
    return a.length ? Math.round(a.reduce((s, r) => s + (r.coverage || 0), 0) / a.length) : 0;
  }
  get totalGaps(): number { return this.repos.reduce((s, r) => s + (r.issues || 0), 0); }
  band(v: number): string { return v >= 75 ? 'var(--good)' : v >= 50 ? 'var(--warn)' : 'var(--bad)'; }
  shortRepo(url: string): string { return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }
}
