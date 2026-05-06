/**
 * useEntitlements
 *
 * Single source of truth for what the current user can and cannot do.
 *
 * Fetches once per session:
 *   - profiles(plan, plan_expires_at, is_founding_member, pricing_region, currency)
 *   - billing_config(billing_active)
 *
 * When billing_active = false (pre-launch): everyone gets full access
 * regardless of plan — the billing system is built but dormant.
 *
 * Expose via EntitlementsContext so any component can read without prop-drilling.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from '../supabase';
import type { Plan, PricingRegion, BillingCurrency } from '../utils/prices';

export type { Plan, PricingRegion, BillingCurrency };

export interface Entitlements {
  /** True once the async fetch has resolved */
  loaded: boolean;
  /** Whether the billing system is active (controlled via billing_config.billing_active) */
  billingActive: boolean;
  plan: Plan;
  /** False if the plan has a past plan_expires_at date */
  isActive: boolean;
  isFounding: boolean;
  pricingRegion: PricingRegion;
  currency: BillingCurrency;

  // ── Ensemble org ───────────────────────────────────────────────────────────
  /** UUID of the org this user belongs to (owner or active member) */
  orgId: string | null;
  orgRole: 'owner' | 'admin' | 'member' | null;

  // ── Feature flags ──────────────────────────────────────────────────────────
  /** Unlimited downloads (paid plan, OR billing not yet active) */
  canDownloadUnlimited: boolean;
  /** 3 for free when billing active, otherwise unlimited */
  monthlyDownloadLimit: number;
  /** Show ad placeholders (free + billing active) */
  showAds: boolean;
  /** Can save sheets for offline viewing */
  hasOfflineAccess: boolean;
  /** Can submit requests and vote (viewing is always open) */
  hasRequestAccess: boolean;
  /** Ensemble team features (personal ensemble plan OR active org membership) */
  hasTeamFeatures: boolean;
  teamSeats: number;
}

const FULL_ACCESS: Omit<Entitlements, 'loaded' | 'billingActive' | 'plan' | 'isActive' | 'isFounding' | 'pricingRegion' | 'currency' | 'orgId' | 'orgRole'> = {
  canDownloadUnlimited:  true,
  monthlyDownloadLimit:  999999,
  showAds:               false,
  hasOfflineAccess:      true,
  hasRequestAccess:      true,
  hasTeamFeatures:       false,
  teamSeats:             1,
};

function isPaid(plan: Plan): boolean {
  return ['maestro_monthly', 'maestro_yearly', 'ensemble', 'founding'].includes(plan);
}

interface OrgMembership {
  org_id: string;
  role: 'owner' | 'admin' | 'member';
  organisations: {
    plan: string;
    plan_expires_at: string | null;
  } | null;
}

function buildEntitlements(
  plan: Plan,
  planExpiresAt: string | null,
  isFounding: boolean,
  pricingRegion: PricingRegion,
  currency: BillingCurrency,
  billingActive: boolean,
  orgMembership: OrgMembership | null,
): Entitlements {
  // Pre-launch: full access for everyone
  if (!billingActive) {
    return {
      loaded: true,
      billingActive: false,
      plan,
      isActive: true,
      isFounding,
      pricingRegion,
      currency,
      orgId:   orgMembership?.org_id   ?? null,
      orgRole: (orgMembership?.role as Entitlements['orgRole']) ?? null,
      ...FULL_ACCESS,
    };
  }

  // Founding members are locked in forever — ignore any stale plan_expires_at value
  const personalExpired = isFounding ? false : (planExpiresAt ? new Date(planExpiresAt) < new Date() : false);
  const effectPersonal  = personalExpired ? 'free' : plan;

  // Org membership path — members inherit ensemble features from the org
  const orgPlan        = orgMembership?.organisations?.plan ?? null;
  const orgExpiry      = orgMembership?.organisations?.plan_expires_at ?? null;
  const orgExpired     = orgExpiry ? new Date(orgExpiry) < new Date() : false;
  const effectOrgPlan  = (orgPlan === 'ensemble' && !orgExpired) ? 'ensemble' : null;

  // Best of personal or org plan
  const effectPlan = effectOrgPlan ?? effectPersonal;
  const paid       = isPaid(effectPlan);

  return {
    loaded: true,
    billingActive: true,
    plan: effectPersonal,   // personal plan shown separately from org
    isActive: !personalExpired,
    isFounding,
    pricingRegion,
    currency,
    orgId:   orgMembership?.org_id   ?? null,
    orgRole: (orgMembership?.role as Entitlements['orgRole']) ?? null,

    canDownloadUnlimited:  paid,
    monthlyDownloadLimit:  paid ? 999999 : 3,
    showAds:               !paid,
    hasOfflineAccess:      paid,
    hasRequestAccess:      paid,
    hasTeamFeatures:       effectPlan === 'ensemble',
    teamSeats:             effectPlan === 'ensemble' ? 20 : 1,
  };
}

const DEFAULT_ENTITLEMENTS: Entitlements = {
  loaded:               false,
  billingActive:        false,
  plan:                 'free',
  isActive:             true,
  isFounding:           false,
  pricingRegion:        'international',
  currency:             'USD',
  orgId:                null,
  orgRole:              null,
  ...FULL_ACCESS,
};

export function useEntitlements(userId: string | null, refreshKey: number = 0): Entitlements {
  const [state, setState] = useState<Entitlements>(DEFAULT_ENTITLEMENTS);

  const fetch = useCallback(async () => {
    if (!userId) {
      // Logged-out user: apply free-tier entitlements based on billing state
      const { data: cfg } = await db
        .from('billing_config')
        .select('billing_active')
        .eq('id', 1)
        .single();
      const billingActive = cfg?.billing_active ?? false;
      setState(buildEntitlements('free', null, false, 'international', 'USD', billingActive, null));
      return;
    }

    const [profileRes, configRes, orgRes] = await Promise.all([
      db.from('profiles')
        .select('plan, plan_expires_at, is_founding_member, pricing_region, currency')
        .eq('id', userId)
        .single(),
      db.from('billing_config')
        .select('billing_active')
        .eq('id', 1)
        .single(),
      db.rpc('get_my_org_membership'),
    ]);

    const profile       = profileRes.data;
    const billingActive = configRes.data?.billing_active ?? false;
    const rawOrg = (Array.isArray(orgRes.data) ? orgRes.data[0] : null) as { org_id: string; role: string; org_plan: string; org_plan_expires_at: string | null } | null;
    const orgMembership: OrgMembership | null = rawOrg ? {
      org_id: rawOrg.org_id,
      role: rawOrg.role as OrgMembership['role'],
      organisations: { plan: rawOrg.org_plan, plan_expires_at: rawOrg.org_plan_expires_at },
    } : null;

    if (!profile) {
      setState(buildEntitlements('free', null, false, 'international', 'USD', billingActive, orgMembership));
      return;
    }

    setState(buildEntitlements(
      (profile.plan as Plan) ?? 'free',
      profile.plan_expires_at,
      profile.is_founding_member ?? false,
      (profile.pricing_region as PricingRegion) ?? 'international',
      (profile.currency as BillingCurrency) ?? 'USD',
      billingActive,
      orgMembership,
    ));
  }, [userId, refreshKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return state;
}

/** Call this to force-refresh entitlements (e.g. after a successful payment) */
export { useEntitlements as default };
