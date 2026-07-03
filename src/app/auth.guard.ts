import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Allows the route only when signed in; otherwise sends to /login.
 *  Preserves ?native=1 so the QA/agent native-login path works from any URL. */
export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  const queryParams = route.queryParamMap.has('native') ? { native: '1' } : undefined;
  return router.createUrlTree(['/login'], { queryParams });
};

/** Keeps signed-in users away from /login (sends them home → /quality). */
export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
