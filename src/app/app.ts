import { ApplicationConfig, Component, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, RouterOutlet, withHashLocation } from '@angular/router';
import { provideAuth } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authConfig } from './auth.config';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    provideAuth(authConfig),
    // Resolve auth state (and process any SSO callback) before routes render.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).init())),
  ]
};
