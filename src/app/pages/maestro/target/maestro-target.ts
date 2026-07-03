import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import {
  MaestroService, MaestroTarget, RunListItem, CoverageLevel, TargetTest,
  TestCandidate, ProjectFile, ChatMessage, PendingEdit,
} from '../../../services/maestro.service';

interface CoverageOpt { id: CoverageLevel; label: string; blurb: string; }

const DEFAULT_BUDGET: Record<string, number> = { minimal: 1, critical: 3, standard: 6, deep: 10 };

@Component({
  selector: 'app-maestro-target',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './maestro-target.html',
  styleUrl: '../maestro.scss',
})
export class MaestroTargetComponent implements OnInit, AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(MaestroService);

  targetId = '';
  target: MaestroTarget | null = null;
  runs: RunListItem[] = [];
  loading = true;
  busy = false;

  // ── chat ────────────────────────────────────────────────────────────────────
  @ViewChild('chatLog') private chatLog?: ElementRef<HTMLElement>;
  chatMsgs: ChatMessage[] = [];
  chatInput = '';
  chatBusy = false;
  chatError = '';
  private chatShouldScroll = false;
  readonly chatSuggestions = [
    'What tests do I have?',
    'Add a test for the login flow',
    'Make the search test also assert the result count',
    'Set coverage to standard',
  ];

  // advanced options (editable form, seeded from target)
  advOpen = false;
  depth = 2;
  maxPages = 12;
  instructions = '';

  // coverage projection — which level the heat map is previewing (hover) vs the saved one
  projection: CoverageLevel | null = null;

  // project viewer
  projOpen = false;
  projLoading = false;
  projFiles: ProjectFile[] = [];
  activeFile: ProjectFile | null = null;

  readonly coverageOpts: CoverageOpt[] = [
    { id: 'minimal', label: 'Minimal', blurb: 'Top 1 — a single deep navigation health check. (default)' },
    { id: 'critical', label: 'Critical', blurb: 'Top 3 — the most critical P0 journeys.' },
    { id: 'standard', label: 'Standard', blurb: 'Top 6 — the important user flows.' },
    { id: 'deep', label: 'Deep', blurb: 'Top 10 — broad coverage of flows.' },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.targetId = id; this.load(); }
  }

  load(): void {
    this.loading = true;
    this.svc.getTarget(this.targetId).subscribe({
      next: (t) => {
        this.target = t; this.loading = false;
        this.depth = t.crawl_depth ?? 2;
        this.maxPages = t.max_pages ?? 12;
        this.instructions = t.instructions ?? '';
      },
      error: () => { this.loading = false; },
    });
    this.svc.listRuns(this.targetId).subscribe({ next: ({ runs }) => { this.runs = runs.slice(0, 10); } });
  }

  ngAfterViewChecked(): void {
    if (this.chatShouldScroll && this.chatLog) {
      const el = this.chatLog.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.chatShouldScroll = false;
    }
  }

  // ── chat ────────────────────────────────────────────────────────────────────
  get pendingEdits(): PendingEdit[] { return this.target?.pending_edits ?? []; }

  pendingIcon(a: string): string { return a === 'add' ? '＋' : a === 'delete' ? '－' : '✎'; }

  onChatKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
  }

  sendChat(text?: string): void {
    const content = (text ?? this.chatInput).trim();
    if (!content || this.chatBusy) return;
    this.chatError = '';
    this.chatMsgs.push({ role: 'user', content });
    this.chatInput = '';
    this.chatBusy = true;
    this.chatShouldScroll = true;
    this.svc.chat(this.targetId, this.chatMsgs).subscribe({
      next: ({ reply, target }) => {
        this.chatMsgs.push({ role: 'assistant', content: reply || '(no reply)' });
        if (target) { this.target = target; }   // reflect queued edits / settings live
        this.chatBusy = false;
        this.chatShouldScroll = true;
      },
      error: (err: unknown) => {
        this.chatBusy = false;
        this.chatError = (err as { error?: { error?: string } })?.error?.error ?? 'Chat failed — please try again.';
      },
    });
  }

  // ── coverage ────────────────────────────────────────────────────────────────
  get coverage(): CoverageLevel { return this.target?.coverage ?? 'minimal'; }
  get tests(): TargetTest[] { return this.target?.tests ?? []; }
  get enabledCount(): number { return this.tests.filter(t => t.enabled).length; }

  budget(level: string): number {
    return this.target?.coverage_max?.[level] ?? DEFAULT_BUDGET[level] ?? 1;
  }
  /** The level the heat map is currently reflecting (hover preview, else saved). */
  get viewLevel(): CoverageLevel { return this.projection ?? this.coverage; }
  get isProjecting(): boolean { return this.projection !== null && this.projection !== this.coverage; }

  setCoverage(c: CoverageLevel): void {
    this.projection = null;
    if (this.busy || c === this.coverage) return;
    this.busy = true;
    this.svc.updateTarget(this.targetId, { coverage: c }).subscribe({
      next: (t) => { this.target = t; this.busy = false; },
      error: () => { this.busy = false; },
    });
  }

  // ── candidates (ranked dashboard + heat map) ─────────────────────────────────
  get candidates(): TestCandidate[] { return this.target?.candidates ?? []; }
  get hasCandidates(): boolean { return this.candidates.length > 0; }

  get minScore(): number { return this.target?.min_score ?? 55; }

  /** A candidate is selected under a level when its rank falls inside that level's budget AND it
   *  clears the quality floor (rank #1 navigation is always in). Mirrors the worker exactly. */
  selectedAt(c: TestCandidate, level: string): boolean {
    const withinBudget = (c.rank ?? 99) <= this.budget(level);
    const goodEnough = (c.score ?? 0) >= this.minScore || c.rank === 1;
    return withinBudget && goodEnough;
  }
  /** Below the quality bar — never auto-implemented at any level (kept as backlog only). */
  belowBar(c: TestCandidate): boolean { return (c.score ?? 0) < this.minScore && c.rank !== 1; }
  isActive(c: TestCandidate): boolean { return this.selectedAt(c, this.coverage) && c.enabled !== false; }
  isDisabled(c: TestCandidate): boolean { return this.selectedAt(c, this.coverage) && c.enabled === false; }
  isLocked(c: TestCandidate): boolean { return !this.selectedAt(c, this.coverage); }

  /** Projection deltas vs the saved coverage, for the hover preview. */
  willAdd(c: TestCandidate): boolean {
    return this.isProjecting && this.selectedAt(c, this.viewLevel) && !this.selectedAt(c, this.coverage);
  }
  willDrop(c: TestCandidate): boolean {
    return this.isProjecting && !this.selectedAt(c, this.viewLevel) && this.selectedAt(c, this.coverage);
  }

  get activeCount(): number { return this.candidates.filter(c => this.isActive(c)).length; }
  get projectedCount(): number { return this.candidates.filter(c => this.selectedAt(c, this.viewLevel)).length; }

  /** Heat class from automatability confidence (low = uncertain → warmer). */
  heatClass(c: TestCandidate): string {
    const v = c.confidence ?? 60;
    if (v >= 80) return 'h-hi';
    if (v >= 55) return 'h-mid';
    return 'h-lo';
  }
  rowClass(c: TestCandidate): string {
    if (this.willAdd(c)) return 'add';
    if (this.willDrop(c)) return 'drop';
    if (this.isActive(c)) return 'active';
    if (this.isDisabled(c)) return 'disabled';
    return 'locked';
  }
  tierLabel(c: TestCandidate): string {
    const t = c.tier ?? 'backlog';
    return t === 'backlog' ? 'Backlog' : t.charAt(0).toUpperCase() + t.slice(1);
  }

  hoverLevel(c: CoverageLevel): void { this.projection = c; }
  clearHover(): void { this.projection = null; }

  // ── advanced options ─────────────────────────────────────────────────────────
  saveAdvanced(): void {
    if (this.busy) return;
    this.busy = true;
    this.svc.updateTarget(this.targetId, {
      crawl_depth: this.depth, max_pages: this.maxPages, instructions: this.instructions,
    }).subscribe({
      next: (t) => { this.target = t; this.busy = false; },
      error: () => { this.busy = false; },
    });
  }
  get advancedDirty(): boolean {
    return !!this.target && (
      this.depth !== (this.target.crawl_depth ?? 2) ||
      this.maxPages !== (this.target.max_pages ?? 12) ||
      this.instructions !== (this.target.instructions ?? ''));
  }

  // ── project viewer / download ─────────────────────────────────────────────────
  toggleProject(): void {
    this.projOpen = !this.projOpen;
    if (this.projOpen && !this.projFiles.length) {
      this.projLoading = true;
      this.svc.getProjectFiles(this.targetId).subscribe({
        next: (r) => {
          this.projFiles = r.files || [];
          this.activeFile = this.projFiles[0] ?? null;
          this.projLoading = false;
        },
        error: () => { this.projLoading = false; },
      });
    }
  }
  selectFile(f: ProjectFile): void { this.activeFile = f; }
  downloadUrl(): string { return this.svc.downloadUrl(this.targetId); }

  /** GitHub URL for the converted feature branch (e.g. …/tree/maestro/playwright). */
  branchUrl(): string {
    const url = (this.target?.repo_url || '').replace(/\.git$/, '').replace(/\/$/, '');
    const branch = this.target?.converted_branch || '';
    return url && branch ? `${url}/tree/${branch}` : url;
  }

  // ── curation / runs ───────────────────────────────────────────────────────────
  regenerate(): void {
    if (!confirm('Regenerate the test suite on the next run? Current generated tests will be replaced.')) return;
    this.busy = true;
    this.svc.regenerate(this.targetId).subscribe({
      next: () => { this.busy = false; this.projFiles = []; this.load(); },
      error: () => { this.busy = false; },
    });
  }

  removeCandidate(c: TestCandidate): void {
    if (!confirm(`Remove "${c.title}" from the suite? Future runs will skip it.`)) return;
    this.svc.deleteTest(this.targetId, c.id).subscribe({ next: () => this.load() });
  }

  /** Whether a saved suite exists that a "reuse" run could execute without regenerating. */
  get canReuse(): boolean { return !!this.target?.suite_ready; }

  runNow(mode?: 'reuse' | 'regenerate'): void {
    if (mode === 'regenerate' &&
        !confirm('Re-explore the site and regenerate the suite? This replaces the current generated tests.')) return;
    this.busy = true;
    this.svc.createRun(this.targetId, mode).subscribe({
      next: ({ run_id }) => { this.busy = false; void this.router.navigate(['/maestro/run', run_id]); },
      error: (err: unknown) => {
        this.busy = false;
        alert((err as { error?: { error?: string } })?.error?.error ?? 'Could not start run.');
      },
    });
  }

  statusClass(s?: string): string {
    if (!s) return '';
    if (s === 'done') return 'ok';
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
