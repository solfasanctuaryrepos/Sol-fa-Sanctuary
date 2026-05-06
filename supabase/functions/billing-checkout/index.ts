/**
 * billing-checkout
 *
 * Creates a Moneroo payment session for a subscription plan and returns
 * the hosted checkout URL. The client redirects the user there.
 *
 * POST body: { plan: 'maestro_monthly' | 'maestro_yearly' | 'ensemble' | 'founding' }
 * Authorization: Bearer <user-JWT>
 *
 * Env secrets required (set once via `supabase secrets set`):
 *   MONEROO_KEY   — Moneroo publishable key (pvk_...)
 *   SITE_URL      — App public URL, e.g. https://solfasanctuary.com
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, corsError } from '../_shared/cors.ts';

// ── Price map (mirrors utils/prices.ts — duplicated here, no TS imports cross Deno boundary)
const PRICES = {
  maestro_monthly: {
    local:         { amount: 1200,  currency: 'XAF', display: '1,200 XAF/mo' },
    international: { amount: 300,   currency: 'USD', display: '$3/mo' },
  },
  maestro_yearly: {
    local:         { amount: 6000,  currency: 'XAF', display: '6,000 XAF/yr' },
    international: { amount: 2400,  currency: 'USD', display: '$24/yr' },
  },
  ensemble: {
    local:         { amount: 25000, currency: 'XAF', display: '25,000 XAF/yr' },
    international: { amount: 10000, currency: 'USD', display: '$100/yr' },
  },
  founding: {
    local:         { amount: 3000,  currency: 'XAF', display: '3,000 XAF/yr' },
    international: { amount: 1200,  currency: 'USD', display: '$12/yr' },
  },
} as const;

type PaidPlan = keyof typeof PRICES;

const PAYMENT_METHODS: Record<string, string[]> = {
  XAF: ['mtn_cm', 'orange_cm'],
  USD: ['card_usd', 'crypto_usd'],
};

const VALID_PLANS: PaidPlan[] = ['maestro_monthly', 'maestro_yearly', 'ensemble', 'founding'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const MONEROO_KEY = Deno.env.get('MONEROO_KEY');
  const SITE_URL    = Deno.env.get('SITE_URL') ?? 'https://solfasanctuary.com';

  if (!MONEROO_KEY) return corsError('Payment gateway not configured', 500);

  // ── Authenticate user ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return corsError('Not authenticated', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return corsError('Not authenticated', 401);

  // ── Validate plan ──────────────────────────────────────────────────────────
  let body: { plan?: string };
  try { body = await req.json(); } catch { return corsError('Invalid JSON body'); }

  const plan = body.plan as PaidPlan;
  if (!VALID_PLANS.includes(plan)) return corsError(`Invalid plan: ${plan}`);

  // ── Get user profile (pricing region, email) ───────────────────────────────
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('pricing_region, currency, display_name, plan')
    .eq('id', user.id)
    .single();

  if (profErr || !profile) return corsError('Profile not found', 404);

  // Prevent downgrade (e.g. already founding → can't buy monthly)
  // Allow upgrade within same or higher tier
  if (profile.plan === 'founding') {
    return corsError('You are already a Founding Member — no further upgrade needed.');
  }

  const region    = (profile.pricing_region ?? 'international') as 'local' | 'international';
  const priceInfo = PRICES[plan][region];

  // ── Build Moneroo payload ──────────────────────────────────────────────────
  const nameParts = (profile.display_name ?? '').trim().split(' ');
  const firstName = nameParts[0] || 'Member';
  const lastName  = nameParts.slice(1).join(' ') || '.'; // Moneroo requires non-empty

  const returnUrl = `${SITE_URL}/?payment=return`;

  const payload = {
    amount:      priceInfo.amount,
    currency:    priceInfo.currency,
    description: `Sol-fa Sanctuary — ${plan.replace(/_/g, ' ')} (${priceInfo.display})`,
    return_url:  returnUrl,
    customer: {
      email:      user.email,
      first_name: firstName,
      last_name:  lastName,
    },
    methods: PAYMENT_METHODS[priceInfo.currency],
    metadata: {
      user_id: user.id,
      plan,
      region,
      // Store expected amount so verify step can cross-check
      expected_amount: priceInfo.amount,
      expected_currency: priceInfo.currency,
    },
  };

  // ── Call Moneroo ───────────────────────────────────────────────────────────
  let monerooRes: Response;
  try {
    monerooRes = await fetch('https://api.moneroo.io/v1/payments/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MONEROO_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Moneroo network error:', err);
    return corsError('Payment gateway unreachable', 502);
  }

  const json = await monerooRes.json();

  if (!monerooRes.ok) {
    const msg = json?.message ?? json?.errors ?? `Moneroo error ${monerooRes.status}`;
    console.error('Moneroo error response:', json);
    return corsError(typeof msg === 'string' ? msg : JSON.stringify(msg), 502);
  }

  const checkoutUrl: string | undefined =
    json?.data?.checkout_url ?? json?.checkout_url;

  if (!checkoutUrl) {
    console.error('Moneroo returned no checkout_url:', json);
    return corsError('Payment gateway returned no checkout URL', 502);
  }

  return corsResponse({ checkoutUrl });
});
