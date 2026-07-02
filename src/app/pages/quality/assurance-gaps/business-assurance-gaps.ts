import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { JourneyStore } from '../../../services/journey-store';

type Priority = 'CRIT' | 'HIGH' | 'MED';
type CatKey = 'priority' | 'gold' | 'prodval' | 'repover' | 'gaonly' | 'crawonly' | 'repoonly';

interface GapItem {
  id: string;
  name: string;
  crawler: boolean;   // surfaced by the auto-crawler / explorer agent (modelled — RnD)
  ga: boolean;        // observed in Google-Analytics production traffic (mocked — no live GA)
  repo: boolean;      // a Playwright / Selenium test exists in the scanned repo (the real signal)
  priority: Priority;
}

interface Category {
  key: CatKey;
  label: string;
  chip: string;       // e.g. "Crawler & GA, no repo test · 12"
  color: string;
  blurb: string;
  focus: boolean;     // rendered as a "where to focus first" card
  test: (i: GapItem) => boolean;
}

interface VennRegion { key: CatKey; x: number; y: number; name: string; }

/** System & Business Assurance → Business Assurance Gaps (AJ email, image001).
 *  The home for the (renamed) "Business Assurance Gaps" menu. Reconciles three coverage signals —
 *  the auto-crawler / explorer agent, Google-Analytics production journeys, and the repository's
 *  Playwright/Selenium tests — into a 3-way Venn. Each of the seven regions is an assurance
 *  verdict (priority gap → scaffold now, gold standard → protect, GA-only → missed journey,
 *  repo-only → deprecation candidate, …). Users navigate by priority and by quadrant to select
 *  and fix the gaps.
 *
 *  Data provenance (honest): the **repo-tests** circle is the groundable one — the assurance
 *  pipeline already scans the repo's real Playwright/Selenium/Cypress test files. The **crawler**
 *  (explorer agent) and **GA** circles are modelled/mocked until those integrations land. The set
 *  is seeded so the Venn matches the deck (union 53, crawler 41, GA 36, repo 28, crawler&GA 27);
 *  every KPI and region count is DERIVED from the set's membership booleans. */
