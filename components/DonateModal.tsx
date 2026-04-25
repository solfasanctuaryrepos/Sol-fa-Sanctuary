
import React, { useState } from 'react';
import { Heart, X, Loader2, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

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
    { value: 1000, label: '1 000'  },
    { value: 2500, label: '2 500'  },
    { value: 5000, label: '5 000'  },
  ],
};

// Payment methods available per currency (shown as info only — Moneroo shows all on checkout).
// Codes per docs: mtn_cm, orange_cm, card_xaf, crypto_xaf | card_usd, crypto_usd
const PAYMENT_METHOD_HINTS: Record<Currency, { icon: string; label: string }[]> = {
  XAF: [
    { icon: '📱', label: 'MTN Mobile Money' },
    { icon: '📱', label: 'Orange Money' },
    { icon: '💳', label: 'Credit / Debit Card' },
    { icon: '₿',  label: 'Crypto' },
  ],
  USD: [
    { icon: '💳', label: 'Credit / Debit Card' },
    { icon: '₿',  label: 'Crypto' },
  ],
};

// Moneroo amount rules (ISO 4217):
//   USD  → 2 decimal places → send in cents    (× 100)
//   XAF  → 0 decimal places → send as-is       (× 1)
const toMonerooAmount = (amount: number, currency: Currency): number =>
  currency === 'USD' ? Math.round(amount * 100) : Math.round(amount);

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  XAF: 'XAF\u00a0',        // non-breaking space
};

const MIN_AMOUNT: Record<Currency, number> = {
  USD: 1,     // $1 minimum
  XAF: 500,   // 500 XAF minimum
};

// Public/sandbox key — safe for client-side use (pvk_ prefix = publishable/public key).
// The key can only INITIATE payment sessions; it cannot modify account or read balances.
// Swap to the live key in Coolify when going to production (remove the VITE_ prefix for
// a secret key and use a backend proxy instead).
const MONEROO_KEY = import.meta.env.VITE_MONEROO_KEY as string | undefined;

