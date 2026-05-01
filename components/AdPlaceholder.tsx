/**
 * AdPlaceholder
 *
 * Shown to free-tier users when billing is active (ent.showAds === true).
 * In pre-launch / billing-inactive mode this component renders nothing.
 *
 * Currently renders a tasteful "Support Sol-fa Sanctuary" CTA rather than
 * actual ads — swap out the inner content when a real ad network is integrated.
 *
 * Sizes:
 *   'banner'  — 728×90 leaderboard equivalent (full-width horizontal strip)
 *   'sidebar' — 300×250 medium rectangle equivalent (stacked in a sidebar)
 *   'inline'  — compact horizontal card for between-content slots
 */

import React from 'react';
import { Zap, Heart } from 'lucide-react';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';

type AdSize = 'banner' | 'sidebar' | 'inline';

interface AdPlaceholderProps {
  size?: AdSize;
  darkMode: boolean;
  onUpgrade?: () => void;
}

const AdPlaceholder: React.FC<AdPlaceholderProps> = ({
  size = 'banner',
  darkMode,
  onUpgrade,
}) => {
  const ent = useEntitlementsContext();

  // Only show when billing is active AND user is on free tier
  if (!ent.loaded || !ent.billingActive || !ent.showAds) return null;

  const containerClass = {
    banner:  'w-full py-3 px-4 min-h-[64px]',
    sidebar: 'w-full p-4 min-h-[180px]',
    inline:  'w-full py-2.5 px-4 min-h-[52px]',
  }[size];

  const isVertical = size === 'sidebar';

  return (
    <div
      className={`relative rounded-xl border flex ${isVertical ? 'flex-col items-center text-center gap-3 justify-center' : 'items-center gap-3'} ${containerClass}
        ${darkMode
          ? 'bg-slate-900/60 border-slate-800 text-slate-500'
          : 'bg-slate-50 border-slate-200 text-slate-400'
        }`}
      aria-label="Advertisement placeholder"
    >
      {/* "Ad" label */}
      <div className={`absolute top-1.5 ${isVertical ? 'left-1/2 -translate-x-1/2' : 'right-2'} text-[10px] font-bold uppercase tracking-widest opacity-40`}>
        Ad
      </div>

      {/* Icon */}
      <div className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <Heart size={size === 'banner' ? 18 : 22} className="text-rose-400" />
      </div>

      {/* Copy */}
      <div className={`flex-1 ${isVertical ? 'space-y-1' : ''}`}>
        <p className={`font-semibold text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          {size === 'inline' ? 'Support Sol-fa Sanctuary' : 'Enjoying Sol-fa Sanctuary?'}
        </p>
        {size !== 'inline' && (
          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Upgrade to remove ads and unlock offline viewing, unlimited downloads, and more.
          </p>
        )}
      </div>

      {/* CTA */}
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-slate-950 hover:bg-green-400 active:scale-95 transition-all ${isVertical ? 'mt-1 w-full justify-center' : ''}`}
        >
          <Zap size={11} />
          Upgrade
        </button>
      )}
    </div>
  );
};

export default AdPlaceholder;
