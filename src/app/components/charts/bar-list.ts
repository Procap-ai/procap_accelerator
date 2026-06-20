import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
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
 *  (green) stacked on top. Options are built once per input change (not via per-cycle getters),
 *  so ng-apexcharts doesn't re-render every change-detection tick. */
@Component({
  selector: 'app-bar-list',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <apx-chart [series]="series" [chart]="chart" [plotOptions]="plotOptions" [xaxis]="xaxis"
               [colors]="colors" [fill]="fill" [dataLabels]="dataLabels"
               [legend]="legend" [grid]="grid" [tooltip]="tooltip"></apx-chart>
  `,
})
export class BarListComponent implements OnChanges {
  @Input() rows: BarRow[] = [];
  @Input() max = 100;

  series: ApexAxisChartSeries = [];
  chart: ApexChart = { type: 'bar', stacked: true, height: 120, toolbar: { show: false },
                       animations: { enabled: false }, fontFamily: 'inherit' };
  xaxis: ApexXAxis = {};
  readonly colors = ['#38bdf8', '#22c55e'];
  readonly plotOptions: ApexPlotOptions = { bar: { horizontal: true, borderRadius: 3, borderRadiusApplication: 'end', barHeight: '64%' } };
  readonly fill: ApexFill = { opacity: 1 };
  readonly dataLabels: ApexDataLabels = { enabled: false };
  readonly legend: ApexLegend = { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#aeb9c6' } };
  readonly grid = { borderColor: '#232b36', strokeDashArray: 3 };
  readonly tooltip = { theme: 'dark', y: { formatter: (v: number) => `${v}%` } };

  ngOnChanges(): void {
    const rows = this.rows || [];
    this.series = [
      { name: 'Current', data: rows.map(r => Math.round(r.value)) },
      { name: 'Planned gain', data: rows.map(r => Math.max(0, Math.round((r.projected ?? r.value) - r.value))) },
    ];
    this.chart = { type: 'bar', stacked: true, height: rows.length * 44 + 56, toolbar: { show: false },
                   animations: { enabled: false }, fontFamily: 'inherit' };
    this.xaxis = {
      categories: rows.map(r => r.label),
      max: this.max,
      labels: { formatter: (v: string) => `${v}%`, style: { colors: '#94a3b8' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    };
  }
}
