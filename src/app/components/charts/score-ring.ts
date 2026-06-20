import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import {
  ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke,
  ApexTooltip, NgApexchartsModule,
} from 'ng-apexcharts';

const GAIN = '#22c55e';   // green — the improvement that selection will add
const TRACK = '#1b232e';  // dark track

/** 0-100 score gauge (ApexCharts donut). The ring shows the CURRENT score as a solid band and the
 *  projected GAIN as a separate green segment. Chart options are rebuilt only when inputs change
 *  (ngOnChanges), not via per-cycle getters, so it doesn't re-render every change-detection tick. */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="ring-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="series" [chart]="chart" [plotOptions]="plotOptions" [colors]="colors"
                 [stroke]="stroke" [dataLabels]="noLabels" [legend]="noLegend" [tooltip]="tooltip"
                 [labels]="segLabels"></apx-chart>
      <div class="center">
        <span class="num" [style.color]="numColor" [style.fontSize.px]="size * 0.26">{{ proj }}{{ suffix }}</span>
        <span class="was" *ngIf="hasGain">was {{ cur }}</span>
      </div>
    </div>
    <div class="cap" *ngIf="label">{{ label }}</div>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
    .ring-wrap { position: relative; }
    .center { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; pointer-events: none; }
    .num { font-weight: 800; letter-spacing: -.02em; line-height: 1; }
    .was { font-size: 11px; color: #7d8794; margin-top: 2px; }
    .cap { font-size: 12px; color: #aeb9c6; font-weight: 600; text-align: center; }
  `],
})
export class ScoreRingComponent implements OnChanges {
  @Input() current = 0;
  @Input() projected?: number;
  @Input() label = '';
  @Input() size = 92;
  @Input() suffix = '';

  series: ApexNonAxisChartSeries = [0, 0, 100];
  chart: ApexChart = { type: 'donut', height: 92, width: 92, sparkline: { enabled: true }, animations: { enabled: false } };
  colors: string[] = ['#16a34a', GAIN, TRACK];
  readonly segLabels = ['Current', 'Planned gain', 'Remaining'];
  readonly plotOptions: ApexPlotOptions = { pie: { donut: { size: '66%' }, expandOnClick: false } };
  readonly stroke: ApexStroke = { width: 0 };
  readonly noLabels: ApexDataLabels = { enabled: false };
  readonly noLegend: ApexLegend = { show: false };
  tooltip: ApexTooltip = { enabled: false, fillSeriesColor: false, y: { formatter: (v: number) => `${v}` } };

  private clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
  get cur() { return this.clamp(this.current); }
  get proj() { return this.clamp(this.projected ?? this.current); }
  get gain() { return Math.max(0, this.proj - this.cur); }
  get hasGain() { return this.gain > 0; }
  get numColor() { const v = this.proj; return v >= 75 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#ef4444'; }

  ngOnChanges(): void {
    const cur = this.cur, gain = this.gain;
    this.series = [cur, gain, Math.max(0, 100 - cur - gain)];
    this.chart = { type: 'donut', height: this.size, width: this.size, sparkline: { enabled: true },
                   animations: { enabled: false } };
    this.colors = [cur >= 75 ? '#16a34a' : cur >= 50 ? '#f59e0b' : '#ef4444', GAIN, TRACK];
    this.tooltip = { enabled: this.hasGain, fillSeriesColor: false, y: { formatter: (v: number) => `${v}` } };
  }
}
