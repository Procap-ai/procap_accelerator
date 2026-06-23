import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import {
  AutopilotService, AutopilotTarget, RunListItem, TargetKind, CreateTargetPayload, CoverageLevel,
} from '../../services/autopilot.service';

@Component({
  selector: 'app-autopilot',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './autopilot.html',
  styleUrl: './autopilot.scss',
})
export class AutopilotComponent implements OnInit {
  private readonly svc = inject(AutopilotService);
  private readonly router = inject(Router);

  targets: AutopilotTarget[] = [];
  runs: RunListItem[] = [];
  loading = true;

  // ── add-target form ──
  showForm = false;
  kind: TargetKind = 'website';
  name = '';
  coverage: CoverageLevel = 'minimal';
  siteUrl = '';
  repoUrl = '';
  githubToken = '';
  withCreds = false;
  username = '';
  password = '';
  loginUrl = '';

  submitting = false;
  formError = '';
  runningTargetId = '';

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.loading = true;
    this.svc.listTargets().subscribe({
      next: ({ targets }) => { this.targets = targets; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.svc.listRuns().subscribe({ next: ({ runs }) => { this.runs = runs.slice(0, 12); } });
  }

  toggleForm(): void { this.showForm = !this.showForm; this.formError = ''; }
  setKind(k: TargetKind): void { this.kind = k; this.formError = ''; }

  addTarget(): void {
    this.formError = '';
    const payload: CreateTargetPayload = { kind: this.kind, name: this.name.trim() || undefined, coverage: this.coverage };
    if (this.kind === 'website') {
      if (!this.siteUrl.trim()) { this.formError = 'Enter a website URL.'; return; }
      payload.site_url = this.siteUrl.trim();
      if (this.withCreds && this.username && this.password) {
        payload.creds = { username: this.username, password: this.password, login_url: this.loginUrl.trim() || undefined };
      }
    } else {
      if (!this.repoUrl.trim()) { this.formError = 'Enter a GitHub repo URL.'; return; }
      payload.repo_url = this.repoUrl.trim();
      if (this.githubToken.trim()) payload.github_token = this.githubToken.trim();
    }
    this.submitting = true;
    this.svc.createTarget(payload).subscribe({
      next: () => { this.submitting = false; this.resetForm(); this.refresh(); },
      error: (err: unknown) => {
        this.submitting = false;
        this.formError = (err as { error?: { error?: string } })?.error?.error ?? 'Could not add target.';
      },
    });
  }

  resetForm(): void {
    this.showForm = false;
    this.name = ''; this.coverage = 'minimal'; this.siteUrl = ''; this.repoUrl = ''; this.githubToken = '';
    this.withCreds = false; this.username = ''; this.password = ''; this.loginUrl = '';
  }

  runNow(t: AutopilotTarget): void {
    this.runningTargetId = t.target_id;
    this.svc.createRun(t.target_id).subscribe({
      next: ({ run_id }) => { this.runningTargetId = ''; void this.router.navigate(['/autopilot/run', run_id]); },
      error: (err: unknown) => {
        this.runningTargetId = '';
        alert((err as { error?: { error?: string } })?.error?.error ?? 'Could not start run.');
      },
    });
  }

  remove(t: AutopilotTarget): void {
    if (!confirm(`Delete target "${t.name}"? Its credentials will be removed.`)) return;
    this.svc.deleteTarget(t.target_id).subscribe({ next: () => this.refresh() });
  }

  statusClass(s?: string): string {
    if (!s) return '';
    if (s === 'done' || s === 'pr_open') return 'ok';
    if (s === 'failed') return 'bad';
    return 'busy';
  }

  ago(ts?: number): string {
    if (!ts) return '';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }
}
