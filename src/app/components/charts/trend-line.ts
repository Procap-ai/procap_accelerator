import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexStroke,
  ApexXAxis, ApexYAxis, NgApexchartsModule,
} from 'ng-apexcharts';

/** Dark line/area trend chart. Pass one or more named series; a series whose name starts with
 *  "Projected" renders dashed. Options are rebuilt in ngOnChanges (not per-cycle getters) so the
 *  chart only re-renders when its inputs actually change. */
@Component({
  selector: 'app-trend-line',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <apx-chart [series]="series" [chart]="chart" [colors]="colors" [stroke]="stroke" [fill]="fill"
               [xaxis]="xaxis" [yaxis]="yaxis" [grid]="grid" [legend]="legend"
               [dataLabels]="noLabels" [tooltip]="tooltip"></apx-chart>
  `,
})
export class TrendLineComponent implements OnChanges {
  @Input() series: ApexAxisChartSeries = [];
  @Input() categories: string[] = [];
  @Input() colors: string[] = ['#38bdf8', '#22c55e'];
  @Input() height = 220;
  @Input() area = true;
  @Input() yMax?: number;
  @Input() suffix = '';

  chart: ApexChart = { type: 'area', height: 220, toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit', background: 'transparent' };
  stroke: ApexStroke = { curve: 'smooth', width: 2.5 };
  fill: ApexFill = { type: 'solid', opacity: 0 };
  xaxis: ApexXAxis = {};
  yaxis: ApexYAxis = {};
  legend: ApexLegend = { show: false };
  readonly grid: ApexGrid = { borderColor: '#232b36', strokeDashArray: 3 };
  readonly noLabels: ApexDataLabels = { enabled: false };
  readonly tooltip = { theme: 'dark' };

  ngOnChanges(): void {
    this.chart = { type: this.area ? 'area' : 'line', height: this.height, toolbar: { show: false },
                   animations: { enabled: false }, fontFamily: 'inherit', background: 'transparent' };
    const dash = (this.series as { name?: string }[]).map(s => (s.name || '').startsWith('Projected') ? 6 : 0);
    this.stroke = { curve: 'smooth', width: 2.5, dashArray: dash };
    this.fill = this.area
      ? { type: 'gradient', gradient: { shadeIntensity: 0.4, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95] } }
      : { type: 'solid', opacity: 0 };
    this.xaxis = { categories: this.categories, labels: { style: { colors: '#7d8794', fontSize: '11px' } },
                   axisBorder: { show: false }, axisTicks: { show: false } };
    this.yaxis = { max: this.yMax, labels: { style: { colors: '#7d8794', fontSize: '11px' },
                   formatter: (v: number) => `${Math.round(v)}${this.suffix}` } };
    this.legend = { show: this.series.length > 1, position: 'top', horizontalAlign: 'right',
                    labels: { colors: '#aeb9c6' }, fontSize: '12px' };
  }
}
