import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexLegend, ApexPlotOptions, ApexXAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';

export interface BarRow {
  label: string;
  value: number;       // 0..max
  projected?: number;  // optional "after" value (>= value)
  caption?: string;    // unused with the charted version, kept for API compatibility
}

/** Grouped horizontal bars (ApexCharts) showing each feature's current value and its projected
 *  "after" value. Scaled against `max` (default 100). */
@Component({
  selector: 'app-bar-list',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <apx-chart [series]="series" [chart]="chart" [plotOptions]="plotOptions" [xaxis]="xaxis"
               [colors]="['#bae6fd', '#0ea5e9']" [dataLabels]="dataLabels" [legend]="legend"></apx-chart>
  `,
})
export class BarListComponent {
  @Input() rows: BarRow[] = [];
  @Input() max = 100;

  get series(): ApexAxisChartSeries {
    return [
      { name: 'Now', data: this.rows.map(r => Math.round(r.value)) },
      { name: 'After', data: this.rows.map(r => Math.round(r.projected ?? r.value)) },
    ];
  }

  get chart(): ApexChart {
    return { type: 'bar', height: this.rows.length * 46 + 56, toolbar: { show: false },
             animations: { enabled: true, speed: 400 }, fontFamily: 'inherit' };
  }

  get plotOptions(): ApexPlotOptions {
    return { bar: { horizontal: true, borderRadius: 4, barHeight: '70%' } };
  }

  get xaxis(): ApexXAxis {
    return {
      categories: this.rows.map(r => r.label),
      max: this.max,
      labels: { formatter: (v: string) => `${v}%`, style: { colors: '#94a3b8' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    };
  }

  get dataLabels(): ApexDataLabels { return { enabled: false }; }
  get legend(): ApexLegend { return { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px' }; }
}
