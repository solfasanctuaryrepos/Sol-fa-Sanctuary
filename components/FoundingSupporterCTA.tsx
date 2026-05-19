/**
 * FoundingSupporterCTA
 *
 * Banner shown on the landing page during the Founding Supporter round.
 * Visible while count < FOUNDING_SUPPORTER_CAP. Dismissable per-browser
 * (localStorage flag) so returning visitors aren't nagged.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { db } from '../supabase';
import { FOUNDING_SUPPORTER_CAP } from '../constants';

interface FoundingSupporterCTAProps {
  darkMode: boolean;
}

const DISMISS_KEY = 'solfa_fs_cta_dismissed';

const FoundingSupporterCTA: React.FC<FoundingSupporterCTAProps> = ({ darkMode }) => {
  const [count, setCount]       = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (dismissed) return;
    db.from('founding_supporters')
      .select('id', { count: 'exact', head: true })
      .then(({ count: c }) => setCount(c ?? 0));
  }, [dismissed]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };

  if (dismissed || count === null || count >= FOUNDING_SUPPORTER_CAP) return null;

  const remaining = FOUNDING_SUPPORTER_CAP - count;

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 relative ${darkMode ? 'bg-amber-950/30 border-amber-800/40' : 'bg-amber-50 border-amber-200'}`}>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-colors ${darkMode ? 'text-amber-600 hover:text-amber-400' : 'text-amber-600 hover:text-amber-800'}`}
      >
        <X size={14} />
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pr-8">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Sparkles size={18} className="text-amber-500" />
          </div>
          <div className="sm:hidden">
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-wider">Founding Round Open</p>
            <p className={`text-sm font-bold ${darkMode ? 'text-amber-200' : 'text-amber-900'}`}>
              {remaining} of {FOUNDING_SUPPORTER_CAP} spots left
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-amber-500 text-[10px] font-bold uppercase tracking-wider hidden sm:block">Founding Round Open</p>
          <p className={`text-sm sm:text-base font-bold ${darkMode ? 'text-amber-200' : 'text-amber-900'} hidden sm:block`}>
            {remaining} of {FOUNDING_SUPPORTER_CAP} Founding Supporter spots remaining
          </p>
          <p className={`text-xs sm:text-sm ${darkMode ? 'text-amber-400/80' : 'text-amber-800/80'}`}>
            Back the launch from 10,000 XAF (~$17). Lifetime perks, revenue share on bigger tiers. Closes when full.
          </p>
        </div>

        <a
          href="mailto:vitalisnkwenti@gmail.com?subject=Founding%20Supporter%20-%20Sol-fa%20Sanctuary&body=Hi%20Vitalis%2C%0A%0AI%27d%20like%20to%20become%20a%20Founding%20Supporter.%20My%20tier%20choice%3A%20%5B10k%20%2F%2015k%20%2F%2025k%20%2F%2050k%5D%0A%0AThanks%21"
          className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition-all active:scale-95"
        >
          Become a Supporter
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
};

export default FoundingSupporterCTA;
