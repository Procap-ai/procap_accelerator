import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { ApexAxisChartSeries, ApexChart, NgApexchartsModule } from 'ng-apexcharts';

/** Tiny inline sparkline (area) for per-repo / per-engineer trend cells.
 *  Builds STABLE option references in ngOnChanges (not getters) and disables animation so
 *  ng-apexcharts doesn't re-render every change-detection cycle — that churn caused the
 *  "Cannot read properties of null (reading 'node')" errors in list rows. */
@Component({
  selector: 'app-spark',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `<apx-chart [series]="series" [chart]="chart" [colors]="colors" [stroke]="stroke"
                        [fill]="fill" [tooltip]="tooltip"></apx-chart>`,
  styles: [`:host { display: inline-block; line-height: 0; }`],
})
export class SparkComponent implements OnChanges {
  @Input() data: number[] = [];
  @Input() color = '#38bdf8';
  @Input() width = 90;
  @Input() height = 32;

  series: ApexAxisChartSeries = [{ name: 'v', data: [0, 0] }];
  chart: ApexChart = { type: 'area', width: 90, height: 32, sparkline: { enabled: true },
                       animations: { enabled: false } };
  colors = [this.color];
  readonly stroke = { curve: 'smooth' as const, width: 2 };
  readonly fill = { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.0, stops: [0, 100] } };
  readonly tooltip = { enabled: false };

  ngOnChanges(): void {
    this.series = [{ name: 'v', data: this.data?.length ? this.data : [0, 0] }];
    this.chart = { type: 'area', width: this.width, height: this.height,
                   sparkline: { enabled: true }, animations: { enabled: false } };
    this.colors = [this.color];
  }
}
