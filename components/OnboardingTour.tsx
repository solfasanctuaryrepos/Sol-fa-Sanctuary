import React, { useState } from 'react';

interface OnboardingTourProps {
  onComplete: () => void;
  darkMode?: boolean;
}

const STEPS = [
  {
    emoji: '🎵',
    title: 'Welcome to Sol-fa Sanctuary',
    description:
      'The home of Tonic Sol-fa sheet music. Discover, share, and collect music sheets from our community.',
    cta: 'Next →',
  },
  {
    emoji: '🔍',
    title: 'Browse the Library',
    description:
      'Search by title or composer, filter by type, and sort by popularity. Find exactly the sheet you need.',
    cta: 'Next →',
  },
  {
    emoji: '⬆️',
    title: 'Upload Your Sheets',
    description:
      'Share your own Tonic Sol-fa arrangements with the community. Build your profile and track how many people use your music.',
    cta: 'Next →',
  },
  {
    emoji: '📚',
    title: 'Create Collections',
    description:
      'Organise sheets into collections — perfect for choir practice, a Sunday service, or a themed playlist.',
    cta: 'Get Started',
  },
];

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, darkMode = true }) => {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const dismiss = () => {
    localStorage.setItem('solfa-onboarded', 'true');
    onComplete();
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      dismiss();
      return;
    }
    setLeaving(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setLeaving(false);
    }, 150);
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl transition-all duration-150 ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200'} ${leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
      >
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium z-10"
        >
          Skip
        </button>

        <div className="p-8 text-center">
          {/* Emoji */}
          <div className="text-5xl mb-5 select-none">{current.emoji}</div>

          {/* Title */}
          <h2 className={`text-2xl font-serif font-bold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{current.title}</h2>

          {/* Description */}
          <p className={`text-sm leading-relaxed mb-8 max-w-sm mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            {current.description}
          </p>

          {/* CTA */}
          <button
            onClick={next}
            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-95"
          >
            {current.cta}
          </button>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 pb-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => { setLeaving(true); setTimeout(() => { setStep(i); setLeaving(false); }, 150); }}
              aria-label={`Go to step ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-green-500 w-4' : 'bg-slate-700 hover:bg-slate-600'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
