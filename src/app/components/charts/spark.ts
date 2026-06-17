import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ApexAxisChartSeries, ApexChart, NgApexchartsModule } from 'ng-apexcharts';

/** Tiny inline sparkline (area) for per-repo / per-engineer trend cells. */
@Component({
  selector: 'app-spark',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `<apx-chart [series]="series" [chart]="chart" [colors]="[color]" [stroke]="{curve:'smooth', width:2}"
                        [fill]="fill" [tooltip]="{enabled:false}"></apx-chart>`,
  styles: [`:host { display: inline-block; line-height: 0; }`],
})
export class SparkComponent {
  @Input() data: number[] = [];
  @Input() color = '#38bdf8';
  @Input() width = 90;
  @Input() height = 32;

  get series(): ApexAxisChartSeries { return [{ name: 'v', data: this.data.length ? this.data : [0, 0] }]; }
  get chart(): ApexChart {
    return { type: 'area', width: this.width, height: this.height, sparkline: { enabled: true },
             animations: { enabled: true, speed: 400 } };
  }
  get fill() {
    return { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.0, stops: [0, 100] } };
  }
}
