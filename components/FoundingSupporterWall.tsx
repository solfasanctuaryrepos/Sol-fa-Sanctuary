/**
 * FoundingSupporterWall
 *
 * Lists the people who funded the year-one launch of Sol-fa Sanctuary.
 * Source: FOUNDING_SUPPORTERS in ../constants.ts — update that array as
 * supporters confirm.
 *
 * Tiers are styled distinctly. Patrons appear first and large.
 */

import React from 'react';
import { Crown, Users, Sparkles, Heart } from 'lucide-react';
import { FOUNDING_SUPPORTERS, FOUNDING_SUPPORTER_CAP, FoundingSupporter, FoundingSupporterTier } from '../constants';

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

  // Sort: patron → ensemble → revshare → supporter, preserve commitment order within tier
  const sorted = [...FOUNDING_SUPPORTERS].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  const filled = FOUNDING_SUPPORTERS.length;
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
          {filled === 0
            ? `Be one of the first ${FOUNDING_SUPPORTER_CAP} people to back Sol-fa Sanctuary.`
            : remaining > 0
              ? `${filled} of ${FOUNDING_SUPPORTER_CAP} spots filled — ${remaining} remaining.`
              : `All ${FOUNDING_SUPPORTER_CAP} Founding Supporter spots filled. Thank you.`}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center ${cardBg}`}>
          <p className={`text-sm ${textSecondary}`}>
            Founding Supporters will be listed here as they join the round.
          </p>
          <a
            href="mailto:vitalisnkwenti@gmail.com?subject=Founding%20Supporter%20-%20Sol-fa%20Sanctuary"
            className={`inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/10`}
          >
            <Heart size={16} />
            Become a Founding Supporter
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((s, i) => (
            <SupporterCard key={`${s.name}-${i}`} supporter={s} darkMode={darkMode} tierBg={tierBg(s.tier)} icon={tierIcon(s.tier)} label={TIER_LABEL[s.tier]} />
          ))}
        </div>
      )}
    </section>
  );
};

interface SupporterCardProps {
  supporter: FoundingSupporter;
  darkMode: boolean;
  tierBg: string;
  icon: React.ReactNode;
  label: string;
}

const SupporterCard: React.FC<SupporterCardProps> = ({ supporter, darkMode, tierBg, icon, label }) => {
  const textPrimary   = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg        = darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  return (
    <div className={`rounded-2xl border p-4 transition-all hover:scale-[1.02] ${cardBg}`}>
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${tierBg}`}>
        {icon}
        {label}
      </div>
      <p className={`mt-2 font-bold text-base break-words ${textPrimary}`}>{supporter.name}</p>
      {supporter.group && (
        <p className={`text-xs break-words ${textSecondary}`}>{supporter.group}</p>
      )}
      {supporter.message && (
        <p className={`mt-2 text-xs italic break-words ${textSecondary}`}>"{supporter.message}"</p>
      )}
    </div>
  );
};

export default FoundingSupporterWall;
