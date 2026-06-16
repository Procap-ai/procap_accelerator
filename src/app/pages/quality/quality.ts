import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { ScoreRingComponent } from '../../components/charts/score-ring';
import { DonutComponent } from '../../components/charts/donut';
import { QualityService } from '../../services/quality.service';
import { RepoStore, SavedRepo } from '../../services/repo-store';

@Component({
  selector: 'app-quality',
  imports: [CommonModule, FormsModule, RouterModule, ScoreRingComponent, DonutComponent],
  templateUrl: './quality.html',
  styleUrl: './quality.scss',
})
export class QualityComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly router = inject(Router);
  private readonly store = inject(RepoStore);

  repoUrl = '';
  validating = false;
  validationMsg = '';
  validationOk: boolean | null = null;
  starting = false;

  repos: SavedRepo[] = [];

  ngOnInit(): void {
    this.repos = this.store.list();
  }

  // ── aggregate dashboard ──
  get analyzed(): SavedRepo[] {
    return this.repos.filter(r => r.scores);
  }
  get avgOverall(): number {
    const a = this.analyzed;
    return a.length ? Math.round(a.reduce((s, r) => s + (r.scores?.overall || 0), 0) / a.length) : 0;
  }
  get avgCoverage(): number {
    const a = this.analyzed.filter(r => r.coverage != null);
    return a.length ? Math.round(a.reduce((s, r) => s + (r.coverage || 0), 0) / a.length) : 0;
  }
  get totalIssues(): number {
    return this.analyzed.reduce((s, r) => s + (r.issues || 0), 0);
  }

  // ── add repo ──
  onValidate(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.validating = true;
    this.validationMsg = '';
    this.validationOk = null;
    this.svc.validate(url).subscribe({
      next: r => { this.validating = false; this.validationOk = r.valid; this.validationMsg = r.message; },
      error: () => { this.validating = false; this.validationOk = false; this.validationMsg = 'Validation failed. Check the URL.'; },
    });
  }

  onStart(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.starting = true;
    this.svc.createSession(url).subscribe({
      next: ({ session_id }) => {
        this.store.upsert({ repoUrl: url, sessionId: session_id, status: 'analyzing' });
        this.starting = false;
        void this.router.navigate(['/quality/session', session_id]);
      },
      error: (err: unknown) => {
        this.starting = false;
        this.validationOk = false;
        this.validationMsg = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to start analysis.';
      },
    });
  }

  open(r: SavedRepo): void {
    void this.router.navigate(['/quality/session', r.sessionId]);
  }

  remove(r: SavedRepo, ev: Event): void {
    ev.stopPropagation();
    this.repos = this.store.remove(r.repoUrl);
  }

  // ── view helpers ──
  shortRepo(url: string): string {
    return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  }
  trackByUrl(_i: number, r: SavedRepo): string { return r.repoUrl; }
}
