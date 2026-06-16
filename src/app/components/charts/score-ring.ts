import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/** Circular 0-100 gauge with a centred value + caption. Colour follows the score band. */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ring" [style.width.px]="size" [style.height.px]="size">
      <svg [attr.viewBox]="'0 0 ' + size + ' ' + size">
        <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" class="track"
                [attr.stroke-width]="stroke" fill="none" />
        <circle *ngIf="pct > 0" [attr.cx]="c" [attr.cy]="c" [attr.r]="r" [attr.stroke]="color"
                [attr.stroke-width]="stroke" fill="none" [attr.stroke-linecap]="linecap"
                [attr.stroke-dasharray]="arcLen + ' ' + circ"
                [attr.transform]="'rotate(-90 ' + c + ' ' + c + ')'" />
      </svg>
      <div class="val">
        <span class="num" [style.color]="color">{{ display }}</span>
        <span class="suffix" *ngIf="suffix">{{ suffix }}</span>
      </div>
    </div>
    <div class="cap" *ngIf="label">{{ label }}</div>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 6px; }
    .ring { position: relative; }
    svg { width: 100%; height: 100%; display: block; }
    .track { stroke: #e8eef5; }
    circle { transition: stroke-dasharray .5s ease, stroke .3s ease; }
    .val { position: absolute; inset: 0; display: flex; align-items: baseline; justify-content: center; }
    .num { font-weight: 800; font-size: 22px; letter-spacing: -.02em; line-height: 1; }
    .suffix { font-size: 11px; color: #64748b; margin-left: 1px; }
    .cap { font-size: 12px; color: #64748b; font-weight: 600; text-align: center; }
  `],
})
export class ScoreRingComponent {
  @Input() value = 0;          // 0-100
  @Input() label = '';
  @Input() size = 92;
  @Input() suffix = '';
  /** Optional override of the displayed number (defaults to rounded value). */
  @Input() displayValue?: number;

  get stroke() { return Math.max(6, Math.round(this.size * 0.1)); }
  get c() { return this.size / 2; }
  get r() { return this.c - this.stroke / 2 - 1; }
  get circ() { return 2 * Math.PI * this.r; }
  get pct() { return Math.max(0, Math.min(100, this.value)); }
  get arcLen() { return this.circ * this.pct / 100; }
  /** Round caps look broken on very short arcs (they collapse into a hook); use butt there. */
  get linecap() { return this.arcLen < this.stroke * 1.5 ? 'butt' : 'round'; }
  get display() { return Math.round(this.displayValue ?? this.value); }
  get color() {
    const v = this.pct;
    if (v >= 75) return '#16a34a';
    if (v >= 50) return '#f59e0b';
    return '#ef4444';
  }
}
