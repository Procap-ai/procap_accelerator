import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke,
  ApexTooltip, NgApexchartsModule,
} from 'ng-apexcharts';

const CUR = '#38bdf8';    // sky — current coverage
const GAIN = '#22c55e';   // green — projected gain from the current selection
const TRACK = '#1b232e';  // dark track

/** Coverage donut: current coverage as a solid sky arc, the projected gain as a separate green arc,
 *  remainder as track. Center shows current % and (when a gain exists) the projected %. */
@Component({
  selector: 'app-donut',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="donut-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="series" [chart]="{type:'donut', height:size, width:size, sparkline:{enabled:true}, animations:{enabled:true, speed:450}}"
                 [plotOptions]="plotOptions" [colors]="colors" [stroke]="stroke"
                 [dataLabels]="noLabels" [legend]="noLegend" [tooltip]="tooltip" [labels]="segLabels"></apx-chart>
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
export class DonutComponent {
  @Input() current = 0;
  @Input() projected = 0;
  @Input() label = '';
  @Input() size = 150;

  private clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
  get cur() { return this.clamp(this.current); }
  get proj() { return this.clamp(this.projected); }
  get gain() { return Math.max(0, this.proj - this.cur); }
  get hasGain() { return this.gain > 0; }
  get series(): ApexNonAxisChartSeries { return [this.cur, this.gain, Math.max(0, 100 - this.cur - this.gain)]; }
  get segLabels(): string[] { return ['Current', 'Planned gain', 'Remaining']; }
  get colors(): string[] { return [CUR, GAIN, TRACK]; }

  get plotOptions(): ApexPlotOptions { return { pie: { donut: { size: '64%' }, expandOnClick: false } }; }
  get stroke(): ApexStroke { return { width: 0 }; }
  get noLabels(): ApexDataLabels { return { enabled: false }; }
  get noLegend(): ApexLegend { return { show: false }; }
  get tooltip(): ApexTooltip {
    return { enabled: this.hasGain, fillSeriesColor: false, y: { formatter: (v: number) => `${v}%` } };
  }
}
