import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface BarRow {
  label: string;
  value: number;       // 0..max
  projected?: number;  // optional overlay (>= value)
  caption?: string;    // right-aligned text (e.g. "10% → 90%")
}

/** Labelled horizontal bars. `value` is filled solid; `projected` (if larger) shows as a lighter
 *  overlay so live estimates read at a glance. Values are scaled against `max` (default 100). */
@Component({
  selector: 'app-bar-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bars">
      <div class="row" *ngFor="let r of rows">
        <div class="top">
          <span class="lbl">{{ r.label }}</span>
          <span class="cap" *ngIf="r.caption">{{ r.caption }}</span>
        </div>
        <div class="track">
          <span class="proj" *ngIf="(r.projected ?? 0) > r.value"
                [style.width.%]="pct(r.projected!)"></span>
          <span class="fill" [style.width.%]="pct(r.value)"></span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .row { margin-bottom: 12px; }
    .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; gap: 10px; }
    .lbl { font-size: 13.5px; color: #334155; font-weight: 600; }
    .cap { font-size: 12px; color: #64748b; white-space: nowrap; }
    .track { position: relative; height: 9px; border-radius: 6px; background: #eef3f8; overflow: hidden; }
    .fill, .proj { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; transition: width .5s ease; }
    .proj { background: #bae6fd; }
    .fill { background: #0ea5e9; }
  `],
})
export class BarListComponent {
  @Input() rows: BarRow[] = [];
  @Input() max = 100;
  pct(v: number) { return Math.max(0, Math.min(100, (v / this.max) * 100)); }
}
