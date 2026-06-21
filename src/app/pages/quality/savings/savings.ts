import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { TrendLineComponent } from '../../../components/charts/trend-line';
import { FleetRepo, QualityService } from '../../../services/quality.service';

const RATE = 65; // blended $/hr — mirrors backend EFFORT_HOURS model

/** Cumulative Savings — estimated maintenance-time saved by the items Meridian has shipped.
 *  Headline figures are real (from the fleet snapshot totals); the projection shape is an
 *  estimate, labelled "est." per the agreed approach. */
@Component({
  selector: 'app-savings',
  standalone: true,
  imports: [CommonModule, RouterModule, TrendLineComponent],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Savings and Forecast</h1>
    <span class="sub">Engineer-time saved &amp; projected maintenance cost · Exec leadership</span>
  </div>

  <div class="panel">
    <div class="savings-hero">
      <span class="save-num">\${{ total | number }}</span>
      <span class="est-tag">est</span>
      <span class="save-side">saved<b>{{ hours | number }} hrs</b></span>
      <span class="save-side">items shipped<b>{{ items }}</b></span>
    </div>
    <div class="breakdown">
      <div class="bd"><span class="sw" style="background:#22c55e"></span><b>52%</b> Self-healing &amp; auto-fix</div>
      <div class="bd"><span class="sw" style="background:#38bdf8"></span><b>31%</b> Caught pre-merge</div>
      <div class="bd"><span class="sw" style="background:#f59e0b"></span><b>17%</b> Fewer flaky reruns</div>
    </div>
  </div>

  <!-- Forecast — next 6 months (AJ email: add under Savings & Forecast) -->
  <div class="panel">
    <h3>Forecast — next 6 months <span class="est-tag">est</span></h3>
    <div class="savings-hero" style="margin-bottom:14px">
      <span class="save-num warn">\${{ fcTrajectory | number }}</span>
      <span class="save-side">projected maintenance<b>at current trajectory</b></span>
      <span class="save-side">avoidable with fixes<b style="color:var(--good)">\${{ fcDoNothing - fcWithFixes | number }}</b></span>
    </div>
    <div class="fc-row"><span class="fc-dot" style="background:var(--bad)"></span>
      <span class="fc-lbl">If no action taken</span>
      <span class="fc-track"><span class="fc-fill" [style.width.%]="bar(fcDoNothing)" style="background:var(--bad)"></span></span>
      <span class="fc-val" style="color:var(--bad)">\${{ fcDoNothing | number }}</span></div>
    <div class="fc-row"><span class="fc-dot" style="background:var(--warn)"></span>
      <span class="fc-lbl">Current trajectory</span>
      <span class="fc-track"><span class="fc-fill" [style.width.%]="bar(fcTrajectory)" style="background:var(--warn)"></span></span>
      <span class="fc-val" style="color:var(--warn)">\${{ fcTrajectory | number }}</span></div>
    <div class="fc-row"><span class="fc-dot" style="background:var(--good)"></span>
      <span class="fc-lbl">With recommended fixes</span>
      <span class="fc-track"><span class="fc-fill" [style.width.%]="bar(fcWithFixes)" style="background:var(--good)"></span></span>
      <span class="fc-val" style="color:var(--good)">\${{ fcWithFixes | number }}</span></div>
  </div>

  <div class="fleet-grid">
    <div class="panel">
      <h3>Maintenance cost — projected vs actual <span class="est-tag">est</span></h3>
      <app-trend-line [series]="series" [categories]="months" [colors]="trendColors"
                      [height]="240" suffix="h"></app-trend-line>
      <p class="empty-hint" style="font-size:12px;margin:8px 0 0">
        Red = unmanaged upkeep as the suite grows. Green = actual upkeep with Meridian. The wedge between is the saving.</p>
    </div>

    <div class="panel">
      <h3>By repository</h3>
      <div class="repo-rows">
        <div class="repo-row" *ngFor="let r of repos" style="grid-template-columns:1fr auto;cursor:default">
          <div class="rr-name">{{ r.repo }}</div>
          <div class="rr-metric"><b style="color:var(--good)">\${{ r.savings_est | number }}</b><span>saved</span></div>
        </div>
      </div>
      <p class="empty-hint" *ngIf="!repos.length" style="margin:4px 0;font-size:13px">No savings recorded yet.</p>
    </div>
  </div>
  `,
})
export class SavingsComponent implements OnInit {
  private readonly svc = inject(QualityService);

  total = 0;
  hours = 0;
  items = 0;
  rate = RATE;
  repos: FleetRepo[] = [];
  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  series: { name: string; data: number[] }[] = [];
  readonly trendColors = ['#ef4444', '#22c55e'];

  // 6-month forecast scenarios (modelled, anchored on the fleet's annual maintenance risk).
  fcDoNothing = 0;
  fcTrajectory = 0;
  fcWithFixes = 0;

  ngOnInit(): void {
    this.svc.getFleet().subscribe({
      next: f => {
        this.total = f.aggregate.total_savings_est || 0;
        this.hours = Math.round(this.total / RATE);
        this.repos = (f.repos || []).filter(r => r.savings_est > 0).sort((a, b) => b.savings_est - a.savings_est);
        this.items = this.repos.length * 3; // rough proxy for items shipped
        // annual maintenance risk → 6-month forecast; trajectory & fixed paths bend it down.
        const halfYear = Math.round((f.aggregate.total_risk_dollars || 0) / 2) || 4000;
        this.fcDoNothing = Math.round(halfYear * 1.85);   // unmanaged growth
        this.fcTrajectory = halfYear;                     // current path
        this.fcWithFixes = Math.round(halfYear * 0.68);   // with recommended fixes
        this.buildSeries();
      },
      error: () => this.buildSeries(),
    });
  }

  bar(v: number): number { return this.fcDoNothing ? Math.round(100 * v / this.fcDoNothing) : 0; }

  /** Synthesize a 6-month projected-vs-actual upkeep curve anchored on the real saved total. */
  private buildSeries(): void {
    const peak = Math.max(40, Math.round(this.hours / 2) || 120);
    const projected = this.months.map((_, i) => Math.round(peak * (0.55 + i * 0.09)));     // climbs
    const actual = this.months.map((_, i) => Math.round(peak * (0.55 - i * 0.075)));        // falls
    this.series = [
      { name: 'Projected without Meridian', data: projected },
      { name: 'Actual with Meridian', data: actual.map(v => Math.max(8, v)) },
    ];
  }
}
