import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke,
  ApexTooltip, NgApexchartsModule,
} from 'ng-apexcharts';

const GAIN = '#22c55e';   // green — the improvement that selection will add
const TRACK = '#eef3f8';

/** 0-100 score gauge (ApexCharts donut). The ring shows the CURRENT score as a solid band and the
 *  projected GAIN as a separate green segment, so the chart visibly grows as items are selected. */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="ring-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="series" [chart]="{type:'donut', height:size, width:size, sparkline:{enabled:true}, animations:{enabled:true, speed:450}}"
                 [plotOptions]="plotOptions" [colors]="colors" [stroke]="stroke"
                 [dataLabels]="noLabels" [legend]="noLegend" [tooltip]="tooltip" [labels]="segLabels"></apx-chart>
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
    .was { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .cap { font-size: 12px; color: #64748b; font-weight: 600; text-align: center; }
  `],
})
export class ScoreRingComponent {
  @Input() current = 0;
  @Input() projected?: number;
  @Input() label = '';
  @Input() size = 92;
  @Input() suffix = '';

  private clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
  get cur() { return this.clamp(this.current); }
  get proj() { return this.clamp(this.projected ?? this.current); }
  get gain() { return Math.max(0, this.proj - this.cur); }
  get hasGain() { return this.gain > 0; }
  get series(): ApexNonAxisChartSeries { return [this.cur, this.gain, Math.max(0, 100 - this.cur - this.gain)]; }
  get segLabels(): string[] { return ['Current', 'Planned gain', 'Remaining']; }

  get band() {
    const v = this.proj;
    if (v >= 75) { return '#16a34a'; }
    if (v >= 50) { return '#f59e0b'; }
    return '#ef4444';
  }
  get numColor() { return this.band; }
  get colors(): string[] { return [this.cur >= 75 ? '#16a34a' : this.cur >= 50 ? '#f59e0b' : '#ef4444', GAIN, TRACK]; }

  get plotOptions(): ApexPlotOptions {
    return { pie: { donut: { size: '66%' }, expandOnClick: false } };
  }
  get stroke(): ApexStroke { return { width: 0 }; }
  get noLabels(): ApexDataLabels { return { enabled: false }; }
  get noLegend(): ApexLegend { return { show: false }; }
  get tooltip(): ApexTooltip {
    return { enabled: this.hasGain, fillSeriesColor: false, y: { formatter: (v: number) => `${v}` } };
  }
}
