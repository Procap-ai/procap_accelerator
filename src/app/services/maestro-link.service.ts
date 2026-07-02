import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, shareReplay, switchMap, tap } from 'rxjs/operators';

import { MaestroService, MaestroTarget, CoverageLevel } from './maestro.service';
import { MaestroManagedStore } from './maestro-managed.store';

export type LinkStatus = 'none' | 'connected' | 'managed';

/** Match Meridian's repoUrl to a Maestro target's repo_url (same normalisation as RepoStore). */
function norm(url: string): string {
  return (url || '').trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}

/**
 * Bridges Meridian's repo list to Maestro targets.
 *
 * A Meridian repo (keyed by repoUrl) is linked to a Maestro target by matching normalised repo URLs.
 * "Enable Maestro" on a Meridian repo finds-or-creates that target and marks it auto-managed. The
 * target list is cached so surfaces (fleet rows, repo view, Agentic) can query status synchronously.
 *
 * GitHub PAT: there is no client-side token to reuse — Meridian never persists the PAT it uses for
 * analysis, and the Maestro/autopilot backend keeps its own creds in SSM per target. So a token is
 * only needed at first enable (private repos / to push the converted branch); once a target exists its
 * `has_creds` flag tells us not to ask again.
 */
@Injectable({ providedIn: 'root' })
export class MaestroLinkService {
  private readonly svc = inject(MaestroService);
  private readonly managed = inject(MaestroManagedStore);

  private targets: MaestroTarget[] = [];
  private loaded = false;
  private load$?: Observable<MaestroTarget[]>;

  /** Load (and cache) the target list. Concurrent callers share one in-flight request. */
  load(force = false): Observable<MaestroTarget[]> {
    if (force) { this.loaded = false; this.load$ = undefined; }
    if (this.loaded) { return of(this.targets); }
    if (!this.load$) {
      this.load$ = this.svc.listTargets().pipe(
        map(r => r.targets),
        tap(t => { this.targets = t; this.loaded = true; this.load$ = undefined; }),
        shareReplay(1),
      );
    }
    return this.load$;
  }

  targetFor(repoUrl: string): MaestroTarget | undefined {
    const k = norm(repoUrl);
    return this.targets.find(t => t.kind === 'repo' && norm(t.repo_url || '') === k);
  }

  status(repoUrl: string): LinkStatus {
    const t = this.targetFor(repoUrl);
    if (!t) { return 'none'; }
    return this.managed.isManaged(t.target_id) ? 'managed' : 'connected';
  }

  /** True once a target exists with creds stored (in SSM) — so we needn't ask for a PAT again. */
  hasCreds(repoUrl: string): boolean { return !!this.targetFor(repoUrl)?.has_creds; }

  /** Find-or-create the Maestro target for this repo and mark it auto-managed. */
  enable(repoUrl: string, opts?: { coverage?: CoverageLevel; githubToken?: string }): Observable<MaestroTarget> {
    const existing = this.targetFor(repoUrl);
    if (existing) { this.managed.set(existing.target_id, true); return of(existing); }
    return this.svc.createTarget({
      kind: 'repo',
      repo_url: repoUrl,
      coverage: opts?.coverage ?? 'minimal',
      github_token: opts?.githubToken?.trim() || undefined,
    }).pipe(
      switchMap(res => this.load(true).pipe(map(() => {
        this.managed.set(res.target_id, true);
        return this.targetFor(repoUrl) ?? ({ target_id: res.target_id, repo_url: repoUrl } as MaestroTarget);
      }))),
    );
  }

  setManaged(repoUrl: string, on: boolean): void {
    const t = this.targetFor(repoUrl);
    if (t) { this.managed.set(t.target_id, on); }
  }
}
