/**
 * BillingAdminPage
 *
 * Admin-only page for monitoring and managing the billing system.
 * Accessible at #billing-admin from the admin account only.
 *
 * Features:
 *   - Billing status toggle (billing_config.billing_active)
 *   - Quality-sheet progress toward activation threshold
 *   - Plan distribution overview
 *   - Manual founding-member assignment by email/user-id
 *   - Promo code creation and management
 *   - Recent paid subscribers table
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ToggleLeft, ToggleRight, Crown, Users, Zap, Tag, Plus, CheckCircle2,
  XCircle, Loader2, RefreshCw, Shield, TrendingUp, AlertTriangle,
  Copy, ChevronDown, ChevronUp, Calendar, X,
} from 'lucide-react';
import { db, supabase } from '../supabase';

interface BillingAdminPageProps {
  darkMode: boolean;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface BillingConfig {
  billing_active: boolean;
  quality_sheet_threshold: number;
  billing_activated_at: string | null;
  founding_window_closes_at: string | null;
}

interface PlanStat {
  plan: string;
  count: number;
}

interface PromoCode {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface RecentSubscriber {
  id: string;
  email: string;
  display_name: string | null;
  plan: string;
  plan_expires_at: string | null;
  is_founding_member: boolean;
  moneroo_payment_id: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function planLabel(plan: string): string {
  return plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function planColor(plan: string): string {
  const m: Record<string, string> = {
    free: 'text-slate-400',
    maestro_monthly: 'text-blue-400',
    maestro_yearly: 'text-green-400',
    ensemble: 'text-purple-400',
    founding: 'text-amber-400',
  };
  return m[plan] ?? 'text-slate-400';
}

function planBg(plan: string): string {
  const m: Record<string, string> = {
    free: 'bg-slate-500/10',
    maestro_monthly: 'bg-blue-500/10',
    maestro_yearly: 'bg-green-500/10',
    ensemble: 'bg-purple-500/10',
    founding: 'bg-amber-500/10',
  };
  return m[plan] ?? 'bg-slate-500/10';
}

// ── Stat card ──────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accentClass?: string;
  darkMode: boolean;
}> = ({ icon, label, value, sub, accentClass = 'text-green-500', darkMode }) => (
  <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <span className={accentClass}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{label}</p>
        <p className={`text-2xl font-black ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
        {sub && <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
      </div>
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
const BillingAdminPage: React.FC<BillingAdminPageProps> = ({ darkMode }) => {
  const [config, setConfig]               = useState<BillingConfig | null>(null);
  const [qualityCount, setQualityCount]   = useState<number>(0);
  const [planStats, setPlanStats]         = useState<PlanStat[]>([]);
  const [promoCodes, setPromoCodes]       = useState<PromoCode[]>([]);
  const [subscribers, setSubscribers]     = useState<RecentSubscriber[]>([]);
  const [totalUsers, setTotalUsers]       = useState<number>(0);
  const [loading, setLoading]             = useState(true);
  const [togglingBilling, setTogglingBilling] = useState(false);
  const [refreshing, setRefreshing]       = useState(false);

  // Promo creation
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoMaxUses, setPromoMaxUses]   = useState(1);
  const [promoExpiry, setPromoExpiry]     = useState('');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [promoMsg, setPromoMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied]       = useState(false);

  // Manual founding member
  const [foundingEmail, setFoundingEmail] = useState('');
  const [assigningFounding, setAssigningFounding] = useState(false);
  const [foundingMsg, setFoundingMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  // Show/hide sections
  const [showSubscribers, setShowSubscribers] = useState(false);

  const textPrimary   = darkMode ? 'text-slate-100'  : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400'  : 'text-slate-600';
  const cardBg        = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const inputCls      = `w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
    ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-600 focus:border-green-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'}`;

  // ── Load all data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [configRes, profilesRes, promoRes, subscribersRes] = await Promise.all([
        db.from('billing_config').select('*').eq('id', 1).single(),
        db.from('profiles').select('plan'),
        db.from('promo_codes').select('*').order('created_at', { ascending: false }),
        db.from('profiles')
          .select('id, email, display_name, plan, plan_expires_at, is_founding_member, moneroo_payment_id')
          .neq('plan', 'free')
          .order('plan_expires_at', { ascending: false })
          .limit(50),
      ]);

      if (configRes.data) setConfig(configRes.data as BillingConfig);

      // Plan distribution
      if (profilesRes.data) {
        const counts: Record<string, number> = {};
        for (const p of profilesRes.data) {
          const plan = p.plan ?? 'free';
          counts[plan] = (counts[plan] ?? 0) + 1;
        }
        const sorted = Object.entries(counts)
          .map(([plan, count]) => ({ plan, count }))
          .sort((a, b) => b.count - a.count);
        setPlanStats(sorted);
        setTotalUsers(profilesRes.data.length);
      }

      if (promoRes.data) setPromoCodes(promoRes.data as PromoCode[]);
      if (subscribersRes.data) setSubscribers(subscribersRes.data as RecentSubscriber[]);

      // Quality sheet count — sheets with at least 1 view or download
      const { count } = await db.from('sheets')
        .select('id', { count: 'exact', head: true })
        .eq('is_public', true);
      setQualityCount(count ?? 0);

    } catch (err) {
      console.error('BillingAdmin load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toggle billing active ─────────────────────────────────────────────────────
  const toggleBilling = async () => {
    if (!config) return;
    const newActive = !config.billing_active;
    if (newActive && !window.confirm(
      'Activate billing? This will start enforcing plan limits and show pricing to users. Only do this at launch.'
    )) return;
    if (!newActive && !window.confirm(
      'Deactivate billing? Everyone will get full free access again.'
    )) return;

    setTogglingBilling(true);
    const now = new Date().toISOString();
    try {
      await db.from('billing_config').update({
        billing_active: newActive,
        ...(newActive && !config.billing_activated_at ? {
          billing_activated_at: now,
          founding_window_closes_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        } : {}),
      }).eq('id', 1);
      setConfig(c => c ? {
        ...c,
        billing_active: newActive,
        billing_activated_at: c.billing_activated_at ?? (newActive ? now : null),
        founding_window_closes_at: c.founding_window_closes_at ?? (newActive ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null),
      } : c);
    } finally {
      setTogglingBilling(false);
    }
  };

  // ── Update quality threshold ──────────────────────────────────────────────────
  const updateThreshold = async (newVal: number) => {
    await db.from('billing_config').update({ quality_sheet_threshold: newVal }).eq('id', 1);
    setConfig(c => c ? { ...c, quality_sheet_threshold: newVal } : c);
  };

  // ── Generate a random promo code ─────────────────────────────────────────────
  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
    const segment = (len: number) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setPromoCodeInput(`FOUNDING-${segment(4)}-${segment(4)}`);
  };

  // ── Create promo code ─────────────────────────────────────────────────────────
  const createPromo = async () => {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code) return;
    setCreatingPromo(true);
    setPromoMsg(null);
    setLastCreatedCode(null);
    try {
      const { error } = await db.from('promo_codes').insert({
        code,
        type:         'founding',
        max_uses:     promoMaxUses,
        current_uses: 0,
        is_active:    true,
        expires_at:   promoExpiry || null,
      });
      if (error) throw error;
      setLastCreatedCode(code);
      setPromoMsg({ ok: true, text: 'Code created — copy it below before closing.' });
      setPromoCodeInput('');
      setPromoMaxUses(1);
      setPromoExpiry('');
      loadData();
    } catch (err: any) {
      setPromoMsg({ ok: false, text: err.message ?? 'Failed to create promo code.' });
    } finally {
      setCreatingPromo(false);
    }
  };

  // ── Copy code to clipboard ────────────────────────────────────────────────────
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ── Deactivate promo code ─────────────────────────────────────────────────────
  const deactivatePromo = async (id: string) => {
    await db.from('promo_codes').update({ is_active: false }).eq('id', id);
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, is_active: false } : p));
  };

  // ── Assign founding member ────────────────────────────────────────────────────
  const assignFoundingMember = async () => {
    if (!foundingEmail.trim()) return;
    setAssigningFounding(true);
    setFoundingMsg(null);

    try {
      // Look up user by email
      const { data: profile, error } = await db
        .from('profiles')
        .select('id, email')
        .eq('email', foundingEmail.trim().toLowerCase())
        .single();

      if (error || !profile) {
        setFoundingMsg({ ok: false, text: 'User not found with that email.' });
        return;
      }

      const { error: updateErr } = await db.from('profiles').update({
        is_founding_member:  true,
        plan:                'founding',
        plan_expires_at:     null,   // founding membership never expires
        founding_promo_code: 'ADMIN_ASSIGNED',
      }).eq('id', profile.id);

      if (updateErr) throw updateErr;

      setFoundingMsg({ ok: true, text: `Founding Member status assigned to ${profile.email}.` });
      setFoundingEmail('');
      loadData();
    } catch (err: any) {
      setFoundingMsg({ ok: false, text: err.message ?? 'Assignment failed.' });
    } finally {
      setAssigningFounding(false);
    }
  };

  // ── Paid user count ───────────────────────────────────────────────────────────
  const paidCount = planStats.filter(s => s.plan !== 'free').reduce((sum, s) => sum + s.count, 0);
  const foundingCount = planStats.find(s => s.plan === 'founding')?.count ?? 0;
  const threshold = config?.quality_sheet_threshold ?? 300;
  const progress = Math.min(100, Math.round((qualityCount / threshold) * 100));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-6 pb-16 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Billing Admin</h1>
          <p className={`text-sm mt-1 ${textSecondary}`}>Monitor revenue, manage plans, and control launch settings.</p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors
            ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Billing Status ───────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${config?.billing_active ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
              <h2 className={`font-bold text-lg ${textPrimary}`}>
                Billing is {config?.billing_active ? 'ACTIVE' : 'INACTIVE'}
              </h2>
            </div>
            {config?.billing_active ? (
              <p className={`text-sm ${textSecondary}`}>
                Plans enforced · Free-tier limits apply · Activated{' '}
                {config.billing_activated_at ? new Date(config.billing_activated_at).toLocaleDateString() : '—'}
              </p>
            ) : (
              <p className={`text-sm ${textSecondary}`}>
                Everyone has free full access. Plans exist but are not enforced.
              </p>
            )}
          </div>
          <button
            onClick={toggleBilling}
            disabled={togglingBilling}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
              ${config?.billing_active
                ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                : 'bg-green-500 text-slate-950 hover:bg-green-400'}`}
          >
            {togglingBilling ? (
              <Loader2 size={16} className="animate-spin" />
            ) : config?.billing_active ? (
              <ToggleRight size={18} />
            ) : (
              <ToggleLeft size={18} />
            )}
            {config?.billing_active ? 'Deactivate Billing' : 'Activate Billing'}
          </button>
        </div>
      </div>

      {/* ── Quality Sheet Progress ────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className={`font-bold ${textPrimary}`}>Quality Sheet Progress</h2>
            <p className={`text-sm mt-0.5 ${textSecondary}`}>
              Auto-billing activates when the library reaches the threshold.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${textSecondary}`}>Threshold:</span>
            <input
              type="number"
              value={threshold}
              min={1}
              onChange={e => updateThreshold(Number(e.target.value))}
              className={`w-20 px-2 py-1 text-sm rounded-lg border text-center outline-none
                ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
            />
          </div>
        </div>

        <div className="flex items-end gap-3 mb-2">
          <span className={`text-4xl font-black ${textPrimary}`}>{qualityCount}</span>
          <span className={`text-lg mb-1 ${textSecondary}`}>/ {threshold} sheets</span>
          <span className={`text-sm mb-1.5 font-semibold ${progress >= 100 ? 'text-green-500' : 'text-amber-500'}`}>
            {progress}%
          </span>
        </div>

        <div className={`w-full rounded-full h-3 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        {progress >= 100 && !config?.billing_active && (
          <p className="mt-2 text-sm text-green-500 font-medium flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Threshold reached — billing can now be activated manually above.
          </p>
        )}
      </div>

      {/* ── Stats grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users size={18} />} label="Total Users" value={totalUsers} darkMode={darkMode} />
        <StatCard icon={<Zap size={18} />} label="Paid Subscribers" value={paidCount}
          sub={totalUsers ? `${Math.round((paidCount / totalUsers) * 100)}% conversion` : undefined}
          accentClass="text-blue-400" darkMode={darkMode} />
        <StatCard icon={<Crown size={18} />} label="Founding Members" value={foundingCount}
          accentClass="text-amber-400" darkMode={darkMode} />
        <StatCard icon={<TrendingUp size={18} />} label="Active Plans" value={paidCount}
          sub={config?.billing_active ? 'Billing active' : 'Billing inactive'}
          accentClass="text-green-500" darkMode={darkMode} />
      </div>

      {/* ── Plan Distribution ─────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <h2 className={`font-bold mb-4 ${textPrimary}`}>Plan Distribution</h2>
        <div className="space-y-3">
          {planStats.length === 0 ? (
            <p className={`text-sm ${textSecondary}`}>No user data yet.</p>
          ) : planStats.map(({ plan, count }) => {
            const pct = totalUsers ? Math.round((count / totalUsers) * 100) : 0;
            return (
              <div key={plan} className="flex items-center gap-3">
                <span className={`text-xs font-semibold w-28 shrink-0 ${planColor(plan)}`}>{planLabel(plan)}</span>
                <div className={`flex-1 rounded-full h-2 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <div className={`h-full rounded-full ${planBg(plan).replace('/10', '/60')}`}
                    style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
                <span className={`text-xs font-bold w-12 text-right ${textSecondary}`}>{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Manual Founding Member Assignment ────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Crown size={18} className="text-amber-500" />
          <h2 className={`font-bold ${textPrimary}`}>Assign Founding Member</h2>
        </div>
        <p className={`text-sm mb-4 ${textSecondary}`}>
          Manually grant founding member status to a user by their account email.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={foundingEmail}
            onChange={e => setFoundingEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && assignFoundingMember()}
            placeholder="user@example.com"
            className={inputCls + ' flex-1'}
          />
          <button
            onClick={assignFoundingMember}
            disabled={assigningFounding || !foundingEmail.trim()}
            className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 hover:bg-amber-400 transition-colors shrink-0"
          >
            {assigningFounding ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
            Assign
          </button>
        </div>
        {foundingMsg && (
          <p className={`mt-2 text-sm flex items-center gap-1.5 ${foundingMsg.ok ? 'text-green-500' : 'text-red-400'}`}>
            {foundingMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {foundingMsg.text}
          </p>
        )}
      </div>

      {/* ── Promo Code Management ────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${cardBg}`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-green-500" />
            <h2 className={`font-bold ${textPrimary}`}>Promo Codes</h2>
          </div>
          <button
            onClick={() => { setShowPromoForm(!showPromoForm); setPromoMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-slate-950 rounded-xl text-sm font-bold hover:bg-green-400 transition-colors"
          >
            <Plus size={14} /> New Code
          </button>
        </div>

        {/* Last created code — prominent copy banner */}
        {lastCreatedCode && (
          <div className={`mb-5 p-4 rounded-xl border flex items-center gap-3 flex-wrap ${darkMode ? 'bg-green-950/30 border-green-800/50' : 'bg-green-50 border-green-200'}`}>
            <CheckCircle2 size={16} className="text-green-500 shrink-0" />
            <span className={`text-sm font-medium ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Code created:</span>
            <code className={`font-mono font-bold text-base tracking-wider flex-1 ${darkMode ? 'text-green-400' : 'text-green-800'}`}>
              {lastCreatedCode}
            </code>
            <button
              onClick={() => copyCode(lastCreatedCode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0
                ${codeCopied
                  ? 'bg-green-500 text-slate-950'
                  : (darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50')}`}
            >
              <Copy size={12} />
              {codeCopied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => setLastCreatedCode(null)} className={`p-1 rounded-lg ${darkMode ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Create form */}
        {showPromoForm && (
          <div className={`mb-5 p-4 rounded-xl border space-y-3 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Code *</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={e => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="FOUNDING-XXXX-XXXX"
                    maxLength={32}
                    className={inputCls + ' font-mono flex-1 min-w-0'}
                  />
                  <button
                    type="button"
                    onClick={generateCode}
                    title="Auto-generate code"
                    className={`px-2.5 rounded-xl border text-xs font-bold shrink-0 transition-colors
                      ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Generate
                  </button>
                </div>
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Max uses</label>
                <input
                  type="number"
                  min={1}
                  value={promoMaxUses}
                  onChange={e => setPromoMaxUses(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Expires (optional)</label>
                <input
                  type="date"
                  value={promoExpiry}
                  onChange={e => setPromoExpiry(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={createPromo}
                disabled={creatingPromo || !promoCodeInput.trim()}
                className="px-4 py-2 bg-green-500 text-slate-950 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-green-400 transition-colors"
              >
                {creatingPromo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Code
              </button>
              <button
                type="button"
                onClick={() => { generateCode(); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors
                  ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                <RefreshCw size={14} />
                Re-generate
              </button>
              <button onClick={() => { setShowPromoForm(false); setPromoMsg(null); }} className={`px-3 py-2 rounded-xl text-sm ${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'}`}>
                Cancel
              </button>
            </div>
            {promoMsg && (
              <p className={`text-sm flex items-center gap-1.5 ${promoMsg.ok ? 'text-green-500' : 'text-red-400'}`}>
                {promoMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {promoMsg.text}
              </p>
            )}
          </div>
        )}

        {/* Code list */}
        {promoCodes.length === 0 ? (
          <p className={`text-sm ${textSecondary}`}>No promo codes yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {promoCodes.map(code => (
              <div key={code.id} className={`flex items-center gap-3 p-3 rounded-xl flex-wrap ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
                <code className={`font-mono text-sm font-bold flex-1 min-w-0 truncate ${code.is_active ? (darkMode ? 'text-green-400' : 'text-green-700') : (darkMode ? 'text-slate-600 line-through' : 'text-slate-400 line-through')}`}>
                  {code.code}
                </code>
                <span className={`text-xs shrink-0 ${textSecondary}`}>{code.current_uses}/{code.max_uses} uses</span>
                {code.expires_at && (
                  <span className={`text-xs hidden sm:inline shrink-0 ${textSecondary}`}>
                    exp. {new Date(code.expires_at).toLocaleDateString()}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${code.is_active ? 'bg-green-500/10 text-green-500' : (darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400')}`}>
                  {code.is_active ? 'Active' : 'Inactive'}
                </span>
                {code.is_active && (
                  <>
                    <button
                      onClick={() => copyCode(code.code)}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                      title="Copy code"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => deactivatePromo(code.id)}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-500'}`}
                      title="Deactivate"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Paid Subscribers ───────────────────────────────────────────── */}
      <div className={`rounded-2xl border ${cardBg}`}>
        <button
          onClick={() => setShowSubscribers(!showSubscribers)}
          className={`w-full flex items-center justify-between p-6 text-left`}
        >
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-blue-400" />
            <h2 className={`font-bold ${textPrimary}`}>Paid Subscribers ({paidCount})</h2>
          </div>
          {showSubscribers ? <ChevronUp size={18} className={textSecondary} /> : <ChevronDown size={18} className={textSecondary} />}
        </button>

        {showSubscribers && (
          <div className="border-t px-6 pb-6 overflow-x-auto" style={{ borderColor: darkMode ? 'rgb(30,41,59)' : 'rgb(226,232,240)' }}>
            {subscribers.length === 0 ? (
              <p className={`text-sm py-4 ${textSecondary}`}>No paid subscribers yet.</p>
            ) : (
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className={`text-xs font-semibold ${textSecondary}`}>
                    <th className="text-left pb-2">User</th>
                    <th className="text-left pb-2">Plan</th>
                    <th className="text-left pb-2 hidden sm:table-cell">Expires</th>
                    <th className="text-left pb-2 hidden md:table-cell">Payment ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: darkMode ? 'rgb(30,41,59)' : 'rgb(241,245,249)' }}>
                  {subscribers.map(s => (
                    <tr key={s.id}>
                      <td className={`py-2.5 pr-4 ${textPrimary}`}>
                        <div className="font-medium">{s.display_name ?? s.email.split('@')[0]}</div>
                        <div className={`text-xs ${textSecondary}`}>{s.email}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${planBg(s.plan)} ${planColor(s.plan)}`}>
                          {s.is_founding_member && <Crown size={10} />}
                          {planLabel(s.plan)}
                        </span>
                      </td>
                      <td className={`py-2.5 pr-4 text-xs hidden sm:table-cell ${textSecondary}`}>
                        {s.plan_expires_at ? new Date(s.plan_expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className={`py-2.5 text-xs hidden md:table-cell font-mono ${textSecondary}`}>
                        {s.moneroo_payment_id ? s.moneroo_payment_id.slice(0, 16) + '…' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default BillingAdminPage;
