/**
 * Billing price map — client-safe, no secrets.
 *
 * Amount rules (ISO 4217 / Moneroo):
 *   USD  → send in cents (×100).  $3.00 → 300
 *   XAF  → send as-is (0 decimal places). 1200 XAF → 1200
 */

export type Plan = 'free' | 'maestro_monthly' | 'maestro_yearly' | 'ensemble' | 'founding';
export type PricingRegion = 'local' | 'international';
export type BillingCurrency = 'XAF' | 'USD';

export interface PriceInfo {
  /** Amount in Moneroo units (cents for USD, integer for XAF) */
  amount: number;
  currency: BillingCurrency;
  interval: 'monthly' | 'yearly' | 'one-time';
  /** Human-readable display string */
  display: string;
}

export const PRICES: Record<Exclude<Plan, 'free'>, Record<PricingRegion, PriceInfo>> = {
  maestro_monthly: {
    local:         { amount: 1200,  currency: 'XAF', interval: 'monthly', display: '1,200 XAF/mo' },
    international: { amount: 300,   currency: 'USD', interval: 'monthly', display: '$3/mo' },
  },
  maestro_yearly: {
    local:         { amount: 6000,  currency: 'XAF', interval: 'yearly',  display: '6,000 XAF/yr' },
    international: { amount: 2400,  currency: 'USD', interval: 'yearly',  display: '$24/yr' },
  },
  ensemble: {
    local:         { amount: 25000, currency: 'XAF', interval: 'yearly',  display: '25,000 XAF/yr' },
    international: { amount: 10000, currency: 'USD', interval: 'yearly',  display: '$100/yr' },
  },
  founding: {
    local:         { amount: 3000,  currency: 'XAF', interval: 'yearly',  display: '3,000 XAF/yr — locked forever' },
    international: { amount: 1200,  currency: 'USD', interval: 'yearly',  display: '$12/yr — locked forever' },
  },
};

/** How many calendar days each plan lasts */
export const PLAN_DURATION_DAYS: Record<Exclude<Plan, 'free'>, number> = {
  maestro_monthly: 30,
  maestro_yearly:  365,
  ensemble:        365,
  founding:        365,
};

/** Payment methods per currency (Moneroo method codes) */
export const PAYMENT_METHODS: Record<BillingCurrency, string[]> = {
  XAF: ['mtn_cm', 'orange_cm', 'card_xaf', 'crypto_xaf'],
  USD: ['card_usd', 'crypto_usd'],
};

/** Savings label shown on annual plan (vs monthly × 12) */
export function annualSavingsLabel(region: PricingRegion): string {
  if (region === 'local') {
    const monthly = 1200 * 12; // 14,400 XAF
    const annual  = 6000;
    const pct     = Math.round((1 - annual / monthly) * 100);
    return `Save ${pct}% vs monthly`;
  }
  const monthly = 3 * 12; // $36
  const annual  = 24;
  const pct     = Math.round((1 - annual / monthly) * 100);
  return `Save ${pct}% vs monthly`;
}
