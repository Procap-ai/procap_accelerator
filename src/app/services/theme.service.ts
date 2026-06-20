import { Injectable, signal } from '@angular/core';

const KEY = 'meridian_theme';
type Theme = 'dark' | 'light';

/** Dark-first theme toggle. Adds/removes `theme-light` on <body>; quality.scss reacts via
 *  :host-context(.theme-light). Choice persists in localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  constructor() {
    const saved = (localStorage.getItem(KEY) as Theme) || 'dark';
    this.set(saved);
  }

  toggle(): void { this.set(this.theme() === 'dark' ? 'light' : 'dark'); }

  set(t: Theme): void {
    this.theme.set(t);
    document.body.classList.toggle('theme-light', t === 'light');
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  }
}
