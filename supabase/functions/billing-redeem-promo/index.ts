/**
 * billing-redeem-promo
 *
 * Thin wrapper around the redeem_founding_promo() SQL function, which does the
 * actual work in a single atomic transaction (FOR UPDATE lock prevents
 * concurrent over-redemption past max_uses).
 *
 * POST body: { code: string }
 * Authorization: Bearer <user-JWT>
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return corsError('Not authenticated', 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { code?: string };
  try { body = await req.json(); } catch { return corsError('Invalid JSON body'); }

  const code = (body.code ?? '').trim().toUpperCase();
  if (!code) return corsError('Promo code is required');

  // ── Atomic redemption (single transaction, FOR UPDATE lock) ───────────────
  const { error: rpcErr } = await supabase.rpc('redeem_founding_promo', {
    code_param: code,
  });

  if (rpcErr) {
    console.warn(`Promo redemption failed for user ${user.id}, code ${code}:`, rpcErr.message);
    return corsError(rpcErr.message ?? 'Could not redeem promo code', 400);
  }

  console.log(`✅ Founding member assigned: user ${user.id}, code ${code}`);

  return corsResponse({
    success: true,
    message: 'Promo applied! Complete your subscription above to activate Founding Membership.',
  });
});
