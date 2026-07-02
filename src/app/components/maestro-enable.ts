import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CoverageLevel } from '../services/maestro.service';
import { MaestroLinkService, LinkStatus } from '../services/maestro-link.service';

/**
 * Reusable "Enable Maestro" control for a Meridian repo (fleet rows, repo view, Agentic picker).
 *
 * Shows the repo's Maestro link status and, when not yet auto-managed, an explainer of exactly what
 * enabling does (non-destructive; converts to standard Playwright on a maestro/playwright branch;
 * auto-heals + triages; runs on demand). Confirming find-or-creates the target and marks it managed.
 */
@Component({
  selector: 'app-maestro-enable',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="mx" (click)="$event.stopPropagation()">
    <ng-container *ngIf="ready">
      <ng-container [ngSwitch]="status">
        <ng-container *ngSwitchCase="'managed'">
          <span class="mx-chip on">⚡ Auto-managed</span>
          <a class="mx-link" [routerLink]="['/maestro/target', targetId]">Open in Maestro →</a>
          <button class="mx-ghost" (click)="setManaged(false)" title="Pause auto-management">pause</button>
        </ng-container>
        <ng-container *ngSwitchCase="'connected'">
          <span class="mx-chip">Connected</span>
          <button class="mx-btn" (click)="setManaged(true)">Auto-manage</button>
          <a class="mx-link" [routerLink]="['/maestro/target', targetId]">Open →</a>
        </ng-container>
        <ng-container *ngSwitchDefault>
          <button class="mx-btn" (click)="open = !open">⚡ Enable Maestro</button>
        </ng-container>
      </ng-container>
    </ng-container>

    <!-- explainer / confirm -->
    <div class="mx-pop" *ngIf="open">
      <h4>Enable Maestro on <code>{{ short }}</code></h4>
      <p class="mx-safe">✔ Non-destructive — your code and existing branches are untouched. No data loss.</p>
      <ul>
        <li>Maestro clones the repo and works on a new <code>maestro/playwright</code> branch.</li>
        <li>Existing Selenium / other UI tests are <b>converted to standard Playwright</b> on that branch.</li>
        <li>It fills coverage gaps, then runs the suite in the cloud on demand.</li>
        <li>Flaky tests are <b>auto-healed</b>; only real failures are triaged into bugs.</li>
        <li>You review the branch and merge if and when you want.</li>
      </ul>
      <div class="mx-opts">
        <label class="mx-lbl">Coverage
          <select [(ngModel)]="coverage">
            <option *ngFor="let c of levels" [value]="c">{{ c }}</option>
          </select>
        </label>
        <label class="mx-lbl" *ngIf="!hasCreds">Access token <em>(private repo / to push the branch — optional for public)</em>
          <input type="password" [(ngModel)]="githubToken" autocomplete="new-password" placeholder="ghp_…" />
        </label>
        <p class="mx-creds" *ngIf="hasCreds">✔ A GitHub token is already stored for this repo — no need to re-enter it.</p>
      </div>
      <p class="mx-err" *ngIf="err">{{ err }}</p>
      <div class="mx-actions">
        <button class="mx-cancel" (click)="open = false">Cancel</button>
        <button class="mx-go" [disabled]="busy" (click)="confirm()">{{ busy ? 'Enabling…' : 'Enable Maestro' }}</button>
      </div>
    </div>
  </div>`,
  styles: [`
    .mx { position: relative; display: inline-flex; align-items: center; gap: 8px; }
    .mx-btn { font-size: 12px; font-weight: 700; cursor: pointer; color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid var(--border-accent);
      border-radius: 8px; padding: 5px 11px; white-space: nowrap; }
    .mx-btn:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
    .mx-chip { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
      padding: 3px 9px; border-radius: 999px; background: var(--panel-3); color: var(--muted); white-space: nowrap; }
    .mx-chip.on { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
      border: 1px solid var(--border-accent); }
    .mx-link { font-size: 12px; font-weight: 700; color: var(--accent); text-decoration: none; white-space: nowrap; }
    .mx-link:hover { text-decoration: underline; }
    .mx-ghost { font-size: 11px; color: var(--muted); background: none; border: 0; cursor: pointer; text-decoration: underline; }
    .mx-pop { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: 360px; text-align: left;
      background: var(--panel); border: 1px solid var(--border-accent); border-radius: 12px; padding: 14px 16px;
      box-shadow: 0 16px 44px rgba(0,0,0,.45); }
    .mx-pop h4 { margin: 0 0 8px; font-size: 14px; color: var(--text); font-weight: 800; }
    .mx-pop code { font-family: ui-monospace, monospace; }
    .mx-safe { margin: 0 0 8px; font-size: 12.5px; color: var(--accent); font-weight: 600; }
    .mx-pop ul { margin: 0 0 12px; padding-left: 18px; }
    .mx-pop li { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 3px; }
    .mx-opts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
    .mx-lbl { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: .03em; }
    .mx-lbl em { font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--muted); }
    .mx-lbl select, .mx-lbl input { background: var(--panel-2); border: 1px solid var(--border); color: var(--text);
      border-radius: 8px; padding: 7px 10px; font-size: 12.5px; text-transform: none; }
    .mx-lbl select:focus, .mx-lbl input:focus { outline: none; border-color: var(--accent); }
    .mx-creds { margin: 0; font-size: 12px; color: var(--accent); }
    .mx-err { margin: 0 0 8px; font-size: 12px; color: var(--bad); }
    .mx-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .mx-cancel { font-size: 12.5px; color: var(--text-2); background: var(--panel-2); border: 1px solid var(--border);
      border-radius: 8px; padding: 7px 13px; cursor: pointer; }
    .mx-go { font-size: 12.5px; font-weight: 800; color: #04121c; background: var(--accent); border: 1px solid var(--accent);
      border-radius: 8px; padding: 7px 14px; cursor: pointer; }
    .mx-go[disabled] { opacity: .6; cursor: default; }
  `],
})
export class MaestroEnableComponent implements OnInit {
  @Input({ required: true }) repoUrl!: string;

  private readonly link = inject(MaestroLinkService);

  ready = false;
  status: LinkStatus = 'none';
  open = false;
  busy = false;
  err = '';
  coverage: CoverageLevel = 'minimal';
  githubToken = '';
  readonly levels: CoverageLevel[] = ['minimal', 'critical', 'standard', 'deep'];

  ngOnInit(): void {
    this.link.load().subscribe({
      next: () => { this.ready = true; this.refresh(); },
      error: () => { this.ready = true; },
    });
  }

  private refresh(): void { this.status = this.link.status(this.repoUrl); }

  get targetId(): string | undefined { return this.link.targetFor(this.repoUrl)?.target_id; }
  get hasCreds(): boolean { return this.link.hasCreds(this.repoUrl); }
  get short(): string { return (this.repoUrl || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }

  confirm(): void {
    this.busy = true; this.err = '';
    this.link.enable(this.repoUrl, { coverage: this.coverage, githubToken: this.githubToken }).subscribe({
      next: () => { this.busy = false; this.open = false; this.githubToken = ''; this.refresh(); },
      error: (e: unknown) => {
        this.busy = false;
        this.err = (e as { error?: { error?: string } })?.error?.error ?? 'Could not enable Maestro.';
      },
    });
  }

  setManaged(on: boolean): void { this.link.setManaged(this.repoUrl, on); this.refresh(); }
}
