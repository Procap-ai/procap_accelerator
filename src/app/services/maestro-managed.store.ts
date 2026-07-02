import { Injectable } from '@angular/core';

/**
 * Client-side record of which Maestro targets are "auto-managed".
 *
 * Auto-managed repos are the ones surfaced in the Maestro view for on-demand runs; Meridian's Agentic
 * page is where you connect a repo and flip this on/off. The backend has no `managed` field yet, so this
 * lives in localStorage (shared across the Meridian + Maestro views in the same browser). Default is
 * managed=true, so a newly connected repo shows up in Maestro immediately.
 */
@Injectable({ providedIn: 'root' })
export class MaestroManagedStore {
  private readonly key = 'maestro.managed';
  private map: Record<string, boolean> = this.load();

  private load(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { return {}; }
  }

  private save(): void {
    try { localStorage.setItem(this.key, JSON.stringify(this.map)); } catch { /* ignore */ }
  }

  /** Unknown targets are managed by default. */
  isManaged(id: string): boolean { return this.map[id] !== false; }

  set(id: string, managed: boolean): void { this.map[id] = managed; this.save(); }

  toggle(id: string): boolean { const v = !this.isManaged(id); this.set(id, v); return v; }
}
