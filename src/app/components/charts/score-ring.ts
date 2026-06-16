import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ApexChart, ApexPlotOptions, NgApexchartsModule } from 'ng-apexcharts';

/** 0-100 gauge built on an ApexCharts radialBar. Colour follows the score band. */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="ring-wrap" [style.width.px]="size" [style.height.px]="size">
      <apx-chart [series]="[pct]" [chart]="chart" [plotOptions]="plotOptions"
                 [colors]="[color]" [labels]="['']"></apx-chart>
    </div>
    <div class="cap" *ngIf="label">{{ label }}</div>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
    .ring-wrap { position: relative; }
    .cap { font-size: 12px; color: #64748b; font-weight: 600; text-align: center; }
  `],
})
export class ScoreRingComponent {
  @Input() value = 0;
  @Input() label = '';
  @Input() size = 92;
  @Input() suffix = '';
  @Input() displayValue?: number;

  get pct() { return Math.max(0, Math.min(100, Math.round(this.value))); }
  get display() { return Math.round(this.displayValue ?? this.value); }
  get color() {
    const v = this.pct;
    if (v >= 75) { return '#16a34a'; }
    if (v >= 50) { return '#f59e0b'; }
    return '#ef4444';
  }

  get chart(): ApexChart {
    return { type: 'radialBar', height: this.size, width: this.size, sparkline: { enabled: true },
             animations: { enabled: true, speed: 450 } };
  }

  get plotOptions(): ApexPlotOptions {
    const fs = `${Math.round(this.size * 0.24)}px`;
    return {
      radialBar: {
        hollow: { size: '58%' },
        track: { background: '#e8eef5', strokeWidth: '100%' },
        dataLabels: {
          name: { show: false },
          value: { show: true, offsetY: 6, fontSize: fs, fontWeight: 800,
                   color: this.color, formatter: () => `${this.display}${this.suffix}` },
        },
      },
    };
  }
}
