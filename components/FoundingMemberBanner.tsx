/**
 * FoundingMemberBanner
 *
 * A dismissible top-of-page banner shown during the founding-member window
 * (first 30 days after billing becomes active, and billing_active = true).
 *
 * Reads from EntitlementsContext so it automatically disappears once the user
 * becomes a Founding Member or the billing system isn't active yet.
 *
 * Dismiss is persisted to localStorage with a 24-hour cooldown so it doesn't
 * reappear on every page load — unless the window is about to close (< 3 days).
 */

import React, { useState, useEffect } from 'react';
import { Crown, X, Sparkles } from 'lucide-react';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';
import { db } from '../supabase';

const DISMISS_KEY = 'solfa-founding-banner-dismissed-at';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FoundingMemberBannerProps {
  darkMode: boolean;
  onOpenPricing: () => void;
}

const FoundingMemberBanner: React.FC<FoundingMemberBannerProps> = ({ darkMode, onOpenPricing }) => {
  const ent = useEntitlementsContext();
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!ent.loaded || !ent.billingActive || ent.isFounding) return;

    // Fetch founding_window_closes_at from billing_config
    const check = async () => {
      const { data } = await db
        .from('billing_config')
        .select('founding_window_closes_at')
        .eq('id', 1)
        .single();

      if (!data?.founding_window_closes_at) return;

      const windowEnd = new Date(data.founding_window_closes_at);
      const now       = new Date();

      if (now >= windowEnd) return; // founding window closed

      const remaining = Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      setDaysLeft(remaining);

      // Check dismiss cooldown (ignore cooldown if < 3 days left — urgency)
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      const cooldownOver = Date.now() - dismissedAt > DISMISS_COOLDOWN_MS;

      if (cooldownOver || remaining <= 3) {
        setVisible(true);
      }
    };

    check();
  }, [ent.loaded, ent.billingActive, ent.isFounding]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  const urgent = (daysLeft ?? 99) <= 3;

  return (
    <div className={`relative overflow-hidden animate-in slide-in-from-top-2 duration-300
      ${urgent
        ? 'bg-amber-500 text-slate-950'
        : (darkMode ? 'bg-amber-950/60 border-b border-amber-800/50 text-amber-300' : 'bg-amber-50 border-b border-amber-200 text-amber-800')
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crown size={16} className={urgent ? 'text-slate-950 shrink-0' : 'text-amber-500 shrink-0'} />
          <p className="text-sm font-semibold truncate">
            {urgent
              ? `⚡ Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} left — Founding Member rate closes soon!`
              : `Founding Member window is open${daysLeft !== null ? ` — ${daysLeft} days left` : ''}. Lock in your rate forever.`
            }
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenPricing}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors
              ${urgent
                ? 'bg-slate-950/20 hover:bg-slate-950/30 text-slate-950'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
          >
            <Sparkles size={12} />
            See offer
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className={`p-1 rounded transition-opacity hover:opacity-70
              ${urgent ? 'text-slate-950' : (darkMode ? 'text-amber-400' : 'text-amber-700')}`}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FoundingMemberBanner;
