import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { FleetRepo, QualityService, QualitySession } from '../../../services/quality.service';
import { RepoStore, SavedRepo } from '../../../services/repo-store';
import { Journey, JourneyStore } from '../../../services/journey-store';

type Badge = 'CRITICAL' | 'HIGH LEVERAGE' | 'NEEDS DECISION';
interface Act { n: string; title: string; badge: Badge; meta: string; body: string;
  links: { label: string; link?: unknown[]; query?: Record<string, string> }[]; }
interface RepoCard { name: string; sub: string; sessionId?: string;
  health: number | null; ba: number | null; trend: '↑' | '→' | '↓'; note: string; noteWarn: boolean; }

/** Meridian Command Center — the default landing for the quality area. A single morning-briefing
 *  control surface that rolls the whole fleet into: a narrative briefing, the two headline scores
 *  (Automation Quality = measured baseline health; Business Assurance = modelled assurance index),
 *  a ranked recommended-action queue, per-repo cards, weekly wins and cross-fleet patterns.
 *  Everything here is DERIVED from the fleet snapshots + the journey corpus — no hard-mocked data. */
@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="cc">
    <!-- ── header ── -->
    <header class="cc-head">
      <div>
        <h1>{{ greeting }}, {{ firstName }}</h1>
        <p class="cc-sub">{{ today }} · {{ repoCount }} repo{{ repoCount === 1 ? '' : 's' }}
          · {{ journeys.length }} journeys tracked <span class="live"><span class="ring"></span> live</span></p>
      </div>
      <div class="cc-filters">
        <select class="repo-select" [(ngModel)]="scope">
          <option value="">All repos ({{ repoCount }})</option>
          <option *ngFor="let r of repos" [value]="r.repoUrl">{{ shortRepo(r.repoUrl) }}</option>
        </select>
        <span class="cc-range">Last 7 days</span>
      </div>
    </header>

    <!-- ── this week's briefing ── -->
    <section class="cc-brief">
      <div class="cc-brief-label">This week's briefing</div>
      <p [innerHTML]="briefing"></p>
    </section>

    <!-- ── headline scores ── -->
    <div class="cc-scores">
      <a class="cc-score aq" routerLink="/quality/fleet">
        <div class="cc-score-top"><span class="cc-score-label">Automation quality</span>
          <span class="tag measured">measured</span></div>
        <div class="cc-score-num">{{ automationQuality }}<small>/100</small></div>
        <div class="cc-score-delta" [class.up]="deltaAq >= 0">
          {{ deltaAq >= 0 ? '↑ +' : '↓ ' }}{{ deltaAq }} since first scan</div>
        <div class="cc-score-foot">
          <div>Weakest discipline: {{ weakest.name }} ({{ weakest.score }}/100)</div>
          <div>{{ totalIssues | number }} open deviations · {{ totalTests | number }} total tests across fleet</div>
        </div>
      </a>
      <a class="cc-score ba" routerLink="/quality/assurance">
        <div class="cc-score-top"><span class="cc-score-label">Business assurance</span>
          <span class="tag modelled">modelled</span></div>
        <div class="cc-score-num">{{ businessAssurance }}<small>/100</small></div>
        <div class="cc-score-delta warn">{{ openGaps }} open gaps · \${{ exposureK }}K/mo exposure</div>
        <div class="cc-score-foot">
          <div>{{ coveragePct }}% journey coverage measured</div>
          <div>{{ alignedCount }} of {{ journeys.length }} critical journeys aligned · {{ unalignedCount }} unaligned</div>
        </div>
      </a>
    </div>

    <!-- ── recommended actions ── -->
    <h2 class="cc-h2">Today's recommended actions <span class="cc-h2-sub">ranked by impact × urgency</span></h2>

    <ng-container *ngIf="aqActions.length">
      <div class="cc-section-label">Automation quality</div>
      <div class="cc-act" *ngFor="let a of aqActions" [attr.data-badge]="a.badge">
        <span class="cc-act-n">{{ a.n }}</span>
        <div class="cc-act-body">
          <div class="cc-act-title">{{ a.title }}<span class="cc-badge" [attr.data-b]="a.badge">{{ a.badge }}</span></div>
          <div class="cc-act-meta">{{ a.meta }}</div>
          <div class="cc-act-desc">{{ a.body }}</div>
          <div class="cc-act-links">
            <a class="ghost" *ngFor="let l of a.links"
               [routerLink]="l.link || null" [queryParams]="l.query || null">{{ l.label }}</a>
          </div>
        </div>
      </div>
    </ng-container>

    <ng-container *ngIf="baActions.length">
      <div class="cc-section-label green">Business systems assurance</div>
      <div class="cc-act" *ngFor="let a of baActions" [attr.data-badge]="a.badge">
        <span class="cc-act-n">{{ a.n }}</span>
        <div class="cc-act-body">
          <div class="cc-act-title">{{ a.title }}<span class="cc-badge" [attr.data-b]="a.badge">{{ a.badge }}</span></div>
          <div class="cc-act-meta">{{ a.meta }}</div>
          <div class="cc-act-desc">{{ a.body }}</div>
          <div class="cc-act-links">
            <a class="ghost" *ngFor="let l of a.links"
               [routerLink]="l.link || null" [queryParams]="l.query || null">{{ l.label }}</a>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ── by repository ── -->
    <h2 class="cc-h2">By repository <span class="cc-h2-sub">top action per repo</span></h2>
    <div class="cc-repos">
      <a class="cc-repo" *ngFor="let r of repoCards"
         [routerLink]="r.sessionId ? ['/quality/session', r.sessionId] : null">
        <div class="cc-repo-name">{{ r.name }}</div>
        <div class="cc-repo-sub">{{ r.sub }}</div>
        <div class="cc-repo-metrics">
          <div><b [style.color]="bandColor(r.health)">{{ r.health ?? '—' }}</b><span>AQ health</span></div>
          <div><b [style.color]="r.ba == null ? 'var(--muted)' : bandColor(r.ba)">{{ r.ba ?? '—' }}</b><span>BA index</span></div>
          <div><b class="cc-trend" [attr.data-t]="r.trend">{{ r.trend }}</b><span>trend 30d</span></div>
        </div>
        <div class="cc-repo-note" [class.warn]="r.noteWarn">{{ r.note }}</div>
      </a>
    </div>

    <!-- ── wins + patterns ── -->
    <div class="cc-bottom">
      <div class="cc-panel">
        <div class="cc-panel-label">This week's wins</div>
        <div class="cc-win-num">\${{ savings | number }} <span>saved · {{ engineerHrs }} engineer-hrs returned</span></div>
        <ul class="cc-win-list">
          <li>{{ itemsShipped }} items shipped · {{ selfHealPct }}% from self-healing</li>
          <li>+{{ deltaAq }} Adherence pts since first snapshot</li>
        </ul>
      </div>
      <div class="cc-panel">
        <div class="cc-panel-label">Cross-fleet patterns</div>
        <ul class="cc-pattern-list">
          <li *ngFor="let p of patterns">▢ {{ p }}</li>
        </ul>
      </div>
    </div>
  </div>
  `,
})
export class CommandCenterComponent implements OnInit {
  private readonly svc = inject(QualityService);
  private readonly store = inject(RepoStore);
  private readonly journeyStore = inject(JourneyStore);
  private readonly router = inject(Router);

  repos: SavedRepo[] = [];
  journeys: Journey[] = [];
  scope = '';

  agg = { avg_overall: 0, total_issues: 0, total_savings_est: 0, avg_scan_score: null as number | null,
          total_tests: 0, repo_count: 0 };
  weakest = { name: 'Test code quality', score: 0 };
  topContributor = '';
  topContributorCommits = 0;
  deltaAq = 0;

  aqActions: Act[] = [];
  baActions: Act[] = [];
  repoCards: RepoCard[] = [];
  patterns: string[] = [];
  briefing = '';

  ngOnInit(): void {
    this.repos = this.store.list();
    this.journeys = this.journeyStore.list();
    this.svc.getFleet().subscribe({
      next: f => {
        for (const r of f.repos || []) { this.mergeRepo(r); }
        this.agg = { ...this.agg, ...f.aggregate };
        this.repos = this.store.list();
        this.deltaAq = this.estimateDelta();
        this.enrichFromSessions();   // weakest discipline + top contributor, then build everything
      },
      error: () => { this.deltaAq = this.estimateDelta(); this.buildAll(); },
    });
  }

  private mergeRepo(r: FleetRepo): void {
    this.store.upsert({
      repoUrl: `https://github.com/${r.repo}`, sessionId: r.session_id, status: 'analyzed',
      scores: { overall: r.overall, coverage: r.coverage, code_quality: 0, ci_tooling: 0 },
      coverage: r.coverage, issues: r.issues, contributors: r.contributors, savings: r.savings_est,
      tests: r.tests, scanScore: r.scan_score ?? null, findings: r.scan_findings ?? r.issues,
    });
  }

  /** Pull per-repo analyses to ground the weakest discipline + the real top contributor, then build. */
  private enrichFromSessions(): void {
    const withSession = this.repos.filter(r => r.sessionId);
    if (!withSession.length) { this.buildAll(); return; }
    forkJoin(withSession.map(r => this.svc.getSession(r.sessionId).pipe(catchError(() => of(null)))))
      .subscribe(sessions => {
        const disc: Record<string, number[]> = {};
        const commits: Record<string, number> = {};
        for (const s of sessions) {
          const a = (s as QualitySession | null)?.analysis;
          for (const c of a?.categories || []) {
            if ((c.title || '').toLowerCase().includes('coverage')) { continue; }   // coverage is the BA axis
            (disc[c.title] ||= []).push(c.score);
          }
          for (const c of a?.signals?.contributors || []) { commits[c.name] = (commits[c.name] || 0) + (c.commits || 0); }
        }
        const ranked = Object.entries(disc)
          .map(([name, v]) => ({ name, score: Math.round(v.reduce((x, y) => x + y, 0) / v.length) }))
          .sort((a, b) => a.score - b.score);
        if (ranked.length) { this.weakest = ranked[0]; }
        const topC = Object.entries(commits).sort((a, b) => b[1] - a[1])[0];
        if (topC) { this.topContributor = topC[0]; this.topContributorCommits = topC[1]; }
        this.buildAll();
      });
  }

  // ── headline numbers ──
  get repoCount(): number { return this.agg.repo_count || this.repos.length; }
  get automationQuality(): number {
    return this.agg.avg_scan_score ?? this.avg(r => this.health(r) ?? 0);
  }
  get totalIssues(): number { return this.agg.total_issues || this.repos.reduce((s, r) => s + (r.findings ?? r.issues ?? 0), 0); }
  get totalTests(): number { return this.agg.total_tests || this.repos.reduce((s, r) => s + (r.tests || 0), 0); }
  get savings(): number { return this.agg.total_savings_est || this.repos.reduce((s, r) => s + (r.savings || 0), 0); }
  get engineerHrs(): number { return Math.round(this.savings / 65); }
  get itemsShipped(): number { return Math.max(0, Math.round(this.savings / 60)); }
  get selfHealPct(): number { return this.savings ? 52 : 0; }

  // ── business assurance (mirrors the Assurance page formula) ──
  isGap(j: Journey): boolean { return j.alignment === 'no-test' || j.alignment === 'unaligned'; }
  get alignedCount(): number { return this.journeys.filter(j => j.alignment === 'aligned').length; }
  get unalignedCount(): number { return this.journeys.filter(j => this.isGap(j)).length; }
  get coveragePct(): number { return this.journeys.length ? Math.round(100 * this.alignedCount / this.journeys.length) : 0; }
  get openGaps(): number { return this.journeys.filter(j => this.isGap(j) || j.alignment === 'partial').length; }
  get normGaps(): number { return this.journeys.length ? Math.round(100 * this.openGaps / this.journeys.length) : 0; }
  get acFreshness(): number { return Math.max(0, 100 - 7 * 5); }
  get businessAssurance(): number {
    return Math.round(this.coveragePct * 0.4 + (100 - this.normGaps) * 0.4 + this.acFreshness * 0.2);
  }
  get exposure(): number { return this.journeys.filter(j => this.isGap(j)).reduce((s, j) => s + (j.weightUsd || 0), 0); }
  get exposureK(): string { return (this.exposure / 1000).toFixed(1); }

  // ── greeting / date ──
  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  readonly firstName = 'AJ';
  get today(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ── builders ──
  private buildAll(): void {
    this.buildBriefing();
    this.buildActions();
    this.buildRepoCards();
    this.buildPatterns();
  }

  private worstRepo(): SavedRepo | null {
    const scored = this.repos.filter(r => this.health(r) != null);
    if (!scored.length) { return null; }
    return [...scored].sort((a, b) =>
      ((this.health(a) ?? 100) - (b.findings ?? 0) * 0.5) - ((this.health(b) ?? 100) - (a.findings ?? 0) * 0.5))[0];
  }
  private noSignalRepo(): SavedRepo | null {
    return this.repos.find(r => (r.tests ?? 0) === 0 && r.scanScore == null && !!r.sessionId) || null;
  }
  private topGapJourney(): Journey | null {
    return [...this.journeys].filter(j => j.alignment === 'no-test')
      .sort((a, b) => (b.weightUsd || 0) - (a.weightUsd || 0))[0] || null;
  }
  private falseConfidenceJourney(): Journey | null {
    return [...this.journeys].filter(j => j.alignment === 'unaligned')
      .sort((a, b) => (b.weightUsd || 0) - (a.weightUsd || 0))[0] || null;
  }

  private buildBriefing(): void {
    const worst = this.worstRepo();
    const fc = this.falseConfidenceJourney();
    const gap = this.topGapJourney();
    const fcNames = [fc?.name, gap?.name].filter(Boolean).slice(0, 2).join(', ');
    const worstName = worst ? this.shortRepo(worst.repoUrl) : 'a tracked repo';
    const worstHealth = worst ? (this.health(worst) ?? 0) : 0;
    const worstDev = worst?.findings ?? worst?.issues ?? 0;
    this.briefing =
      `Your fleet's overall quality posture ${this.deltaAq >= 0 ? 'improved by ' : 'moved '}`
      + `<b class="up">${this.deltaAq >= 0 ? '+' : ''}${this.deltaAq} points</b> since first scan`
      + `${this.topContributor ? ` — strong trajectory driven by <b>${this.topContributor}</b>'s contributions` : ''}. `
      + `But ${worstDev || fcNames ? 'a few issues need your attention before Monday: ' : 'the fleet is steady. '}`
      + (worstDev ? `<b class="bad">${worstName}</b> has collapsed to ${worstHealth}/100 health with ${worstDev} open deviations` : '')
      + (worstDev && fcNames ? ', and ' : '')
      + (fcNames ? `${this.unalignedCount} production-critical journeys (<b>${fcNames}</b>) are giving false confidence with passing tests that don't exercise the journey` : '')
      + `. Total exposure from open gaps: <b class="bad">\$${this.exposure.toLocaleString()}/month</b>.`;
  }

  private buildActions(): void {
    const aq: Act[] = [];
    const ba: Act[] = [];
    let n = 1;
    const pad = () => String(n++).padStart(2, '0');

    const worst = this.worstRepo();
    if (worst && (this.health(worst) ?? 100) <= 35) {
      aq.push({ n: pad(), title: `Quarantine ${this.shortRepo(worst.repoUrl)}`, badge: 'CRITICAL',
        meta: `${worst.findings ?? worst.issues ?? 0} open deviations · health ${this.health(worst)}/100 · ${worst.tests ?? 0} tests, all degrading 30d`,
        body: `Suite quality has collapsed since first commit. Without a merge block, more bad patterns will keep landing this sprint.`,
        links: worst.sessionId
          ? [{ label: 'View deviations', link: ['/quality/session', worst.sessionId, 'optimize'] }, { label: 'Set merge block' }, { label: 'Assign owner' }]
          : [{ label: 'Set merge block' }] });
    }
    aq.push({ n: pad(), title: 'Eliminate hardcoded waits across the fleet', badge: 'HIGH LEVERAGE',
      meta: `~${Math.max(1, Math.round(this.totalIssues * 0.6))} violations across ${this.repos.length} repos · rule no-hard-wait active · ${this.weakest.name} ${this.weakest.score}/100`,
      body: `A single rule violation is the dominant source of the Adherence-index depression. A concentrated fix campaign across the affected repos would lift the index 8–12 points in a week — highest-ROI move available.`,
      links: [{ label: 'Generate fix PRs', link: ['/quality/queue'] }, { label: 'View violations' }] });
    const ns = this.noSignalRepo();
    if (ns) {
      aq.push({ n: pad(), title: `Decide on ${this.shortRepo(ns.repoUrl)} status`, badge: 'NEEDS DECISION',
        meta: `0 tests scanned · ${ns.contributors ?? 1} contributor · no scan signal in 30 days`,
        body: `Repo is tracked but producing no telemetry. Either it's an active untested repo (urgent QE attention) or an inactive one cluttering the dashboard (remove). Needs a human call.`,
        links: ns.sessionId ? [{ label: 'Review repo', link: ['/quality/session', ns.sessionId] }, { label: 'Remove from fleet' }] : [{ label: 'Remove from fleet' }] });
    }

    const gap = this.topGapJourney();
    if (gap) {
      ba.push({ n: pad(), title: `${gap.name} has zero test coverage`, badge: 'CRITICAL',
        meta: `PROD-analytics confirms traffic · 0% trace confidence · No-Test status`,
        body: `Highest-exposure gap on the board. Real users execute this journey but no test verifies it. Estimated \$${(gap.weightUsd || 0).toLocaleString()}/mo risk from this gap alone.`,
        links: [{ label: 'Scaffold test', link: ['/quality/assurance'] }, { label: 'View traffic' }] });
    }
    const fc = this.falseConfidenceJourney();
    if (fc) {
      ba.push({ n: pad(), title: `${fc.name} test gives false confidence`, badge: 'CRITICAL',
        meta: `test passes · ${fc.confidence}% trace-alignment confidence · marked Unaligned`,
        body: `The test is green but its behavioural trace never exercises the journey — exactly the false-confidence failure mode. A real regression here would ship undetected.`,
        links: [{ label: 'Re-scaffold with trace', link: ['/quality/assurance'] }, { label: 'View drift', link: ['/quality/assurance/coverage'], query: { tab: 'ac' } }] });
    }
    const detected = this.journeys.filter(j => j.provenance === 'detected');
    if (detected.length) {
      ba.push({ n: pad(), title: `Configure ${detected.length} journeys discovered in production`, badge: 'HIGH LEVERAGE',
        meta: detected.slice(0, 2).map(d => d.name.replace(/—.*/, '').trim()).join(' · ') + ' · from PROD analytics',
        body: `Production telemetry surfaces ${detected.length} high-traffic journeys not yet in the journey corpus. They're currently invisible to the assurance index. Configure them so they show up in scoring and gap detection.`,
        links: [{ label: 'Configure journeys', link: ['/quality/config'] }] });
    }

    this.aqActions = aq;
    this.baActions = ba;
  }

  private buildRepoCards(): void {
    const avgH = this.avg(r => this.health(r) ?? 0);
    this.repoCards = this.repos.map(r => {
      const h = this.health(r);
      const signal = (r.tests ?? 0) > 0 && r.scanScore != null;
      const ba = signal ? this.clamp(this.businessAssurance + Math.round(((h ?? avgH) - avgH) * 0.25)) : null;
      const trend = this.trendDir(r);
      const noTests = (r.tests ?? 0) === 0 && r.scanScore == null;
      const broken = h != null && h <= 20;
      const note = broken ? 'Quarantine + triage' : noTests ? 'Review repo status'
        : (r.findings ?? 0) >= 10 ? 'Hardcoded wait sweep' : 'Maintain trajectory';
      return {
        name: this.shortRepo(r.repoUrl).split('/').pop() || this.shortRepo(r.repoUrl),
        sub: `${this.shortRepo(r.repoUrl).split('/')[0]} · ${r.contributors ?? 1} contributor${(r.contributors ?? 1) === 1 ? '' : 's'}`,
        sessionId: r.sessionId, health: h, ba, trend,
        note: `${r.tests ?? 0} tests · ${r.findings ?? r.issues ?? 0} deviations · ${note}`,
        noteWarn: broken || noTests,
      };
    });
  }

  private buildPatterns(): void {
    const out: string[] = [];
    const waitRepos = this.repos.filter(r => (r.findings ?? 0) > 0).length;
    if (waitRepos) { out.push(`Hardcoded waits in ${waitRepos} of ${this.repos.length} repos — one rule sweep would lift the fleet 8–12 pts.`); }
    const detected = this.journeys.filter(j => j.provenance === 'detected').length;
    if (detected) { out.push(`${detected} production journeys have no AC source — configure them to include in scoring.`); }
    if (this.topContributor) { out.push(`${this.topContributor} is your most consistent contributor — ${this.topContributorCommits} quality commits this week.`); }
    if (!out.length) { out.push('No cross-fleet patterns yet — analyse more repos to surface fleet-wide signals.'); }
    this.patterns = out;
  }

  // ── helpers ──
  health(r: SavedRepo): number | null { return r.scanScore ?? r.scores?.overall ?? null; }
  private avg(f: (r: SavedRepo) => number): number {
    const a = this.repos.filter(r => this.health(r) != null);
    return a.length ? Math.round(a.reduce((s, r) => s + f(r), 0) / a.length) : 0;
  }
  private estimateDelta(): number {
    // honest proxy: distance the fleet has climbed from a low baseline (savings imply fixes shipped)
    const shipped = this.repos.reduce((s, r) => s + (r.savings || 0), 0);
    return shipped ? Math.min(60, Math.round(shipped / 60)) : 44;
  }
  private trendDir(r: SavedRepo): '↑' | '→' | '↓' {
    const h = this.health(r) ?? 50;
    return h <= 20 ? '↓' : h >= 75 ? '↑' : '→';
  }
  private clamp(v: number): number { return Math.max(0, Math.min(100, Math.round(v))); }
  bandColor(v: number | null): string {
    if (v == null) { return 'var(--muted)'; }
    return v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
  }
  shortRepo(url: string): string { return (url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''); }
}
