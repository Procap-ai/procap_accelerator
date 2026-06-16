import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * Coverage-style donut. Draws the current fill solid; if `projected` > current, the gain is
 * shown as a lighter overlay arc so the user sees the live "after selection" state.
 */
@Component({
  selector: 'app-donut',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="donut" [style.width.px]="size" [style.height.px]="size">
      <svg [attr.viewBox]="'0 0 ' + size + ' ' + size">
        <g [attr.transform]="'rotate(-90 ' + c + ' ' + c + ')'">
          <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" class="track" [attr.stroke-width]="stroke" fill="none" />
          <circle *ngIf="projAbove" [attr.cx]="c" [attr.cy]="c" [attr.r]="r" class="proj"
                  [attr.stroke-width]="stroke" fill="none" stroke-linecap="round"
                  [attr.stroke-dasharray]="circ" [attr.stroke-dashoffset]="off(projected)" />
          <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" class="cur"
                  [attr.stroke-width]="stroke" fill="none" stroke-linecap="round"
                  [attr.stroke-dasharray]="circ" [attr.stroke-dashoffset]="off(current)" />
        </g>
      </svg>
      <div class="val">
        <span class="num">{{ round(current) }}<small>%</small></span>
        <span class="proj-num" *ngIf="projAbove">→ {{ round(projected) }}%</span>
        <span class="cap" *ngIf="label">{{ label }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .donut { position: relative; }
    svg { width: 100%; height: 100%; display: block; }
    .track { stroke: #e8eef5; }
    .cur { stroke: #0ea5e9; transition: stroke-dashoffset .5s ease; }
    .proj { stroke: #bae6fd; transition: stroke-dashoffset .5s ease; }
    .val { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
    .num { font-weight: 800; font-size: 30px; letter-spacing: -.02em; color: #0f172a; line-height: 1; }
    .num small { font-size: 15px; color: #64748b; font-weight: 700; }
    .proj-num { font-size: 13px; font-weight: 700; color: #0284c7; }
    .cap { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
  `],
})
export class DonutComponent {
  @Input() current = 0;
  @Input() projected = 0;
  @Input() label = '';
  @Input() size = 150;

  get stroke() { return Math.max(10, Math.round(this.size * 0.11)); }
  get c() { return this.size / 2; }
  get r() { return this.c - this.stroke / 2 - 1; }
  get circ() { return 2 * Math.PI * this.r; }
  get projAbove() { return this.projected > this.current + 0.5; }
  off(v: number) { return this.circ * (1 - Math.max(0, Math.min(100, v)) / 100); }
  round(v: number) { return Math.round(v); }
}
