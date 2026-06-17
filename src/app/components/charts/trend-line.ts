import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexLegend, ApexStroke,
  ApexXAxis, ApexYAxis, NgApexchartsModule,
} from 'ng-apexcharts';

/** Dark line/area trend chart. Pass one or more named series; a series whose name starts with
 *  "Projected" renders dashed (used for the savings projected-vs-actual story). */
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
export class TrendLineComponent {
  @Input() series: ApexAxisChartSeries = [];
  @Input() categories: string[] = [];
  @Input() colors: string[] = ['#38bdf8', '#22c55e'];
  @Input() height = 220;
  @Input() area = true;
  @Input() yMax?: number;
  @Input() suffix = '';

  get chart(): ApexChart {
    return { type: this.area ? 'area' : 'line', height: this.height, toolbar: { show: false },
             animations: { enabled: true, speed: 450 }, fontFamily: 'inherit', background: 'transparent' };
  }
  get stroke(): ApexStroke {
    const dash = (this.series as { name?: string }[]).map(s => (s.name || '').startsWith('Projected') ? 6 : 0);
    return { curve: 'smooth', width: 2.5, dashArray: dash };
  }
  get fill(): ApexFill {
    return this.area
      ? { type: 'gradient', gradient: { shadeIntensity: 0.4, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95] } }
      : { type: 'solid', opacity: 0 };
  }
  get xaxis(): ApexXAxis {
    return { categories: this.categories, labels: { style: { colors: '#7d8794', fontSize: '11px' } },
             axisBorder: { show: false }, axisTicks: { show: false } };
  }
  get yaxis(): ApexYAxis {
    return { max: this.yMax, labels: { style: { colors: '#7d8794', fontSize: '11px' },
             formatter: (v: number) => `${Math.round(v)}${this.suffix}` } };
  }
  get grid(): ApexGrid { return { borderColor: '#232b36', strokeDashArray: 3 }; }
  get legend(): ApexLegend { return { show: this.series.length > 1, position: 'top', horizontalAlign: 'right',
    labels: { colors: '#aeb9c6' }, fontSize: '12px' }; }
  get noLabels(): ApexDataLabels { return { enabled: false }; }
  get tooltip() { return { theme: 'dark' }; }
}
