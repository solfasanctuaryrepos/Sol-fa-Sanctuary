/**
 * billing-verify-payment
 *
 * Called by the client after Moneroo redirects back with ?paymentId=xxx&paymentStatus=success.
 * This function:
 *   1. Verifies the paymentId against Moneroo's API (can't be spoofed)
 *   2. Reads the plan from the payment's own metadata (not from client — prevents plan spoofing)
 *   3. Upgrades the user's plan in profiles
 *
 * POST body: { paymentId: string }
 * Authorization: Bearer <user-JWT>
 *
 * Env secrets required:
 *   MONEROO_KEY              — Moneroo publishable key
 *   SUPABASE_SERVICE_ROLE_KEY — For bypassing RLS when writing to profiles
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, corsError } from '../_shared/cors.ts';

// Plan duration in days — mirrors PLAN_DURATION_DAYS in utils/prices.ts
const PLAN_DURATION_DAYS: Record<string, number> = {
  maestro_monthly: 30,
  maestro_yearly:  365,
  ensemble:        365,
  founding:        365,
};

const VALID_PLANS = new Set(Object.keys(PLAN_DURATION_DAYS));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const MONEROO_KEY = Deno.env.get('MONEROO_KEY');
  if (!MONEROO_KEY) return corsError('Payment gateway not configured', 500);

  // ── Authenticate user ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return corsError('Not authenticated', 401);

  // Anon client — only used to identify the calling user
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return corsError('Not authenticated', 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { paymentId?: string };
  try { body = await req.json(); } catch { return corsError('Invalid JSON body'); }

  const { paymentId } = body;
  if (!paymentId) return corsError('paymentId is required');

  // ── Verify payment with Moneroo ────────────────────────────────────────────
  // GET /v1/payments/{paymentId} confirms this payment is real and successful.
  // We read plan from payment.data.metadata — not from client — to prevent spoofing.
  let monerooRes: Response;
  try {
    monerooRes = await fetch(`https://api.moneroo.io/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MONEROO_KEY}`,
        'Accept':        'application/json',
      },
    });
  } catch (err) {
    console.error('Moneroo network error:', err);
    return corsError('Could not reach payment gateway', 502);
  }

  const json = await monerooRes.json();

  if (!monerooRes.ok) {
    console.error('Moneroo payment lookup failed:', json);
    return corsError('Payment not found or gateway error', 404);
  }

  // Normalise response shape — Moneroo wraps in .data
  const payment = json?.data ?? json;

  // ── Safety checks ──────────────────────────────────────────────────────────
  // 1. Payment must be successful
  const status = (payment?.status ?? '').toLowerCase();
  if (status !== 'success') {
    return corsResponse({ success: false, reason: `Payment status is '${status}', not 'success'` }, 200);
  }

  // 2. Metadata must match the calling user (prevents using someone else's paymentId)
  const meta = payment?.metadata ?? {};
  if (meta.user_id && meta.user_id !== user.id) {
    console.error(`Payment user_id mismatch: meta=${meta.user_id} caller=${user.id}`);
    return corsError('Payment does not belong to this account', 403);
  }

  // 3. Plan must be a valid paid plan (read from metadata, not client)
  const plan: string = meta.plan ?? '';
  if (!VALID_PLANS.has(plan)) {
    console.error('Invalid plan in payment metadata:', plan);
    return corsError('Unrecognised plan in payment metadata', 400);
  }

  // ── Upgrade the user's plan (service-role bypasses RLS) ───────────────────
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const durationDays = PLAN_DURATION_DAYS[plan];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  const updatePayload: Record<string, unknown> = {
    plan,
    plan_expires_at:    expiresAt.toISOString(),
    moneroo_payment_id: paymentId,
  };

  if (plan === 'founding') {
    updatePayload.is_founding_member = true;
  }

  const { error: updateErr } = await serviceClient
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id);

  if (updateErr) {
    console.error('Failed to upgrade plan:', updateErr);
    return corsError('Plan upgrade failed — please contact support', 500);
  }

  console.log(`✅ Plan upgraded: user ${user.id} → ${plan} (expires ${expiresAt.toISOString()})`);

  return corsResponse({
    success: true,
    plan,
    expiresAt: expiresAt.toISOString(),
  });
});
