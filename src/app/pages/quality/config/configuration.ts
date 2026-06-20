import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { QualityService, RulesetConfig } from '../../../services/quality.service';

type Tab = 'rules' | 'users' | 'repos';

/** Built-in catalog reference (mirrors worker/quality_scanner.py RULES) — shown read-only so the
 *  user knows which generic rules an overlay can override or disable. */
const BUILTIN = [
  { id: 'no-hard-wait', discipline: 'waiting', severity: 'error', weight: 3 },
  { id: 'no-networkidle', discipline: 'waiting', severity: 'warning', weight: 1 },
  { id: 'no-xpath-locator', discipline: 'locators', severity: 'error', weight: 2 },
  { id: 'prefer-role-locator', discipline: 'locators', severity: 'warning', weight: 1 },
  { id: 'no-force-option', discipline: 'locators', severity: 'warning', weight: 2 },
  { id: 'missing-web-first-assert', discipline: 'assertions', severity: 'warning', weight: 2 },
  { id: 'no-floating-promise', discipline: 'assertions', severity: 'error', weight: 2 },
  { id: 'api-vs-ui-login', discipline: 'auth', severity: 'warning', weight: 3 },
  { id: 'pom-inline-selectors', discipline: 'structure', severity: 'warning', weight: 2 },
  { id: 'test-isolation', discipline: 'isolation', severity: 'error', weight: 3 },
];

/** Configuration area (AJ email June 19): functional Rule Management + static governance stubs. */
@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrl: '../quality.scss',
  template: `
  <div class="obs-topbar">
    <h1>Configuration</h1>
    <span class="sub">Governance &amp; grounding controls</span>
  </div>

  <div class="cfg-tabs">
    <button class="cfg-tab" [class.active]="tab === 'rules'" (click)="tab = 'rules'">Rule Management</button>
    <button class="cfg-tab" [class.active]="tab === 'users'" (click)="tab = 'users'">User &amp; Role Mgmt
      <span class="tag" style="background:#2a2f3a;color:var(--muted)">static</span></button>
    <button class="cfg-tab" [class.active]="tab === 'repos'" (click)="tab = 'repos'">Repo Management
      <span class="tag" style="background:#2a2f3a;color:var(--muted)">static</span></button>
  </div>

  <!-- ───────── Rule Management (functional) ───────── -->
  <ng-container *ngIf="tab === 'rules'">
    <div class="fleet-grid">
      <div>
        <div class="panel">
          <h3>Grounding overlay <span class="rule-desc" style="text-transform:none;letter-spacing:0">custom rules override the generic catalog</span></h3>
          <p class="rule-desc" style="text-transform:none;letter-spacing:0;line-height:1.6;margin:0 0 14px">
            Override a built-in by re-using its <code>id</code> (change weight / severity / pattern), disable it with
            <code>"disabled": true</code>, or add a brand-new rule with a regex <code>pattern</code>.
            Saved globally, then applied on the next analyze.</p>

          <div class="cfg-settings">
            <label>Tech-debt multiplier
              <input type="number" step="0.1" min="0" [(ngModel)]="multiplier"></label>
            <label>$ / issue-point
              <input type="number" step="1" min="0" [(ngModel)]="usdPerPoint"></label>
            <label>Runs / year
              <input type="number" step="10" min="0" [(ngModel)]="runsPerYear"></label>
            <label>Blended $/hr
              <input type="number" step="5" min="0" [(ngModel)]="ratePerHour"></label>
          </div>

          <label class="cfg-label">Custom rules (JSON array)</label>
          <textarea class="cfg-json" rows="14" spellcheck="false" [(ngModel)]="rulesJson"></textarea>

          <div class="cfg-actions">
            <button class="primary" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save ruleset' }}</button>
            <button class="ghost" (click)="reset()">Reset to saved</button>
            <span class="cfg-msg ok" *ngIf="okMsg">{{ okMsg }}</span>
            <span class="cfg-msg bad" *ngIf="errMsg">{{ errMsg }}</span>
          </div>
          <ul class="cfg-warn" *ngIf="warnings.length">
            <li *ngFor="let w of warnings">⚠ {{ w }}</li>
          </ul>
        </div>
      </div>

      <div class="panel">
        <h3>Built-in catalog</h3>
        <div class="hot-row" *ngFor="let r of builtin">
          <code style="flex:1">{{ r.id }}</code>
          <span class="tag" style="background:#1b2530;color:#9fb4c7">{{ r.discipline }}</span>
          <span class="sev" [attr.data-s]="r.severity">w{{ r.weight }}</span>
        </div>
        <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:12px;line-height:1.6">
          Tech-debt $ = <b>$/point × multiplier × Σ(weight × count)</b>. The multiplier is your single tuning knob.</p>
      </div>
    </div>
  </ng-container>

  <!-- ───────── static stubs ───────── -->
  <div class="panel" *ngIf="tab === 'users'">
    <h3>User &amp; Role Management</h3>
    <div class="cfg-static-row" *ngFor="let u of demoUsers">
      <span class="av" [style.background]="'#2a3340'">{{ u.initials }}</span>
      <div style="flex:1"><b>{{ u.name }}</b><div class="rule-desc" style="text-transform:none;letter-spacing:0">{{ u.email }}</div></div>
      <span class="tag" style="background:#22384a;color:#7dd3fc">{{ u.role }}</span>
    </div>
    <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:12px">Static preview — RBAC wiring is a later iteration.</p>
  </div>

  <div class="panel" *ngIf="tab === 'repos'">
    <h3>Repo Management</h3>
    <div class="cfg-static-row" *ngFor="let r of demoRepos">
      <code style="flex:1">{{ r.repo }}</code>
      <span class="tag" style="background:#1b2530;color:#9fb4c7">{{ r.stack }}</span>
      <span class="tag" [style.background]="r.active ? '#1e3a2a' : '#2a2f3a'" [style.color]="r.active ? '#7ee0a8' : 'var(--muted)'">{{ r.active ? 'active' : 'paused' }}</span>
    </div>
    <p class="rule-desc" style="text-transform:none;letter-spacing:0;margin-top:12px">Static preview — connect/disconnect flows are a later iteration.</p>
  </div>
  `,
})
export class ConfigurationComponent implements OnInit {
  private readonly svc = inject(QualityService);

