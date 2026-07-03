import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  protected readonly domainError = this.auth.domainError;

  // QA/agent escape hatch: /login?native=1 reveals the Cognito native-login path
  // (username/password) instead of forcing Microsoft SSO.
  protected readonly nativeMode = new URLSearchParams(window.location.search).has('native');

  constructor() {
    // With ?native=1, go straight to the Cognito form — no extra click for agents.
    if (this.nativeMode) this.auth.loginNative();
  }

  signIn(): void {
    this.auth.login();
  }

  signInNative(): void {
    this.auth.loginNative();
  }
}
