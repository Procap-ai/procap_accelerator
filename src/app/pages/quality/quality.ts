import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';

import { QualityOption, QualityService, QualitySession } from '../../services/quality.service';

interface RecentRepo {
  sessionId: string;
  repoUrl: string;
  ts: number;
}

const RECENTS_KEY = 'procap_quality_recents';
const ACTIVE_STATUSES = ['created', 'analyzing', 'working', 'opening_pr'];

@Component({
  selector: 'app-quality',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './quality.html',
  styleUrl: './quality.scss'
})
export class QualityComponent implements OnInit, OnDestroy {
  private readonly svc = inject(QualityService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // entry form
  repoUrl = '';
  validating = false;
  validationMsg = '';
  validationOk: boolean | null = null;
  starting = false;
  recents: RecentRepo[] = [];

  // active session
  session: QualitySession | null = null;
  busyOption = '';            // option id being launched
  showTokenInput = false;
  githubToken = '';
  prError = '';

  private poll?: Subscription;

  ngOnInit(): void {
    this.recents = this.loadRecents();
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.startPolling(id);
      } else {
        this.stopPolling();
        this.session = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // ── entry ──
  onValidate(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.validating = true;
    this.validationMsg = '';
    this.validationOk = null;
    this.svc.validate(url).subscribe({
      next: r => { this.validating = false; this.validationOk = r.valid; this.validationMsg = r.message; },
      error: () => { this.validating = false; this.validationOk = false; this.validationMsg = 'Validation failed. Check the URL.'; }
    });
  }

  onStart(): void {
    const url = this.repoUrl.trim();
    if (!url) { return; }
    this.starting = true;
    this.svc.createSession(url).subscribe({
      next: ({ session_id }) => {
        this.saveRecent({ sessionId: session_id, repoUrl: url, ts: Date.now() });
        void this.router.navigate(['/quality/session', session_id]);
        this.starting = false;
      },
      error: (err: unknown) => {
        this.starting = false;
        this.validationOk = false;
        this.validationMsg = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to start session.';
      }
    });
  }

  openRecent(r: RecentRepo): void {
    void this.router.navigate(['/quality/session', r.sessionId]);
  }

  newSession(): void {
    void this.router.navigate(['/quality']);
  }

  // ── active session ──
  private startPolling(id: string): void {
    this.stopPolling();
    this.poll = interval(4000).pipe(
      startWith(0),
      switchMap(() => this.svc.getSession(id))
    ).subscribe({
      next: s => {
        this.session = s;
        if (this.busyOption && s.status !== 'analyzed') { this.busyOption = ''; }
        if (!this.isActive(s.status) && s.status !== 'analyzed' && s.status !== 'task_done') {
          // terminal-ish; keep last poll but slow down by stopping when truly done
          if (s.status === 'pr_open' || s.status === 'failed') { this.stopPolling(); }
        }
      },
      error: () => { /* keep retrying */ }
    });
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
  }

  isActive(status?: string): boolean {
    return !!status && ACTIVE_STATUSES.includes(status);
  }

  runOption(opt: QualityOption): void {
    if (!this.session) { return; }
    this.busyOption = opt.id;
    this.svc.runTask(this.session.session_id, opt.id).subscribe({
      next: () => this.startPolling(this.session!.session_id),
      error: () => { this.busyOption = ''; }
    });
  }

  toggleTokenInput(): void {
    this.showTokenInput = !this.showTokenInput;
    this.prError = '';
  }

  submitPr(): void {
    if (!this.session || !this.githubToken.trim()) { this.prError = 'Enter a GitHub token.'; return; }
    this.prError = '';
    this.svc.openPr(this.session.session_id, this.githubToken.trim()).subscribe({
      next: () => { this.showTokenInput = false; this.githubToken = ''; this.startPolling(this.session!.session_id); },
      error: (err: unknown) => { this.prError = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to open PR.'; }
    });
  }

  // ── localStorage recents ──
  private loadRecents(): RecentRepo[] {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
  }
  private saveRecent(r: RecentRepo): void {
    const list = this.loadRecents().filter(x => x.sessionId !== r.sessionId);
    list.unshift(r);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 15)));
    this.recents = list;
  }

  // ── view helpers ──
  progressLine(p: { title?: string; msg?: string }): string {
    return p.title || p.msg || '';
  }
  trackByTs(_i: number, p: { ts: number }): number { return p.ts; }
  trackById(_i: number, o: QualityOption): string { return o.id; }
}
