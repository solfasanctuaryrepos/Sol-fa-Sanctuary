/**
 * PricingPage
 *
 * Full pricing & plan comparison page. Handles:
 *   - Post-payment return: calls billing-verify-payment Edge Function, then refreshes entitlements
 *   - Plan card display with region-aware pricing
 *   - Checkout: calls billing-checkout Edge Function → redirect to Moneroo
 *   - Promo code redemption (founding-member codes)
 *   - "Billing not yet active" soft-launch notice
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Zap, Users, Shield, WifiOff,
  Download, MessageSquarePlus, Sparkles, Crown, Tag, Loader2,
  ArrowRight, Info, X, RefreshCw, Bell,
} from 'lucide-react';
import { supabase, db } from '../supabase';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';
import { PRICES, annualSavingsLabel } from '../utils/prices';
import type { Plan } from '../utils/prices';

interface PricingPageProps {
  darkMode: boolean;
  currentUser: { id: string; email: string } | null;
  /** Set when Moneroo redirects back with ?payment=return&paymentStatus=success|failed|cancelled */
  paymentReturnStatus: 'success' | 'failed' | 'cancelled' | null;
  paymentReturnId: string | null;
  onAuthRequired: () => void;
  /** Called after a successful plan upgrade so App can clear paymentReturn state */
  onPaymentHandled: () => void;
}

// ── Feature comparison rows ────────────────────────────────────────────────────
interface FeatureRow {
  label: string;
  free: string | boolean;
  maestro: string | boolean;
  ensemble: string | boolean;
  founding: string | boolean;
}

const FEATURES: FeatureRow[] = [
  { label: 'Browse & view sheets',     free: true,        maestro: true,        ensemble: true,    founding: true       },
  { label: 'Monthly downloads',        free: '3/month',   maestro: 'Unlimited', ensemble: 'Unlimited', founding: 'Unlimited' },
  { label: 'Full PDF preview',         free: true,        maestro: true,        ensemble: true,    founding: true       },
  { label: 'Offline access',           free: false,       maestro: true,        ensemble: true,    founding: true       },
  { label: 'Submit & vote requests',   free: false,       maestro: true,        ensemble: true,    founding: true       },
  { label: 'Collections & favourites', free: true,        maestro: true,        ensemble: true,    founding: true       },
  { label: 'Ad-free experience',       free: false,       maestro: true,        ensemble: true,    founding: true       },
  { label: 'Team workspace',           free: false,       maestro: false,       ensemble: '20 seats', founding: false   },
  { label: 'Founding Member badge',    free: false,       maestro: false,       ensemble: false,   founding: true       },
  { label: 'Locked-in annual price',   free: false,       maestro: false,       ensemble: false,   founding: true       },
];

