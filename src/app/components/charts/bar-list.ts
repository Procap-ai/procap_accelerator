import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexLegend, ApexPlotOptions, ApexXAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';

export interface BarRow {
  label: string;
  value: number;       // current (0..max)
  projected?: number;  // projected total (>= value); the gain is projected − value
  caption?: string;    // kept for API compatibility
}

/** Stacked horizontal bars: each feature shows its CURRENT value (sky) plus the projected GAIN
 *  (green) stacked on top, so the bar visibly extends as items are selected. */
@Component({
  selector: 'app-bar-list',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <apx-chart [series]="series" [chart]="chart" [plotOptions]="plotOptions" [xaxis]="xaxis"
               [colors]="['#0ea5e9', '#22c55e']" [fill]="fill" [dataLabels]="dataLabels"
               [legend]="legend"></apx-chart>
  `,
})
export class BarListComponent {
  @Input() rows: BarRow[] = [];
  @Input() max = 100;

  get series(): ApexAxisChartSeries {
    return [
      { name: 'Current', data: this.rows.map(r => Math.round(r.value)) },
      { name: 'Planned gain', data: this.rows.map(r => Math.max(0, Math.round((r.projected ?? r.value) - r.value))) },
    ];
  }

  get chart(): ApexChart {
    return { type: 'bar', stacked: true, height: this.rows.length * 44 + 56,
             toolbar: { show: false }, animations: { enabled: true, speed: 400 }, fontFamily: 'inherit' };
  }

  get plotOptions(): ApexPlotOptions {
    return { bar: { horizontal: true, borderRadius: 3, borderRadiusApplication: 'end', barHeight: '64%' } };
  }

  get xaxis(): ApexXAxis {
    return {
      categories: this.rows.map(r => r.label),
      max: this.max,
      labels: { formatter: (v: string) => `${v}%`, style: { colors: '#94a3b8' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    };
  }

  get fill(): ApexFill { return { opacity: 1 }; }
  get dataLabels(): ApexDataLabels { return { enabled: false }; }
  get legend(): ApexLegend { return { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px' }; }
}
