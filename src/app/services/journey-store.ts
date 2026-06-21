import { Injectable } from '@angular/core';

/** A business-critical user journey the customer wants assured. Authored in Configuration →
 *  Journeys (the "journeys.yaml" the Coverage-gaps doc calls for), consumed by the Business
 *  Assurance + AC-alignment views. Alignment is directional/modelled for the POC. */
export interface Journey {
  id: string;
  name: string;
  criticality: 'low' | 'medium' | 'high';
  weightUsd: number;                 // risk $ if this journey breaks unnoticed
  source: string;                    // Jira-1042 / auth.feature:14 / PROD-analytics / hand-authored
  /** directional alignment for the POC: how well current tests exercise this journey */
  alignment: 'aligned' | 'partial' | 'unaligned' | 'no-test';
  confidence: number;                // 0-100 (modelled — semantic-similarity proxy)
  test?: string;                     // the test believed to cover it (if any)
}

const KEY = 'meridian_journeys';

const SEED: Journey[] = [
  { id: 'j-checkout-card', name: 'Checkout — pay with saved card', criticality: 'high', weightUsd: 4200, source: 'Jira-1042', alignment: 'aligned', confidence: 88, test: 'checkout.spec.ts › pays with saved card' },
  { id: 'j-checkout-promo', name: 'Checkout — promo code applied', criticality: 'medium', weightUsd: 1600, source: 'auth.feature:31', alignment: 'partial', confidence: 61, test: 'checkout.spec.ts › applies promo' },
  { id: 'j-login-sso', name: 'Login — SSO + MFA', criticality: 'high', weightUsd: 3800, source: 'Jira-0991', alignment: 'unaligned', confidence: 42, test: 'login.spec.ts › renders login page' },
  { id: 'j-cart-edit', name: 'Cart — quantity edit & persistence', criticality: 'medium', weightUsd: 1200, source: 'hand-authored', alignment: 'aligned', confidence: 79, test: 'cart.spec.ts › edits quantity' },
  { id: 'j-refund-partial', name: 'Refund — partial refund flow', criticality: 'high', weightUsd: 2600, source: 'PROD-analytics', alignment: 'no-test', confidence: 0 },
];

@Injectable({ providedIn: 'root' })
export class JourneyStore {
  list(): Journey[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { return [...SEED]; }
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as Journey[]) : [...SEED];
    } catch {
      return [...SEED];
    }
  }
  save(list: Journey[]): void { localStorage.setItem(KEY, JSON.stringify(list)); }
  resetToSeed(): Journey[] { this.save([...SEED]); return this.list(); }
}