function FeatureCell({ value, darkMode }: { value: string | boolean; darkMode: boolean }) {
  if (value === true)  return <CheckCircle2 size={18} className="text-green-500 mx-auto" />;
  if (value === false) return <X size={16} className={`mx-auto ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />;
  return <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{value}</span>;
}

// ── Edge function helper ──────────────────────────────────────────────────────
async function callEdgeFn(path: string, body: object): Promise<{ data?: unknown; error?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error ?? `Server error ${res.status}` };
    return { data: json };
  } catch {
    return { error: 'Network error — please try again' };
  }
}

// ── Plan card ─────────────────────────────────────────────────────────────────
interface PlanCardProps {
  plan: Exclude<Plan, 'free'>;
  altPlan?: Exclude<Plan, 'free'>;          // yearly variant when hasBillingToggle
  hasBillingToggle?: boolean;
  billingPeriod?: 'monthly' | 'yearly';
  onBillingPeriodChange?: (p: 'monthly' | 'yearly') => void;
  label: string;
  tagline: string;
  icon: React.ReactNode;
  accentClass: string;
  borderClass: string;
  isCurrent: boolean;
  isPopular?: boolean;
  region: 'local' | 'international';
  onUpgrade: (plan: Exclude<Plan, 'free'>) => void;
  loading: boolean;
  darkMode: boolean;
  billingActive: boolean;
  entLoaded: boolean;
  highlights: string[];
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan, altPlan, hasBillingToggle, billingPeriod = 'monthly', onBillingPeriodChange,
  label, tagline, icon, accentClass, borderClass, isCurrent,
  isPopular, region, onUpgrade, loading, darkMode, billingActive, entLoaded, highlights,
}) => {
  // When the toggle is active, use the yearly plan's pricing & upgrade target
  const effectivePlan = (hasBillingToggle && billingPeriod === 'yearly' && altPlan) ? altPlan : plan;
  const price = PRICES[effectivePlan][region];
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const popular = isPopular && !isCurrent;

  return (
    <div className={`relative rounded-2xl border p-6 flex flex-col gap-4 transition-shadow
      ${isCurrent ? `${borderClass} shadow-lg` : cardBg}
      ${popular ? 'ring-2 ring-green-500/30' : ''}
    `}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-slate-950 text-xs font-bold px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}
      {isCurrent && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full bg-slate-950 ${accentClass} border ${borderClass}`}>
          Your Plan
        </div>
      )}
      {entLoaded && !billingActive && !isCurrent && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide">
          Launching soon
        </div>
      )}

      {/* Monthly / Yearly toggle */}
      {hasBillingToggle && (
        <div className={`flex self-start rounded-lg p-0.5 text-xs font-semibold ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
          {(['monthly', 'yearly'] as const).map(p => (
            <button
              key={p}
              onClick={() => onBillingPeriodChange?.(p)}
              className={`px-3 py-1 rounded-md transition-all capitalize ${
                billingPeriod === p
                  ? (darkMode ? 'bg-slate-600 text-slate-100 shadow' : 'bg-white text-slate-900 shadow-sm')
                  : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
              }`}
            >
              {p}
              {p === 'yearly' && (
                <span className={`ml-1 font-bold ${billingPeriod === 'yearly' ? 'text-green-500' : (darkMode ? 'text-slate-500' : 'text-slate-400')}`}>
                  · Save
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Icon + title */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl ${isCurrent ? 'bg-current/10' : (darkMode ? 'bg-slate-800' : 'bg-slate-100')}`}>
          <span className={accentClass}>{icon}</span>
        </div>
        <div>
          <h3 className={`font-bold text-base ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{label}</h3>
          <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{tagline}</p>
        </div>
      </div>

      {/* Price */}
      <div>
        <span className={`text-2xl font-black ${isCurrent ? accentClass : (darkMode ? 'text-slate-100' : 'text-slate-900')}`}>
          {price.currency === 'XAF' ? price.display.split(' ')[0] : price.display.split('/')[0]}
        </span>
        <span className={`text-sm ml-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          {price.interval === 'monthly' ? '/month' : price.interval === 'yearly' ? '/year' : ''}
        </span>
        {effectivePlan === 'maestro_yearly' && (
          <p className="text-xs text-green-500 font-medium mt-0.5">{annualSavingsLabel(region)}</p>
        )}
        {effectivePlan === 'founding' && (
          <p className="text-xs text-amber-500 font-medium mt-0.5">Locked in forever</p>
        )}
      </div>

      {/* Highlights */}
      <ul className="space-y-2 flex-1">
        {highlights.map(h => (
          <li key={h} className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={14} className={accentClass} />
            <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{h}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className={`text-center text-sm font-medium py-2 rounded-xl ${accentClass} opacity-70`}>
          Active plan
        </div>
      ) : billingActive ? (
        <button
          onClick={() => onUpgrade(effectivePlan)}
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-green-500 text-slate-950 hover:bg-green-400 active:scale-95 disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? 'Redirecting…' : 'Upgrade'}
          {!loading && <ArrowRight size={14} />}
        </button>
      ) : (
        <a
          href="mailto:solfasanctuary@gmail.com?subject=Notify me when billing launches"
          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 border
            ${darkMode
              ? 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
        >
          <Bell size={14} />
          Get notified
        </a>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const PricingPage: React.FC<PricingPageProps> = ({
  darkMode, currentUser, paymentReturnStatus, paymentReturnId,
  onAuthRequired, onPaymentHandled,
}) => {
  const ent = useEntitlementsContext();

  // Always re-fetch live billing state when pricing page opens
  useEffect(() => { ent.refresh(); }, []);

  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [maestroBilling, setMaestroBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentWindowOpen, setPaymentWindowOpen] = useState(false);

  // Auto-refresh entitlements when user returns to tab after paying in new tab
  useEffect(() => {
    if (!paymentWindowOpen) return;
    const handleFocus = () => { ent.refresh(); };
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [paymentWindowOpen, ent]);

  // Payment return verification
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    plan?: string;
    message?: string;
  } | null>(null);

  // Promo code redemption
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ ok: boolean; message: string } | null>(null);

  const textPrimary   = darkMode ? 'text-slate-100'  : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400'  : 'text-slate-600';
  const cardBg        = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  // ── Verify payment on mount if returning from Moneroo ───────────────────────
  const verifyPayment = useCallback(async () => {
    if (paymentReturnStatus !== 'success' || !paymentReturnId || !currentUser) return;
    setVerifying(true);
    const { data, error } = await callEdgeFn('billing-verify-payment', { paymentId: paymentReturnId });
    setVerifying(false);

    if (error) {
      setVerifyResult({ ok: false, message: error });
    } else {
      const d = data as { success: boolean; plan?: string; reason?: string };
      if (d.success) {
        setVerifyResult({ ok: true, plan: d.plan });
        ent.refresh();
        onPaymentHandled();
      } else {
        setVerifyResult({ ok: false, message: d.reason ?? 'Payment not confirmed yet.' });
      }
    }
  }, [paymentReturnStatus, paymentReturnId, currentUser, ent, onPaymentHandled]);

  useEffect(() => { verifyPayment(); }, [verifyPayment]);

  // ── Checkout ──────────────────────────────────────────────────────────────────
  const handleUpgrade = async (plan: Exclude<Plan, 'free'>) => {
    if (!currentUser) { onAuthRequired(); return; }
    setCheckoutError(null);
    setCheckoutLoading(plan);

    const { data, error } = await callEdgeFn('billing-checkout', { plan });
    setCheckoutLoading(null);

    if (error) { setCheckoutError(error); return; }
    const { checkoutUrl } = data as { checkoutUrl: string };

    const newTab = window.open(checkoutUrl, '_blank', 'noopener');
    if (newTab) {
      setPaymentWindowOpen(true);
    } else {
      // Popup blocked (mobile Safari etc.) — fall back to same-tab redirect
      window.location.href = checkoutUrl;
    }
  };

  // ── Promo code ────────────────────────────────────────────────────────────────
  const handleRedeemPromo = async () => {
    if (!currentUser) { onAuthRequired(); return; }
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoResult(null);

    const { data, error } = await callEdgeFn('billing-redeem-promo', { code: promoCode.trim() });
    setPromoLoading(false);

    if (error) {
      setPromoResult({ ok: false, message: error });
    } else {
      const d = data as { success: boolean; message?: string };
      setPromoResult({ ok: true, message: d.message ?? 'Promo code applied!' });
      ent.refresh();
      setPromoCode('');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const region = ent.pricingRegion;
  const currentPlan = ent.plan;

  const planConfig: Array<{
    plan: Exclude<Plan, 'free'>;
    altPlan?: Exclude<Plan, 'free'>;
    hasBillingToggle?: boolean;
    label: string;
    tagline: string;
    icon: React.ReactNode;
    accentClass: string;
    borderClass: string;
    isPopular?: boolean;
    highlights: string[];
  }> = [
    {
      plan: 'maestro_monthly',
      altPlan: 'maestro_yearly',
      hasBillingToggle: true,
      label: 'Maestro',
      tagline: 'Unlimited access, your way',
      icon: <Zap size={20} />,
      accentClass: 'text-green-500',
      borderClass: 'border-green-500/40',
      isPopular: true,
      highlights: ['Unlimited downloads', 'Offline viewing', 'Submit & vote requests', 'Ad-free experience'],
    },
    {
      plan: 'ensemble',
      label: 'Ensemble',
      tagline: 'For choirs & music groups',
      icon: <Users size={20} />,
      accentClass: 'text-purple-500',
      borderClass: 'border-purple-500/40',
      highlights: ['Everything in Maestro', '20-seat team workspace', 'Shared collection library', 'Organisation billing'],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-8 pb-16 animate-in fade-in duration-500">

      {/* ── Payment return banner ─────────────────────────────────────────────── */}
      {(paymentReturnStatus === 'failed' || paymentReturnStatus === 'cancelled') && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${darkMode ? 'bg-red-950/40 border-red-800/50' : 'bg-red-50 border-red-200'}`}>
          <XCircle size={20} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className={`font-semibold text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
              {paymentReturnStatus === 'cancelled' ? 'Payment cancelled' : 'Payment failed'}
            </p>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
              No charge was made. You can try again below.
            </p>
          </div>
        </div>
      )}

      {/* Verifying spinner */}
      {verifying && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <Loader2 size={18} className="text-green-500 animate-spin shrink-0" />
          <p className={`text-sm font-medium ${textSecondary}`}>Confirming your payment…</p>
        </div>
      )}

      {/* Verify result */}
      {verifyResult && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          verifyResult.ok
            ? (darkMode ? 'bg-green-950/40 border-green-800/50' : 'bg-green-50 border-green-200')
            : (darkMode ? 'bg-amber-950/40 border-amber-800/50' : 'bg-amber-50 border-amber-200')
        }`}>
          {verifyResult.ok
            ? <CheckCircle2 size={20} className="text-green-500 mt-0.5 shrink-0" />
            : <Info size={20} className="text-amber-500 mt-0.5 shrink-0" />
          }
          <div>
            <p className={`font-semibold text-sm ${verifyResult.ok ? (darkMode ? 'text-green-300' : 'text-green-700') : (darkMode ? 'text-amber-300' : 'text-amber-700')}`}>
              {verifyResult.ok
                ? `Welcome to ${verifyResult.plan?.replace(/_/g, ' ')} — your plan is now active!`
                : 'Payment pending'
              }
            </p>
            {!verifyResult.ok && (
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                {verifyResult.message} If you believe this is an error, contact support.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-3">
        <h1 className={`text-4xl md:text-5xl font-serif font-bold ${textPrimary}`}>
          Plans & Pricing
        </h1>
        <p className={`text-lg ${textSecondary}`}>
          Support the sanctuary. Unlock everything.
        </p>

        {/* Current plan badge */}
        {currentUser && ent.loaded && (
          <div className="flex items-center justify-center gap-2 pt-1">
            {ent.isFounding ? (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-bold px-3 py-1.5 rounded-full">
                <Crown size={12} /> Founding Member
              </span>
            ) : currentPlan === 'free' ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                Currently on Free plan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-bold px-3 py-1.5 rounded-full">
                <Zap size={12} /> {currentPlan.replace(/_/g, ' ')} — Active
              </span>
            )}
          </div>
        )}

        {/* Billing not active notice */}
        {ent.loaded && !ent.billingActive && (
          <div className={`max-w-lg mx-auto mt-4 rounded-xl border p-4 flex items-start gap-3 ${darkMode ? 'bg-blue-950/30 border-blue-800/50' : 'bg-blue-50 border-blue-200'}`}>
            <Sparkles size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-left">
              <p className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Billing is launching soon
              </p>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                Everyone enjoys full access for free until launch — no credit card needed.{' '}
                <a href="mailto:solfasanctuary@gmail.com?subject=Notify me when billing launches" className="underline underline-offset-2 font-medium">
                  Get notified when plans go live.
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Plan cards ──────────────────────────────────────────────────────────── */}
      <div>
        {/* Free card + paid cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Free */}
          <div className={`rounded-2xl border p-6 flex flex-col gap-4 ${currentPlan === 'free' && !ent.isFounding ? 'border-slate-500/40 ring-1 ring-slate-500/20' : cardBg}`}>
            {currentPlan === 'free' && !ent.isFounding && (
              <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                Your Plan
              </div>
            )}
            <div className="relative flex items-start gap-3">
              <div className={`p-2 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Shield size={20} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${textPrimary}`}>Free</h3>
                <p className={`text-xs mt-0.5 ${textSecondary}`}>Always free, always available</p>
              </div>
            </div>
            <div>
              <span className={`text-2xl font-black ${textPrimary}`}>
                {region === 'local' ? '0 XAF' : '$0'}
              </span>
              <span className={`text-sm ml-1 ${textSecondary}`}>/month</span>
            </div>
            <ul className="space-y-2 flex-1">
              {['Browse all sheets', 'Full PDF preview', '3 downloads/month', 'Collections & favourites'].map(h => (
                <li key={h} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                  <span className={textSecondary}>{h}</span>
                </li>
              ))}
            </ul>
            <div className={`text-center text-xs py-2 rounded-xl ${darkMode ? 'text-slate-600 bg-slate-800' : 'text-slate-400 bg-slate-100'}`}>
              {currentPlan === 'free' && !ent.isFounding ? 'Current plan' : 'No upgrade needed'}
            </div>
          </div>

          {/* Paid plans */}
          {planConfig.map(cfg => (
            <PlanCard
              key={cfg.plan}
              {...cfg}
              region={region}
              isCurrent={
                cfg.hasBillingToggle
                  ? (currentPlan === 'maestro_monthly' || currentPlan === 'maestro_yearly') && !ent.isFounding
                  : currentPlan === cfg.plan && !ent.isFounding
              }
              onUpgrade={handleUpgrade}
              loading={checkoutLoading === cfg.plan || checkoutLoading === cfg.altPlan}
              darkMode={darkMode}
              billingActive={ent.billingActive}
              entLoaded={ent.loaded}
              billingPeriod={cfg.hasBillingToggle ? maestroBilling : undefined}
              onBillingPeriodChange={cfg.hasBillingToggle ? setMaestroBilling : undefined}
            />
          ))}
        </div>

        {paymentWindowOpen && (
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 mt-4 text-sm font-medium ${darkMode ? 'bg-amber-950/30 border-amber-700/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span>Payment opened in a new tab — complete it there, then return here. Your plan updates automatically.</span>
            <button onClick={() => setPaymentWindowOpen(false)} className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X size={16} />
            </button>
          </div>
        )}
        {checkoutError && (
          <p className="text-center text-sm text-red-500 mt-4">{checkoutError}</p>
        )}
      </div>

      {/* ── Founding Member special offer ────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 md:p-8 ${darkMode ? 'bg-amber-950/20 border-amber-800/40' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Crown size={20} className="text-amber-500" />
              <span className="text-amber-500 font-bold text-sm uppercase tracking-wider">Founding Member</span>
            </div>
            <h2 className={`text-2xl font-serif font-bold ${textPrimary}`}>
              Earn your place. Lock in forever.
            </h2>
            <p className={`text-sm leading-relaxed ${textSecondary}`}>
              The <strong className={textPrimary}>top 20 contributors</strong> by number of uploaded public
              sheets automatically earn Founding Member status — no payment required. Upload quality sheets,
              climb the leaderboard, and your spot is yours permanently.
            </p>
            <p className={`text-sm leading-relaxed ${textSecondary}`}>
              Not a top uploader yet? You can still join during our launch window at the founding rate —
              it <strong className={textPrimary}>never increases</strong>, no matter what future pricing looks like.
              Admins may also grant founding status via exclusive promo codes.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {['Top 20 uploaders earn it free', 'All Maestro features', 'Permanent Founding badge', 'Rate locked forever'].map(b => (
                <span key={b} className={`text-xs font-medium px-3 py-1 rounded-full ${darkMode ? 'bg-amber-900/40 text-amber-400 border border-amber-800/50' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div className="md:w-56 space-y-3">
            <div className={`rounded-xl p-4 text-center ${darkMode ? 'bg-amber-900/30 border border-amber-800/40' : 'bg-white border border-amber-200'}`}>
              <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                {region === 'local' ? 'Local price' : 'International'}
              </p>
              <p className="text-3xl font-black text-amber-500">
                {region === 'local' ? '3,000' : '$12'}
              </p>
              <p className={`text-sm ${textSecondary}`}>
                {region === 'local' ? 'XAF/year' : 'per year'}
              </p>
              <p className="text-xs text-amber-500 font-medium mt-1">Locked in forever</p>
            </div>

            {ent.isFounding ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <CheckCircle2 size={16} className="text-amber-500" />
                <span className="text-sm font-semibold text-amber-500">You're a Founding Member!</span>
              </div>
            ) : ent.billingActive ? (
              <button
                onClick={() => handleUpgrade('founding')}
                disabled={checkoutLoading !== null}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-95 disabled:opacity-60"
              >
                {checkoutLoading === 'founding' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {checkoutLoading === 'founding' ? 'Redirecting…' : 'Become a Founding Member'}
              </button>
            ) : (
              <a
                href="mailto:solfasanctuary@gmail.com?subject=Notify me when Founding Member launches"
                className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all border
                  ${darkMode
                    ? 'border-amber-800/60 text-amber-500 hover:border-amber-700 hover:bg-amber-950/30'
                    : 'border-amber-200 text-amber-600 hover:border-amber-300 hover:bg-amber-50'
                  }`}
              >
                <Bell size={16} />
                Get notified at launch
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Promo code redemption ────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Tag size={18} className="text-green-500" />
          <h3 className={`font-bold ${textPrimary}`}>Redeem a Promo Code</h3>
        </div>
        <p className={`text-sm mb-4 ${textSecondary}`}>
          Have a founding-member promo code? Enter it here to activate your Founding Member status.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleRedeemPromo()}
            placeholder="FOUNDING-XXXX"
            maxLength={32}
            className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-mono
              ${darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-600 focus:border-green-500'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'
              } outline-none transition-colors`}
          />
          <button
            onClick={handleRedeemPromo}
            disabled={promoLoading || !promoCode.trim()}
            className="px-5 py-2.5 bg-green-500 text-slate-950 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors hover:bg-green-400"
          >
            {promoLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            Redeem
          </button>
        </div>
        {promoResult && (
          <div className={`mt-3 flex items-center gap-2 text-sm ${promoResult.ok ? 'text-green-500' : 'text-red-400'}`}>
            {promoResult.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {promoResult.message}
          </div>
        )}
        {!currentUser && (
          <p className={`mt-3 text-xs ${textSecondary}`}>
            <button onClick={onAuthRequired} className="text-green-500 hover:underline font-medium">Sign in</button>
            {' '}to redeem a promo code.
          </p>
        )}
      </div>

      {/* ── Feature comparison table ─────────────────────────────────────────── */}
      <div>
        <h2 className={`text-xl font-serif font-bold mb-4 ${textPrimary}`}>Full Feature Comparison</h2>
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}>
                  <th className={`text-left px-4 py-3 font-semibold ${textSecondary} w-2/5`}>Feature</th>
                  <th className={`text-center px-3 py-3 font-semibold ${textSecondary}`}>Free</th>
                  <th className={`text-center px-3 py-3 font-semibold text-blue-500`}>Maestro</th>
                  <th className={`text-center px-3 py-3 font-semibold text-purple-500`}>Ensemble</th>
                  <th className={`text-center px-3 py-3 font-semibold text-amber-500`}>Founding</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row, i) => (
                  <tr key={row.label} className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'} ${i % 2 === 0 ? '' : (darkMode ? 'bg-slate-900/30' : 'bg-slate-50/50')}`}>
                    <td className={`px-4 py-3 font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{row.label}</td>
                    <td className="px-3 py-3 text-center"><FeatureCell value={row.free}     darkMode={darkMode} /></td>
                    <td className="px-3 py-3 text-center"><FeatureCell value={row.maestro}  darkMode={darkMode} /></td>
                    <td className="px-3 py-3 text-center"><FeatureCell value={row.ensemble} darkMode={darkMode} /></td>
                    <td className="px-3 py-3 text-center"><FeatureCell value={row.founding} darkMode={darkMode} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────────── */}
      <p className={`text-center text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
        All plans include a 30-day satisfaction guarantee. Payments processed securely via Moneroo.
        {' '}Questions? <a href="mailto:solfasanctuary@gmail.com" className="text-green-500 hover:underline">Contact us</a>.
      </p>
    </div>
  );
};

export default PricingPage;