// ─────────────────────────────────────────────────────────────────────────────
const DonateModal: React.FC<DonateModalProps> = ({ darkMode, onClose, currentUserEmail }) => {
  const [currency, setCurrency] = useState<Currency>('XAF');     // XAF default (Cameroon audience)
  const [selected, setSelected] = useState<number | null>(1000); // first XAF preset
  const [custom, setCustom]     = useState('');
  const [email, setEmail]       = useState(currentUserEmail ?? '');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const effectiveAmount = selected !== null ? selected : (parseFloat(custom) || 0);

  const handleCurrencyChange = (c: Currency) => {
    setCurrency(c);
    setSelected(PRESETS[c][0].value);
    setCustom('');
    setError(null);
  };

  const handlePresetClick = (value: number) => {
    setSelected(value);
    setCustom('');
    setError(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null);
    setCustom(e.target.value);
    setError(null);
  };

  const handleDonate = async () => {
    setError(null);

    if (!MONEROO_KEY) {
      setError('Payment gateway not yet configured — please contact the admin.');
      return;
    }

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      setError('Please enter a valid email address to receive your receipt.');
      return;
    }

    if (effectiveAmount <= 0) {
      setError('Please select or enter a donation amount.');
      return;
    }

    if (effectiveAmount < MIN_AMOUNT[currency]) {
      setError(
        `Minimum donation is ${currency === 'USD'
          ? `$${MIN_AMOUNT.USD}`
          : `${MIN_AMOUNT.XAF.toLocaleString()} XAF`}.`
      );
      return;
    }

    setLoading(true);

    try {
      const parts     = name.trim().split(' ');
      const firstName = parts[0] || 'Friend';
      const lastName  = parts.slice(1).join(' ') || '.';   // Moneroo requires non-empty

      // Return URL: Moneroo appends ?paymentId=xxx&paymentStatus=success|failed|cancelled
      const returnUrl = `${window.location.origin}/?payment=return`;

      const payload = {
        amount:      toMonerooAmount(effectiveAmount, currency),
        currency,
        description: 'Donation to Sol-fa Sanctuary — keeping music free.',
        return_url:  returnUrl,
        customer: {
          email:      email.trim(),
          first_name: firstName,
          last_name:  lastName,
        },
        // Restrict to methods available for the chosen currency
        methods: currency === 'XAF'
          ? ['mtn_cm', 'orange_cm', 'card_xaf', 'crypto_xaf']
          : ['card_usd', 'crypto_usd'],
        metadata: {
          source: 'sol-fa-sanctuary',
          type:   'one-time-donation',
        },
      };

      const res = await fetch('https://api.moneroo.io/v1/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MONEROO_KEY}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        // Moneroo returns validation errors under json.errors or json.message
        const msg = json?.message ?? json?.errors ?? `Payment gateway error (HTTP ${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      const checkoutUrl: string | undefined =
        json?.data?.checkout_url ?? json?.checkout_url;

      if (!checkoutUrl) {
        throw new Error('Moneroo returned no checkout URL. Please try again.');
      }

      // Hand off to Moneroo's hosted checkout page
      window.location.href = checkoutUrl;

    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again or contact support.'
      );
      setLoading(false);
    }
  };

  // ─── Tailwind class helpers ────────────────────────────────────────────────
  const card = `relative w-full max-w-md rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] ${
    darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200'
  }`;
  const labelCls = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
    darkMode ? 'text-slate-400' : 'text-slate-500'
  }`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-green-500/40 transition-all ${
    darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600'
      : 'bg-slate-50  border-slate-200 text-slate-900 placeholder:text-slate-400'
  }`;
  const tabCls = (active: boolean) =>
    `flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
      active
        ? 'bg-green-500 text-white shadow shadow-green-500/25'
        : darkMode
          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
    }`;
  const presetCls = (active: boolean) =>
    `flex-1 py-3 rounded-xl text-sm font-bold transition-all border-2 ${
      active
        ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20'
        : darkMode
          ? 'border-slate-700 text-slate-300 hover:border-green-500/60 hover:text-green-400'
          : 'border-slate-200 text-slate-600 hover:border-green-400   hover:text-green-600'
    }`;

  const amountDisplay = effectiveAmount > 0
    ? currency === 'USD'
      ? `$${effectiveAmount.toFixed(2)}`
      : `${effectiveAmount.toLocaleString()} XAF`
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className={card} onClick={e => e.stopPropagation()}>
        <div className="p-6">
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Heart size={20} className="text-green-500 fill-green-500" />
            </div>
            <div>
              <h2 className={`text-lg font-bold leading-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                Support Sol-fa Sanctuary
              </h2>
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Your gift keeps sheet music free for everyone
              </p>
            </div>
          </div>

          {/* Currency toggle */}
          <div className="mb-5">
            <label className={labelCls}>Currency</label>
            <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {(['XAF', 'USD'] as Currency[]).map(c => (
                <button key={c} className={tabCls(currency === c)} onClick={() => handleCurrencyChange(c)}>
                  {c === 'XAF' ? '🇨🇲 XAF (FCFA)' : '🌍 USD'}
                </button>
              ))}
            </div>
          </div>

          {/* Preset amounts */}
          <div className="mb-3">
            <label className={labelCls}>Amount</label>
            <div className="flex gap-2">
              {PRESETS[currency].map(({ value, label }) => (
                <button
                  key={value}
                  className={presetCls(selected === value)}
                  onClick={() => handlePresetClick(value)}
                >
                  {currency === 'XAF' ? label : `$${label}`}
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="mb-5">
            <label className={labelCls}>Or enter a custom amount</label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {currency === 'USD' ? '$' : 'XAF'}
              </span>
              <input
                type="number"
                min={MIN_AMOUNT[currency]}
                step={currency === 'USD' ? '1' : '100'}
                placeholder={currency === 'USD' ? 'e.g. 15' : 'e.g. 3000'}
                value={custom}
                onChange={handleCustomChange}
                className={`${inputCls} pl-12`}
              />
            </div>
          </div>

          {/* Payment methods hint */}
          <div className={`mb-5 p-3 rounded-xl ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
            <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              ACCEPTED PAYMENT METHODS
            </p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHOD_HINTS[currency].map(({ icon, label }) => (
                <span
                  key={label}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {icon} {label}
                </span>
              ))}
            </div>
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className={labelCls}>Email (for receipt)</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              autoComplete="email"
            />
          </div>

          {/* Name */}
          <div className="mb-5">
            <label className={labelCls}>Name <span className={darkMode ? 'text-slate-600' : 'text-slate-400'}>(optional)</span></label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              autoComplete="name"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleDonate}
            disabled={loading || effectiveAmount <= 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Connecting to checkout…</span>
              </>
            ) : (
              <>
                <Heart size={18} className="fill-white" />
                <span>
                  Donate{amountDisplay ? ` ${amountDisplay}` : ''}
                </span>
              </>
            )}
          </button>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <ExternalLink size={11} className={darkMode ? 'text-slate-600' : 'text-slate-400'} />
            <p className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
              Secure checkout powered by <span className="font-semibold">Moneroo.io</span> · You will be redirected
            </p>
          </div>

          {/* Impact note */}
          <div className={`mt-4 p-3 rounded-xl text-center ${darkMode ? 'bg-slate-800' : 'bg-green-50'}`}>
            <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              💚 Every gift covers server costs and keeps sheet music free for choirs,
              students &amp; worship teams across Africa and beyond.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Thank-you / status banner shown after returning from Moneroo checkout ─────
type BannerStatus = 'success' | 'failed' | 'cancelled';

interface DonateBannerProps {
  darkMode: boolean;
  status: BannerStatus;
  onDismiss: () => void;
}

const BANNER_CONTENT: Record<BannerStatus, { icon: React.ReactNode; text: string }> = {
  success: {
    icon: <CheckCircle size={20} className="text-green-500 shrink-0" />,
    text: "Thank you for your donation — you're helping keep music free! 🎵",
  },
  failed: {
    icon: <AlertCircle size={20} className="text-red-500 shrink-0" />,
    text: 'Payment was not completed. Please try again if you\'d like to donate.',
  },
  cancelled: {
    icon: <AlertCircle size={20} className="text-amber-500 shrink-0" />,
    text: 'Donation cancelled. You can try again anytime — we appreciate the thought!',
  },
};

export const DonateThankyouBanner: React.FC<DonateBannerProps> = ({ darkMode, status, onDismiss }) => {
  const { icon, text } = BANNER_CONTENT[status];
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border max-w-sm w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-4 duration-500 ${
        darkMode
          ? 'bg-slate-900 border-slate-700 text-slate-100'
          : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {icon}
      <span className="text-sm font-medium flex-1">{text}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className={`p-1 rounded-lg transition-colors ${
          darkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'
        }`}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default DonateModal;
