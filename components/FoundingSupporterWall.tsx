/**
 * FoundingSupporterWall
 *
 * Fetches Founding Supporters from the founding_supporters table and renders
 * a tiered wall. Renders nothing if the list is empty (pre-launch / no
 * commitments yet).
 *
 * Admins manage the list via the AdminDashboard "Founding Supporters" panel.
 */

import React, { useState, useEffect } from 'react';
import { Crown, Users, Sparkles, Heart } from 'lucide-react';
import { db } from '../supabase';
import { FOUNDING_SUPPORTER_CAP } from '../constants';

type FoundingSupporterTier = 'supporter' | 'revshare' | 'ensemble' | 'patron';

interface FoundingSupporter {
  id: string;
  name: string;
  tier: FoundingSupporterTier;
  group_name: string | null;
  message: string | null;
  committed_at: string;
}

interface FoundingSupporterWallProps {
  darkMode: boolean;
}

const TIER_ORDER: Record<FoundingSupporterTier, number> = {
  patron:    0,
  ensemble:  1,
  revshare:  2,
  supporter: 3,
};

const TIER_LABEL: Record<FoundingSupporterTier, string> = {
  patron:    'Patron',
  ensemble:  'Ensemble Patron',
  revshare:  'Founding Investor',
  supporter: 'Founding Supporter',
};

const tierIcon = (tier: FoundingSupporterTier) => {
  switch (tier) {
    case 'patron':   return <Crown    size={14} />;
    case 'ensemble': return <Users    size={14} />;
    case 'revshare': return <Sparkles size={14} />;
    case 'supporter':return <Heart    size={14} />;
  }
};

const FoundingSupporterWall: React.FC<FoundingSupporterWallProps> = ({ darkMode }) => {
  const [supporters, setSupporters] = useState<FoundingSupporter[]>([]);
  const [loaded, setLoaded]         = useState(false);

  useEffect(() => {
    let cancelled = false;
    db.from('founding_supporters')
      .select('*')
      .order('committed_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setSupporters((data ?? []) as FoundingSupporter[]);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Hide entire section until first supporter is added
  if (!loaded || supporters.length === 0) return null;

  const textPrimary   = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg        = darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const tierBg = (tier: FoundingSupporterTier) => {
    switch (tier) {
      case 'patron':   return darkMode ? 'bg-amber-900/30 border-amber-700/50 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700';
      case 'ensemble': return darkMode ? 'bg-purple-900/30 border-purple-700/50 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-700';
      case 'revshare': return darkMode ? 'bg-blue-900/30 border-blue-700/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700';
      case 'supporter':return darkMode ? 'bg-green-900/30 border-green-700/50 text-green-400' : 'bg-green-50 border-green-200 text-green-700';
    }
  };

  const sorted = [...supporters].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  const filled = supporters.length;
  const remaining = Math.max(0, FOUNDING_SUPPORTER_CAP - filled);

  return (
    <section className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles size={12} />
          Founding Supporters
        </div>
        <h2 className={`text-3xl font-serif font-bold ${textPrimary}`}>
          The people who made this possible
        </h2>
        <p className={`mt-2 text-sm ${textSecondary}`}>
          {remaining > 0
            ? `${filled} of ${FOUNDING_SUPPORTER_CAP} spots filled — ${remaining} remaining.`
            : `All ${FOUNDING_SUPPORTER_CAP} Founding Supporter spots filled. Thank you.`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((s) => (
          <div key={s.id} className={`rounded-2xl border p-4 transition-all hover:scale-[1.02] ${cardBg}`}>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${tierBg(s.tier)}`}>
              {tierIcon(s.tier)}
              {TIER_LABEL[s.tier]}
            </div>
            <p className={`mt-2 font-bold text-base break-words ${textPrimary}`}>{s.name}</p>
            {s.group_name && (
              <p className={`text-xs break-words ${textSecondary}`}>{s.group_name}</p>
            )}
            {s.message && (
              <p className={`mt-2 text-xs italic break-words ${textSecondary}`}>"{s.message}"</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default FoundingSupporterWall;