  tab: Tab = 'rules';
  builtin = BUILTIN;

  multiplier = 1;
  usdPerPoint = 40;
  runsPerYear = 250;
  ratePerHour = 65;
  rulesJson = '[]';

  saving = false;
  okMsg = '';
  errMsg = '';
  warnings: string[] = [];
  private saved: RulesetConfig = { settings: {}, rules: [] };

  demoUsers = [
    { name: 'Arun J', email: 'aj@procap.ai', role: 'Exec', initials: 'AJ' },
    { name: 'Manuel Johnson', email: 'manuel.johnson@procap.ai', role: 'Arch/Lead', initials: 'MJ' },
    { name: 'Balaji Umapaty', email: 'balaji@procap.ai', role: 'Engineer', initials: 'BU' },
  ];
  demoRepos = [
    { repo: 'panangad/sample-proj-playwright', stack: 'playwright', active: true },
    { repo: 'panangad/sample-proj', stack: 'python', active: false },
  ];

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.svc.getRuleset().subscribe({
      next: ({ config }) => { this.saved = config || { settings: {}, rules: [] }; this.applySaved(); },
      error: () => { this.applySaved(); },
    });
  }

  private applySaved(): void {
    const s = this.saved.settings || {};
    this.multiplier = s.tech_debt_multiplier ?? 1;
    this.usdPerPoint = s.usd_per_point ?? 40;
    this.runsPerYear = s.runs_per_year ?? 250;
    this.ratePerHour = s.rate_per_hour ?? 65;
    this.rulesJson = JSON.stringify(this.saved.rules || [], null, 2);
  }

  reset(): void { this.applySaved(); this.okMsg = ''; this.errMsg = ''; this.warnings = []; }

  save(): void {
    this.okMsg = ''; this.errMsg = ''; this.warnings = [];
    let rules: RulesetConfig['rules'];
    try {
      rules = JSON.parse(this.rulesJson || '[]');
      if (!Array.isArray(rules)) { throw new Error('must be a JSON array'); }
    } catch (e) {
      this.errMsg = `Rules JSON invalid: ${(e as Error).message}`;
      return;
    }
    const config: RulesetConfig = {
      settings: {
        tech_debt_multiplier: Number(this.multiplier),
        usd_per_point: Number(this.usdPerPoint),
        runs_per_year: Number(this.runsPerYear),
        rate_per_hour: Number(this.ratePerHour),
      },
      rules,
    };
    this.saving = true;
    this.svc.putRuleset(config).subscribe({
      next: r => {
        this.saving = false;
        this.saved = r.config;
        this.warnings = r.warnings || [];
        this.okMsg = `Saved — ${r.rule_count} custom rule(s). Re-analyze a repo to apply.`;
      },
      error: (err: unknown) => {
        this.saving = false;
        this.errMsg = (err as { error?: { error?: string } })?.error?.error ?? 'Save failed.';
      },
    });
  }
}
