import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { TrendLineComponent } from '../../../components/charts/trend-line';
import { QualityService, QualitySession } from '../../../services/quality.service';
import { RepoStore } from '../../../services/repo-store';

interface Discipline { name: string; value: number; }
interface Ledger { ts: number; who: string; what: string; repo: string; }

/** Adherence & Adoption — fleet-wide standards adherence: headline index, by-discipline bars
 *  (averaged category scores), a trend, and a live feed of recent commits across repos. */
@Component({
  selector: 'app-adherence',
  standalone: true,
  imports: [CommonModule, RouterModule, TrendLineComponent],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Adherence &amp; adoption</h1>
    <span class="sub">Standards adherence across the fleet</span>
    <span class="spacer"></span>
    <span class="live"><span class="ring"></span> live</span>
  </div>

  <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
    <div class="kpi"><span class="val good">{{ adherence }}<span style="font-size:15px;color:var(--muted)">/100</span></span>
      <span class="lbl">Adherence index
        <i class="info">i<span class="tip">Mean of the per-discipline adherence scores (0–100, higher = more adherent to the standard). A discipline score = how well the suite follows that rule group.</span></i></span></div>
    <div class="kpi"><span class="val sky">{{ disciplines.length }}</span><span class="lbl">Disciplines tracked</span></div>
    <div class="kpi"><span class="val">{{ delta >= 0 ? '+' : '' }}{{ delta }}<span class="est-tag">est</span></span>
      <span class="lbl">Trend vs first snapshot
        <i class="info">i<span class="tip">Change in the overall adherence index since the first recorded snapshot for these repos.</span></i></span></div>
  </div>

  <div class="fleet-grid">
    <div class="panel">
      <h3>Adherence by discipline <span class="rule-desc" style="text-transform:none;letter-spacing:0">score 0–100 · weakest first</span></h3>
      <div class="disc-row" *ngFor="let d of disciplines">
        <span class="disc-name">{{ d.name }}</span>
        <span class="disc-track"><span class="disc-fill" [style.width.%]="d.value"></span></span>
        <span class="disc-val" [style.color]="d.value >= 75 ? 'var(--good)' : d.value >= 50 ? 'var(--warn)' : 'var(--bad)'">{{ d.value }}</span>
      </div>
      <p class="empty-hint" *ngIf="!disciplines.length" style="margin:4px 0;font-size:13px">Analyze repos to populate disciplines.</p>
      <div *ngIf="trend.length > 1" style="margin-top:18px">
        <app-trend-line [series]="trendSeries" [categories]="trendLabels"
                        [colors]="trendColors" [height]="160" [yMax]="100"></app-trend-line>
      </div>
    </div>

    <div class="panel">
      <h3>Live feedback stream</h3>
      <div class="ledger-row" *ngFor="let l of ledger">
        <span class="when">{{ ago(l.ts) }}</span>
        <span class="who">{{ l.who }}</span>
        <span class="what">{{ l.what }} <span style="color:var(--muted)">· {{ l.repo }}</span></span>
      </div>
      <p class="empty-hint" *ngIf="!ledger.length" style="margin:4px 0;font-size:13px">No recent activity.</p>
    </div>
  </div>
  `,
})
export class AdherenceComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly store = inject(RepoStore);

  disciplines: Discipline[] = [];
  ledger: Ledger[] = [];
  trend: number[] = [];
  trendLabels: string[] = [];
  trendSeries: { name: string; data: number[] }[] = [];
  readonly trendColors = ['#22c55e'];
  adherence = 0;
  delta = 0;

  ngOnInit(): void {
    const repos = this.store.list().filter(r => r.sessionId);
    if (!repos.length) { return; }
    forkJoin(repos.map(r => this.svc.getSession(r.sessionId).pipe(catchError(() => of(null)))))
      .subscribe(sessions => this.build(sessions.filter((s): s is QualitySession => !!s?.analysis), repos.map(r => r.repoUrl)));
  }

  private build(sessions: QualitySession[], urls: string[]): void {
    // by-discipline = average of category scores grouped by title
    const groups: Record<string, number[]> = {};
    const led: Ledger[] = [];
    sessions.forEach((s, i) => {
      const name = (urls[i] || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
      for (const c of s.analysis!.categories) { (groups[c.title] ||= []).push(c.score); }
      for (const cm of s.analysis!.signals?.recent_commits || []) {
        led.push({ ts: cm.ts, who: cm.author, what: cm.subject, repo: name });
      }
    });
    this.disciplines = Object.entries(groups)
      .map(([name, vs]) => ({ name, value: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) }))
      .sort((a, b) => a.value - b.value);
    this.adherence = this.disciplines.length
      ? Math.round(this.disciplines.reduce((s, d) => s + d.value, 0) / this.disciplines.length) : 0;
    this.ledger = led.sort((a, b) => b.ts - a.ts).slice(0, 8);
    this.loadTrend(urls);
  }

  private loadTrend(urls: string[]): void {
    const repos = urls.map(u => u.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''));
    forkJoin(repos.map(r => this.svc.getSnapshots(r).pipe(catchError(() => of({ repo: r, snapshots: [] })))))
      .subscribe(all => {
        const byDay: Record<string, number[]> = {};
        for (const set of all) {
          for (const sn of set.snapshots) {
            const day = new Date(sn.ts).toISOString().slice(5, 10);
            (byDay[day] ||= []).push(sn.scores?.overall || 0);
          }
        }
        const days = Object.keys(byDay).sort();
        this.trendLabels = days;
        this.trend = days.map(d => Math.round(byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length));
        this.trendSeries = [{ name: 'Adherence', data: this.trend }];
        if (this.trend.length > 1) { this.delta = this.trend[this.trend.length - 1] - this.trend[0]; }
      });
  }

  ago(ts: number): string {
    const d = Math.max(0, Date.now() / 1000 - ts);
    if (d < 3600) { return `${Math.round(d / 60)}m`; }
    if (d < 86400) { return `${Math.round(d / 3600)}h`; }
    return `${Math.round(d / 86400)}d`;
  }
}
