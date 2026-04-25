
import React, { useState } from 'react';
import { Heart, X, Loader2, ExternalLink, CheckCircle } from 'lucide-react';

interface DonateModalProps {
  darkMode: boolean;
  onClose: () => void;
  currentUserEmail?: string;
}

type Currency = 'USD' | 'XAF';

interface PresetAmount {
  value: number;
  label: string;
}

const PRESETS: Record<Currency, PresetAmount[]> = {
  USD: [
    { value: 2,  label: '$2'  },
    { value: 5,  label: '$5'  },
    { value: 10, label: '$10' },
  ],
  XAF: [
    { value: 1000, label: '1,000 XAF' },
    { value: 2500, label: '2,500 XAF' },
    { value: 5000, label: '5,000 XAF' },
  ],
};

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  XAF: 'XAF ',
};

// Moneroo uses the smallest currency unit.
// USD → cents (× 100). XAF has no subunit (× 1).
const toSmallestUnit = (amount: number, currency: Currency) =>
  currency === 'USD' ? Math.round(amount * 100) : Math.round(amount);

const MONEROO_PUBLIC_KEY = import.meta.env.VITE_MONEROO_KEY as string | undefined;

const DonateModal: React.FC<DonateModalProps> = ({ darkMode, onClose, currentUserEmail }) => {
  const [currency, setCurrency]     = useState<Currency>('USD');
  const [selected, setSelected]     = useState<number | null>(5);
  const [custom, setCustom]         = useState('');
  const [email, setEmail]           = useState(currentUserEmail ?? '');
  const [name, setName]             = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const effectiveAmount =
    selected !== null ? selected : parseFloat(custom) || 0;

  const handleCurrencyChange = (c: Currency) => {
    setCurrency(c);
    // Reset to first preset of the new currency to avoid mis-typed amounts
    setSelected(PRESETS[c][0].value);
    setCustom('');
  };

  const handlePresetClick = (value: number) => {
    setSelected(value);
    setCustom('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null);
    setCustom(e.target.value);
  };

  const handleDonate = async () => {
    setError(null);

    if (!MONEROO_PUBLIC_KEY) {
      setError('Payment gateway not configured. Please contact the admin.');
      return;
    }

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (effectiveAmount <= 0) {
      setError('Please select or enter a donation amount.');
      return;
    }

    // Minimum: $0.50 USD / 250 XAF
    const minAmount = currency === 'USD' ? 0.5 : 250;
    if (effectiveAmount < minAmount) {
      setError(
        `Minimum donation is ${currency === 'USD' ? '$0.50' : '250 XAF'}.`
      );
      return;
    }

    setLoading(true);

    try {
      const firstName = name.trim().split(' ')[0] || 'Supporter';
      const lastName  = name.trim().split(' ').slice(1).join(' ') || '';

      const payload = {
        amount:      toSmallestUnit(effectiveAmount, currency),
        currency,
        description: `Donation to Sol-fa Sanctuary`,
        return_url:  `${window.location.origin}?donated=true`,
        customer: {
          email:      email.trim(),
          first_name: firstName,
          last_name:  lastName,
        },
        metadata: {
          source:   'sol-fa-sanctuary',
          type:     'one-time-donation',
          currency,
        },
      };

      const res = await fetch('https://api.moneroo.io/v1/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MONEROO_PUBLIC_KEY}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message ?? `Payment gateway error (${res.status})`);
      }

      const checkoutUrl: string | undefined =
        json?.data?.checkout_url ?? json?.checkout_url;

      if (!checkoutUrl) {
        throw new Error('No checkout URL returned. Please try again.');
      }

      // Redirect to Moneroo hosted checkout
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // ─── styles ───────────────────────────────────────────────────────────────
  const overlay  = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4';
  const card     = `relative w-full max-w-md rounded-2xl shadow-2xl p-6 ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200'}`;
  const label    = `text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`;
  const input    = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-green-500/50 transition-all ${
    darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600'
      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
  }`;
  const tab = (active: boolean) =>
    `flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
      active
        ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
        : darkMode
          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
    }`;
  const presetBtn = (active: boolean) =>
    `flex-1 py-3 rounded-xl text-sm font-bold transition-all border-2 ${
      active
        ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20'
        : darkMode
          ? 'border-slate-700 text-slate-300 hover:border-green-500/50 hover:text-green-400'
          : 'border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-600'
    }`;

  return (
    <div className={overlay} onClick={onClose}>
      <div className={card} onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Heart size={20} className="text-green-500 fill-green-500" />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              Support Sol-fa Sanctuary
            </h2>
            <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Your gift keeps the music free for everyone
            </p>
          </div>
        </div>

        {/* Currency tabs */}
        <div className="mb-5">
          <p className={label}>Currency</p>
          <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
            {(['USD', 'XAF'] as Currency[]).map(c => (
              <button key={c} className={tab(currency === c)} onClick={() => handleCurrencyChange(c)}>
                {c === 'USD' ? '🇺🇸 USD' : '🇨🇲 XAF'}
              </button>
            ))}
          </div>
        </div>

        {/* Preset amounts */}
        <div className="mb-4">
          <p className={label}>Amount</p>
          <div className="flex gap-2">
            {PRESETS[currency].map(({ value, label: lbl }) => (
              <button
                key={value}
                className={presetBtn(selected === value)}
                onClick={() => handlePresetClick(value)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div className="mb-5">
          <p className={label}>Or enter a custom amount</p>
          <div className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {CURRENCY_SYMBOL[currency]}
            </span>
            <input
              type="number"
              min="0"
              step={currency === 'USD' ? '0.01' : '100'}
              placeholder={currency === 'USD' ? '0.00' : '0'}
              value={custom}
              onChange={handleCustomChange}
              className={`${input} pl-10`}
            />
          </div>
        </div>

        {/* Email */}
        <div className="mb-4">
          <p className={label}>Your email (for receipt)</p>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={input}
          />
        </div>

        {/* Name (optional) */}
        <div className="mb-5">
          <p className={label}>Name (optional)</p>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            className={input}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleDonate}
          disabled={loading || effectiveAmount <= 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-95"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <Heart size={18} className="fill-white" />
              Donate{' '}
              {effectiveAmount > 0
                ? `${CURRENCY_SYMBOL[currency]}${currency === 'USD' ? effectiveAmount.toFixed(2) : effectiveAmount.toLocaleString()}`
                : ''}
            </>
          )}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <ExternalLink size={12} className={darkMode ? 'text-slate-600' : 'text-slate-400'} />
          <p className={`text-xs text-center ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
            Secure payment via Moneroo.io · Redirects to hosted checkout
          </p>
        </div>

        {/* Impact message */}
        <div className={`mt-4 p-3 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-green-50'}`}>
          <p className={`text-xs text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            💚 Every contribution covers server costs and keeps sheet music free for choirs, students, and worship teams worldwide.
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Thank-you banner shown after returning from Moneroo checkout ──────────────
export const DonateThankyouBanner: React.FC<{ darkMode: boolean; onDismiss: () => void }> = ({
  darkMode,
  onDismiss,
}) => (
  <div
    className={`fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border animate-in fade-in slide-in-from-top-4 duration-500 ${
      darkMode
        ? 'bg-slate-900 border-green-500/30 text-slate-100'
        : 'bg-white border-green-400/40 text-slate-800'
    }`}
  >
    <CheckCircle size={20} className="text-green-500 shrink-0" />
    <span className="text-sm font-medium">
      Thank you for your donation — you're keeping music free! 🎵
    </span>
    <button
      onClick={onDismiss}
      className={`ml-2 p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}
    >
      <X size={14} />
    </button>
  </div>
);

export default DonateModal;
