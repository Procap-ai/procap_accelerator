import { LogLevel, PassedInitialConfig } from 'angular-auth-oidc-client';

// Reuses the SAME Cognito user pool + app client as procap-ui (see procap-ui/
// SSO-SETUP.md). Sharing the client is intentional for the demo: same users,
// same Microsoft/Google IdPs. The only prerequisite is that this app's origin
// (https://app.procap.ai, plus http://localhost:4200 for dev) is added to the
// client's callback/logout URLs — run scripts/add-app-callback.sh once.
//
// If you'd rather isolate this app, create a second app client in the same pool
// and swap clientId below; nothing else changes.
export const cognito = {
  domain: 'https://procap-qa.auth.us-east-1.amazoncognito.com',
  clientId: '45t7vpm9f95t8sg5ofa4plbrs9',
  // Cognito identity-provider name created by procap-ui/scripts/add-microsoft-idp.sh.
  // Passing this skips the Hosted UI chooser and goes straight to Microsoft.
  identityProvider: 'Microsoft',
};

// Only accounts on this email domain may open the app. This is the login wall
// for the demo — set to '' to allow ANY successfully-authenticated account
// (e.g. when showing the demo to external viewers via Google/Microsoft).
export const ALLOWED_EMAIL_DOMAIN = 'procap.ai';

export const authConfig: PassedInitialConfig = {
  config: {
    authority:
      'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_JaPgCz1dO',
    redirectUrl: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    clientId: cognito.clientId,
    scope: 'openid email profile',
    responseType: 'code', // Authorization Code + PKCE (public client)
    silentRenew: true,
    useRefreshToken: true,
    renewTimeBeforeTokenExpiresInSeconds: 30,
    // See procap-ui/auth.config.ts: Cognito rejects offline_access, so we omit
    // it and rely on openid + ALLOW_REFRESH_TOKEN_AUTH for refresh tokens.
    // Error-level logging keeps the library's false-positive warning quiet.
    logLevel: LogLevel.Error,
  },
};
