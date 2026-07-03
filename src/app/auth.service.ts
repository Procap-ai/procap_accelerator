import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { ALLOWED_EMAIL_DOMAIN, cognito } from './auth.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oidc = inject(OidcSecurityService);

  readonly isAuthenticated = signal(false);
  readonly email = signal<string | null>(null);
  readonly name = signal<string | null>(null);
  /** Set when a valid login is rejected for being off the allowed domain. */
  readonly domainError = signal<string | null>(null);

  /** Runs once at startup (app initializer) — processes any login callback. */
  init(): Observable<unknown> {
    return this.oidc.checkAuth().pipe(
      tap(({ isAuthenticated, userData }) => {
        const email = (userData?.email ?? '').toLowerCase();

        if (
          isAuthenticated &&
          ALLOWED_EMAIL_DOMAIN &&
          email &&
          !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
        ) {
          // Authenticated but not an allowed account — reject.
          this.domainError.set(
            `${email} is not a @${ALLOWED_EMAIL_DOMAIN} account.`,
          );
          this.isAuthenticated.set(false);
          this.oidc.logoffLocal();
          return;
        }

        this.isAuthenticated.set(isAuthenticated);
        this.email.set(userData?.email ?? null);
        this.name.set(userData?.name ?? null);
      }),
    );
  }

  /** Normal login: jump straight to Microsoft SSO (bypasses the Cognito chooser). */
  login(): void {
    this.domainError.set(null);
    this.oidc.authorize(undefined, {
      customParams: { identity_provider: cognito.identityProvider },
    });
  }

  /**
   * Native Cognito login (QA / automated agents): omit identity_provider so the
   * Cognito Hosted UI shows its username/password form instead of forcing SSO.
   * Reached via /login?native=1.
   */
  loginNative(): void {
    this.domainError.set(null);
    this.oidc.authorize();
  }

  logout(): void {
    // Cognito exposes no end_session_endpoint via discovery, so clear the local
    // session then hit the Hosted UI /logout endpoint.
    this.oidc.logoffLocal();
    const origin = window.location.origin;
    window.location.href =
      `${cognito.domain}/logout?client_id=${cognito.clientId}` +
      `&logout_uri=${encodeURIComponent(origin)}`;
  }
}