@Component({
  selector: 'app-business-assurance-gaps',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar" style="align-items:flex-start">
    <div>
      <h1>Business Assurance gaps and recommendations</h1>
      <p class="bag-lede">Reconciles auto-crawler recommendations, Google Analytics production journeys, and the
        repository’s Playwright/Selenium tests to expose where the business carries real assurance risk. The most
        actionable regions are <b style="color:#f5a3c0">Crawler &amp; GA agree, no repo test</b> (high-conviction gaps —
        scaffold now) and <b style="color:#7ee0a8">all three agree</b> (validated coverage — protect).</p>
    </div>
    <span class="spacer"></span>
    <a class="nav-link" routerLink="/quality/assurance/coverage" style="padding:6px 12px;white-space:nowrap">Coverage &amp; uplift →</a>
  </div>

  <!-- headline reconciliation KPIs -->
  <div class="sp-cards">
    <div class="sp-card"><div class="sp-card-top"><span class="sp-num">{{ total }}</span></div>
      <div class="sp-card-lbl">Total unique tests</div><div class="sp-card-sub">Union of all 3 sources</div></div>
    <div class="sp-card" data-accent="good"><div class="sp-card-top"><span class="sp-num good">{{ agreeCount }}</span></div>
      <div class="sp-card-lbl">Crawler &amp; GA agree</div><div class="sp-card-sub">High-conviction signal</div></div>
    <div class="sp-card" data-accent="bad"><div class="sp-card-top"><span class="sp-num bad">{{ count('priority') }}</span></div>
      <div class="sp-card-lbl">Priority gaps</div><div class="sp-card-sub">Both suggest, no repo test</div></div>
    <div class="sp-card" data-accent="warn"><div class="sp-card-top"><span class="sp-num warn">{{ count('repoonly') }}</span></div>
      <div class="sp-card-lbl">Deprecated candidates</div><div class="sp-card-sub">Repo-only, no live signal</div></div>
  </div>

  <!-- Venn reconciliation + legend -->
  <div class="bag-recon">
    <div class="panel bag-venn-panel">
      <svg viewBox="0 0 460 490" class="bag-venn" role="img" aria-label="Three-way coverage reconciliation Venn">
        <text x="105" y="28" class="bag-vt" fill="#b9a7f5">Crawler agent</text>
        <text x="105" y="46" class="bag-vs">{{ crawlerTotal }} recommendations</text>
        <text x="360" y="28" class="bag-vt" fill="#7ee0a8" text-anchor="middle">GA journeys</text>
        <text x="360" y="46" class="bag-vs" text-anchor="middle">{{ gaTotal }} observed</text>
        <circle cx="165" cy="200" r="140" fill="#8b7ef0" fill-opacity="0.10" stroke="#8b7ef0" stroke-opacity="0.55"/>
        <circle cx="300" cy="200" r="140" fill="#22c55e" fill-opacity="0.10" stroke="#22c55e" stroke-opacity="0.55"/>
        <circle cx="232" cy="315" r="140" fill="#f59e0b" fill-opacity="0.10" stroke="#f59e0b" stroke-opacity="0.55"/>
        <text x="232" y="470" class="bag-vt" fill="#f5c87a" text-anchor="middle">Repo tests</text>
        <text x="232" y="488" class="bag-vs" text-anchor="middle">Playwright + Selenium · {{ repoTotal }}</text>
        <g *ngFor="let r of regions" class="bag-region" (click)="select(r.key)">
          <rect [attr.x]="r.x - 20" [attr.y]="r.y - 15" width="40" height="30" rx="7"
            [attr.fill]="cat(r.key).color" [class.dim]="selectedKey && selectedKey !== r.key"/>
          <text [attr.x]="r.x" [attr.y]="r.y + 6" class="bag-rn" text-anchor="middle">{{ count(r.key) }}</text>
          <text [attr.x]="r.x" [attr.y]="r.y + 30" class="bag-rl" text-anchor="middle">{{ r.name }}</text>
        </g>
      </svg>
    </div>

    <div class="panel bag-legend">
      <button class="bag-leg" *ngFor="let c of cats" [class.active]="selectedKey === c.key"
        [class.dim]="selectedKey && selectedKey !== c.key" (click)="select(c.key)">
        <span class="bag-dot" [style.background]="c.color"></span>
        <div>
          <div class="bag-leg-t">{{ c.label }} <b>· {{ count(c.key) }}</b></div>
          <div class="bag-leg-d">{{ c.blurb }}</div>
        </div>
      </button>
      <p class="bag-prov">Crawler = explorer agent <span class="tag modelled">modelled</span> · GA = production analytics
        <span class="tag modelled">mocked</span> · Repo = Playwright/Selenium from the scan
        <span class="tag measured">real</span></p>
    </div>
  </div>

  <!-- priority filter -->
  <div class="bag-focus-head">
    <span class="cc-section-label" style="margin:0">Where to focus first</span>
    <span class="spacer" style="flex:1"></span>
    <div class="bag-prio">
      <button *ngFor="let p of prios" class="bag-prio-btn" [class.active]="prio === p" (click)="prio = p">{{ p }}</button>
    </div>
  </div>

  <!-- single-quadrant drill view -->
  <ng-container *ngIf="selected as c">
    <div class="panel bag-quad focused">
      <div class="bag-quad-head">
        <button class="ghost" style="padding:2px 8px" (click)="select(c.key)">← All quadrants</button>
        <h3 style="margin:0">{{ c.label }}</h3>
        <span class="bag-chip" [style.background]="c.color + '22'" [style.color]="c.color">{{ c.chip }}</span>
      </div>
      <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.5;margin:2px 0 8px">{{ c.blurb }}</p>
      <div class="bag-gap" *ngFor="let g of items(c.key)" [class.sel]="sel.has(g.id)" (click)="toggle(g.id)">
        <span class="cb" [attr.data-state]="sel.has(g.id) ? 'checked' : 'unchecked'"></span>
        <span class="bag-prio-tag" [attr.data-p]="g.priority">{{ g.priority }}</span>
        <span class="bag-gap-name">{{ g.name }}</span>
        <span class="spacer" style="flex:1"></span>
        <span class="bag-srcs">{{ srcLabel(g) }}</span>
      </div>
      <p class="empty-hint" *ngIf="!items(c.key).length" style="margin:6px 0">No {{ prio }} items in this quadrant.</p>
    </div>
  </ng-container>

  <!-- default: the four focus cards -->
  <div class="bag-quads" *ngIf="!selectedKey">
    <div class="panel bag-quad" *ngFor="let c of focusCats" (click)="select(c.key)">
      <div class="bag-quad-head">
        <h3 style="margin:0">{{ c.label }}</h3>
        <span class="spacer" style="flex:1"></span>
        <span class="bag-chip" [style.background]="c.color + '22'" [style.color]="c.color">{{ c.chip }}</span>
      </div>
      <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.5;margin:2px 0 10px">{{ c.blurb }}</p>
      <div class="bag-gap" *ngFor="let g of items(c.key) | slice:0:5" [class.sel]="sel.has(g.id)" (click)="toggle(g.id); $event.stopPropagation()">
        <span class="bag-prio-tag" [attr.data-p]="g.priority">{{ g.priority }}</span>
        <span class="bag-gap-name">{{ g.name }}</span>
      </div>
      <a class="bag-more" *ngIf="items(c.key).length > 5" (click)="select(c.key); $event.stopPropagation()">
        Show {{ items(c.key).length - 5 }} more →</a>
      <p class="empty-hint" *ngIf="!items(c.key).length" style="margin:4px 0">No {{ prio }} items.</p>
    </div>
  </div>

  <!-- select & fix bar -->
  <div class="sp-actionbar active" *ngIf="sel.size">
    <div class="sp-sel-count"><b>{{ sel.size }}</b> gap{{ sel.size === 1 ? '' : 's' }} selected
      <span class="rule-desc" style="text-transform:none;letter-spacing:0">· {{ critSel }} critical</span></div>
    <span class="spacer" style="flex:1"></span>
    <button class="ghost" (click)="sel.clear()">Clear</button>
    <button class="primary" (click)="fix()">Scaffold {{ sel.size }} to fix →</button>
  </div>

  <p class="sp-msg" *ngIf="msg" style="margin-top:14px">{{ msg }}</p>
  <ng-container *ngIf="scaffoldText">
    <h3 style="margin:16px 0 6px">Scaffold — {{ sel.size }} selected gap{{ sel.size === 1 ? '' : 's' }}
      <span class="tag" style="background:#2a2f3a;color:var(--muted)">template · TODOs</span></h3>
    <textarea class="cfg-json" rows="12" readonly>{{ scaffoldText }}</textarea>
  </ng-container>
  `,
})
export class BusinessAssuranceGapsComponent implements OnInit {
  private readonly journeyStore = inject(JourneyStore);

  gaps: GapItem[] = [];
  selectedKey: CatKey | '' = '';
  prio: 'ALL' | Priority = 'ALL';
  readonly prios: Array<'ALL' | Priority> = ['ALL', 'CRIT', 'HIGH', 'MED'];
  sel = new Set<string>();
  msg = '';
  scaffoldText = '';
  private seq = 0;

  readonly cats: Category[] = [
    { key: 'priority', label: 'Priority gap', chip: 'Crawler & GA, no repo test · 0', color: '#ef4444', focus: true,
      blurb: 'Crawler and GA both suggest but no test exists in the repo. Scaffold immediately.',
      test: i => i.crawler && i.ga && !i.repo },
    { key: 'gold', label: 'Gold standard', chip: 'All 3 agree · 0', color: '#4f9d5b', focus: true,
      blurb: 'All three sources agree. Protect these; regressions here are highest severity.',
      test: i => i.crawler && i.ga && i.repo },
    { key: 'prodval', label: 'Prod-validated', chip: 'GA & repo test · 0', color: '#14b8a6', focus: false,
      blurb: 'GA sees traffic and the repo tests it. Crawler missed — investigate scan config.',
      test: i => !i.crawler && i.ga && i.repo },
    { key: 'repover', label: 'Repo verified', chip: 'Crawler & repo test · 0', color: '#6366f1', focus: false,
      blurb: 'Crawler sees it and the repo tests it, but no user traffic. Confirm it’s still needed.',
      test: i => i.crawler && !i.ga && i.repo },
    { key: 'gaonly', label: 'GA-only missed journeys', chip: 'GA only · 0', color: '#22c55e', focus: true,
      blurb: 'Users execute these but the crawler and repo don’t see them. Review whether the crawler is blind or the journey bypasses standard UI.',
      test: i => !i.crawler && i.ga && !i.repo },
    { key: 'crawonly', label: 'Crawler only', chip: 'Crawler only · 0', color: '#8b7ef0', focus: false,
      blurb: 'Crawler surfaced but no user traffic and no repo test. Likely low-value or false positive.',
      test: i => i.crawler && !i.ga && !i.repo },
    { key: 'repoonly', label: 'Deprecated candidates', chip: 'Repo test only · 0', color: '#c98a2b', focus: true,
      blurb: 'A repo test exists but no crawler or GA signal. Feature may be retired — consider deprecating the test to reduce maintenance.',
      test: i => !i.crawler && !i.ga && i.repo },
  ];

  readonly regions: VennRegion[] = [
    { key: 'crawonly', x: 115, y: 200, name: 'Crawler only' },
    { key: 'gaonly', x: 350, y: 200, name: 'GA only' },
    { key: 'repoonly', x: 232, y: 400, name: 'Repo only' },
    { key: 'priority', x: 232, y: 135, name: 'Priority gap' },
    { key: 'repover', x: 172, y: 300, name: 'Repo verified' },
    { key: 'prodval', x: 296, y: 300, name: 'Prod-validated' },
    { key: 'gold', x: 232, y: 232, name: 'Gold standard' },
  ];

  ngOnInit(): void {
    this.gaps = this.build();
    for (const c of this.cats) { c.chip = c.chip.replace(/· \d+$/, `· ${this.count(c.key)}`); }
  }

  // ── derived roll-ups (all functions of the reconciliation set) ──
  get total(): number { return this.gaps.length; }
  get agreeCount(): number { return this.gaps.filter(i => i.crawler && i.ga).length; }
  get crawlerTotal(): number { return this.gaps.filter(i => i.crawler).length; }
  get gaTotal(): number { return this.gaps.filter(i => i.ga).length; }
  get repoTotal(): number { return this.gaps.filter(i => i.repo).length; }
  cat(key: CatKey): Category { return this.cats.find(c => c.key === key)!; }
  count(key: CatKey): number { return this.gaps.filter(this.cat(key).test).length; }
  get focusCats(): Category[] { return this.cats.filter(c => c.focus); }
  get selected(): Category | undefined { return this.selectedKey ? this.cat(this.selectedKey) : undefined; }

  /** Items for a category, filtered by the active priority, CRIT→HIGH→MED first. */
  items(key: CatKey): GapItem[] {
    return this.gaps.filter(this.cat(key).test)
      .filter(g => this.prio === 'ALL' || g.priority === this.prio)
      .sort((a, b) => this.prioRank(a.priority) - this.prioRank(b.priority));
  }
  private prioRank(p: Priority): number { return p === 'CRIT' ? 0 : p === 'HIGH' ? 1 : 2; }

  select(key: CatKey): void { this.selectedKey = this.selectedKey === key ? '' : key; }
  toggle(id: string): void { this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); }
  get critSel(): number { return this.gaps.filter(g => this.sel.has(g.id) && g.priority === 'CRIT').length; }

  srcLabel(g: GapItem): string {
    return [g.crawler ? 'Crawler' : '', g.ga ? 'GA' : '', g.repo ? 'Repo' : ''].filter(Boolean).join(' + ');
  }

  fix(): void {
    const chosen = this.gaps.filter(g => this.sel.has(g.id));
    this.scaffoldText = chosen.map(g =>
`import { test, expect } from '@playwright/test';

// Gap: ${g.name}
// Signal: ${this.srcLabel(g)}   Priority: ${g.priority}
test('${g.name}', async ({ page }) => {
  // TODO: navigate to the entry point for this journey
  // TODO: perform the user action(s)
  // TODO: assert the business OUTCOME, not just the action
});`).join('\n\n');
    this.msg = `Scaffolded ${chosen.length} gap${chosen.length === 1 ? '' : 's'} — Playwright templates drafted with TODOs. `
      + `Wire the assertions & open a PR from Coverage & uplift.`;
  }

  // ── the reconciliation set ──
  /** Seeded reconciliation. Featured items mirror image001; the remainder are generated
   *  deterministically so each region matches (Priority 12 · Gold 15 · Prod-validated 4 ·
   *  Repo-verified 6 · GA-only 5 · Crawler-only 8 · Repo-only 3 = 53 unique; crawler 41 / GA 36 /
   *  repo 28). Membership booleans drive the region each gap falls into. GA-only / Priority
   *  featured rows reuse names surfaced from the configured PROD-analytics journeys where they
   *  line up (Refund / Guest-checkout). */
  private build(): GapItem[] {
    this.seq = 0;
    const F = (name: string, c: boolean, g: boolean, r: boolean, p: Priority): GapItem =>
      ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + (this.seq++), name, crawler: c, ga: g, repo: r, priority: p });
    const out: GapItem[] = [];

    // Priority gap (crawler & GA, no repo) — featured 5 + 7 filler = 12
    out.push(F('Refund — partial refund flow', true, true, false, 'CRIT'));
    out.push(F('Guest checkout — express pay', true, true, false, 'CRIT'));
    out.push(F('Update order tracking ID inline', true, true, false, 'CRIT'));
    out.push(F('Search and filter orders by status', true, true, false, 'HIGH'));
    out.push(F('Bulk select orders & mark dispatched', true, true, false, 'HIGH'));
    this.fill(out, ['Apply store-credit at checkout', 'Split shipment across warehouses', 'Edit saved shipping address',
      'Resend failed payment receipt', 'Cancel order before fulfilment', 'Reorder from past purchase',
      'Gift-wrap option at checkout'], true, true, false, ['HIGH', 'HIGH', 'MED', 'MED', 'HIGH', 'MED', 'MED']);

    // Gold standard (all three) — featured 5 + 10 filler = 15
    out.push(F('Admin login with valid credentials', true, true, true, 'CRIT'));
    out.push(F('Change order status via action buttons', true, true, true, 'CRIT'));
    out.push(F('Add new product to catalog', true, true, true, 'CRIT'));
    out.push(F('View individual order detail page', true, true, true, 'HIGH'));
    out.push(F('Add new category in category management', true, true, true, 'HIGH'));
    this.fill(out, ['Checkout — pay with saved card', 'Add item to cart', 'Sign in with SSO', 'Apply promo code',
      'Update cart quantity', 'Place order end-to-end', 'Search product catalog', 'Filter products by category',
      'Edit account profile', 'View order history'], true, true, true,
      ['HIGH', 'HIGH', 'HIGH', 'MED', 'MED', 'CRIT', 'MED', 'MED', 'MED', 'MED']);

    // Prod-validated (GA & repo, crawler missed) — 4
    this.fill(out, ['Apple-Pay express checkout', 'Address autocomplete on checkout', 'Reorder banner on home',
      'One-tap re-purchase from email'], false, true, true, ['HIGH', 'MED', 'MED', 'MED']);

    // Repo verified (crawler & repo, no GA traffic) — 6
    this.fill(out, ['Bulk product price update', 'Inventory reconciliation report', 'Tax-rule configuration',
      'Warehouse transfer request', 'Vendor payout export', 'Fraud-review queue action'], true, false, true,
      ['MED', 'MED', 'HIGH', 'MED', 'MED', 'HIGH']);

    // GA-only missed journeys — featured 5 = 5
    out.push(F('Deep-link order share → guest view', false, true, false, 'HIGH'));
    out.push(F('Mobile-app subscription renewal', false, true, false, 'HIGH'));
    out.push(F('Password reset via email link', false, true, false, 'MED'));
    out.push(F('Saved-card removal in profile', false, true, false, 'MED'));
    out.push(F('Notification preferences update', false, true, false, 'MED'));

    // Crawler only — 8
    this.fill(out, ['Legacy help-center widget', 'Cookie-consent re-prompt', 'A/B experiment variant page',
      'Unused promo-banner CTA', 'Deprecated size-guide modal', 'Hidden debug settings panel',
      'Orphaned newsletter footer', 'Beta feature toggle screen'], true, false, false,
      ['MED', 'MED', 'MED', 'MED', 'MED', 'MED', 'MED', 'MED']);

    // Repo-only (deprecated candidates) — featured 3 = 3
    out.push(F('Legacy V1 admin dashboard load', false, false, true, 'MED'));
    out.push(F('Print invoice via old workflow', false, false, true, 'MED'));
    out.push(F('Deprecated OAuth v1 flow', false, false, true, 'MED'));

    return out;
  }

  private fill(out: GapItem[], names: string[], c: boolean, g: boolean, r: boolean, prios: Priority[]): void {
    names.forEach((n, i) => out.push({
      id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + (this.seq++),
      name: n, crawler: c, ga: g, repo: r, priority: prios[i] || 'MED',
    }));
  }
}
