import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import {
  ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke,
  ApexTooltip, NgApexchartsModule,
} from 'ng-apexcharts';

const CUR = '#38bdf8';    // sky — current coverage
const GAIN = '#22c55e';   // green — projected gain from the current selection
const TRACK = '#1b232e';  // dark track

/** Coverage donut: current coverage as a solid sky arc, projected gain as a separate green arc.
 *  Chart options are rebuilt in ngOnChanges (not per-cycle getters) so it doesn't re-render every
 *  change-detection tick. */
@Component({
  selector: 'app-donut',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="donut-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="series" [chart]="chart" [plotOptions]="plotOptions" [colors]="colors"
                 [stroke]="stroke" [dataLabels]="noLabels" [legend]="noLegend" [tooltip]="tooltip"
                 [labels]="segLabels"></apx-chart>
      <div class="center">
        <span class="num" [style.fontSize.px]="size * 0.2">{{ cur }}<small>%</small></span>
        <span class="proj" *ngIf="hasGain">→ {{ proj }}%</span>
      </div>
    </div>
    <div class="cap" *ngIf="label">{{ label }}</div>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
    .donut-wrap { position: relative; }
    .center { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; pointer-events: none; }
    .num { font-weight: 800; letter-spacing: -.02em; color: #e6edf3; line-height: 1; }
    .num small { font-size: .55em; color: #8b98a8; font-weight: 700; }
    .proj { font-size: 13px; font-weight: 700; color: #22c55e; margin-top: 3px; }
    .cap { font-size: 12px; color: #aeb9c6; font-weight: 600; text-align: center; }
  `],
})
export class DonutComponent implements OnChanges {
  @Input() current = 0;
  @Input() projected = 0;
  @Input() label = '';
  @Input() size = 150;

  series: ApexNonAxisChartSeries = [0, 0, 100];
  chart: ApexChart = { type: 'donut', height: 150, width: 150, sparkline: { enabled: true }, animations: { enabled: false } };
  readonly colors = [CUR, GAIN, TRACK];
  readonly segLabels = ['Current', 'Planned gain', 'Remaining'];
  readonly plotOptions: ApexPlotOptions = { pie: { donut: { size: '64%' }, expandOnClick: false } };
  readonly stroke: ApexStroke = { width: 0 };
  readonly noLabels: ApexDataLabels = { enabled: false };
  readonly noLegend: ApexLegend = { show: false };
  tooltip: ApexTooltip = { enabled: false, fillSeriesColor: false, y: { formatter: (v: number) => `${v}%` } };

  private clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
  get cur() { return this.clamp(this.current); }
  get proj() { return this.clamp(this.projected); }
  get gain() { return Math.max(0, this.proj - this.cur); }
  get hasGain() { return this.gain > 0; }

  ngOnChanges(): void {
    const cur = this.cur, gain = this.gain;
    this.series = [cur, gain, Math.max(0, 100 - cur - gain)];
    this.chart = { type: 'donut', height: this.size, width: this.size, sparkline: { enabled: true },
                   animations: { enabled: false } };
    this.tooltip = { enabled: this.hasGain, fillSeriesColor: false, y: { formatter: (v: number) => `${v}%` } };
  }
}
