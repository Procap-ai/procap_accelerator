import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ApexChart, ApexPlotOptions, NgApexchartsModule } from 'ng-apexcharts';

/** Coverage gauge (ApexCharts radialBar). Shows current %; if a higher `projected` is given it
 *  is surfaced as a "→ N%" sub-label. */
@Component({
  selector: 'app-donut',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="donut-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="[round(current)]" [chart]="chart" [plotOptions]="plotOptions"
                 [colors]="['#0ea5e9']" [labels]="[subLabel]"></apx-chart>
    </div>
    <div class="cap" *ngIf="label">{{ label }}</div>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
    .donut-wrap { position: relative; }
    .cap { font-size: 12px; color: #64748b; font-weight: 600; text-align: center; }
  `],
})
export class DonutComponent {
  @Input() current = 0;
  @Input() projected = 0;
  @Input() label = '';
  @Input() size = 150;

  round(v: number) { return Math.round(Math.max(0, Math.min(100, v))); }
  get projAbove() { return this.projected > this.current + 0.5; }
  get subLabel() { return this.projAbove ? `→ ${this.round(this.projected)}%` : ''; }

  get chart(): ApexChart {
    return { type: 'radialBar', height: this.size, width: this.size, sparkline: { enabled: true },
             animations: { enabled: true, speed: 450 } };
  }

  get plotOptions(): ApexPlotOptions {
    return {
      radialBar: {
        hollow: { size: '56%' },
        track: { background: '#e8eef5', strokeWidth: '100%' },
        dataLabels: {
          name: { show: this.projAbove, offsetY: 20, fontSize: '13px', fontWeight: 700, color: '#0284c7' },
          value: { show: true, offsetY: -6, fontSize: `${Math.round(this.size * 0.2)}px`,
                   fontWeight: 800, color: '#0f172a', formatter: () => `${this.round(this.current)}%` },
        },
      },
    };
  }
}
