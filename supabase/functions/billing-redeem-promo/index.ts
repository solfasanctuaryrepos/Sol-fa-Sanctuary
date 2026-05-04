/**
 * billing-redeem-promo
 *
 * Redeems a founding-member promo code. Validates the code, checks limits
 * and expiry, assigns founding status to the calling user.
 *
 * POST body: { code: string }
 * Authorization: Bearer <user-JWT>
 *
 * Env secrets required:
 *   SUPABASE_SERVICE_ROLE_KEY — For reading promo_codes and writing to profiles
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, corsError } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Authenticate user ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return corsError('Not authenticated', 401);

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return corsError('Not authenticated', 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { code?: string };
  try { body = await req.json(); } catch { return corsError('Invalid JSON body'); }

  const code = (body.code ?? '').trim().toUpperCase();
  if (!code) return corsError('Promo code is required');

  // ── Service-role client for reading promo_codes (RLS blocks anon) ──────────
  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ── Look up the promo code ─────────────────────────────────────────────────
  const { data: promo, error: promoErr } = await svc
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (promoErr || !promo) return corsError('Invalid or expired promo code', 404);
  if (promo.current_uses >= promo.max_uses) return corsError('This promo code has reached its limit', 400);
  if (promo.expires_at && new Date() > new Date(promo.expires_at)) {
    return corsError('This promo code has expired', 400);
  }

  // ── Check user isn't already a founding member ─────────────────────────────
  const { data: profile } = await svc
    .from('profiles')
    .select('is_founding_member, plan')
    .eq('id', user.id)
    .single();

  if (profile?.is_founding_member) {
    return corsError('You are already a Founding Member', 400);
  }

  // ── Assign founding member status (no expiry — locked in forever) ────────
  const { error: updateErr } = await svc
    .from('profiles')
    .update({
      is_founding_member:  true,
      plan:                'founding',
      plan_expires_at:     null,   // founding membership never expires
      founding_promo_code: code,
    })
    .eq('id', user.id);

  if (updateErr) {
    console.error('Failed to assign founding member:', updateErr);
    return corsError('Could not apply promo code — please contact support', 500);
  }

  // ── Increment promo code usage count ──────────────────────────────────────
  await svc
    .from('promo_codes')
    .update({ current_uses: promo.current_uses + 1 })
    .eq('id', promo.id);

  console.log(`✅ Founding member assigned: user ${user.id}, code ${code}`);

  return corsResponse({
    success: true,
    message: 'Welcome, Founding Member! Your plan is now active.',
  });
});
