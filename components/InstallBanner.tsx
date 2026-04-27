import React, { useEffect, useState } from 'react';
import { Download, X, WifiOff, Zap, Smartphone } from 'lucide-react';

interface InstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
  darkMode: boolean;
}

const InstallBanner: React.FC<InstallBannerProps> = ({ onInstall, onDismiss, darkMode }) => {
  const [visible, setVisible] = useState(false);

  // Slide in after a short delay so it doesn't flash immediately on load
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(id);
  }, []);

  const handleInstall = () => {
    setVisible(false);
    setTimeout(onInstall, 300); // let the slide-out finish first
  };

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      role="dialog"
      aria-label="Install Sol-fa Sanctuary"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-sm
        transition-all duration-300 ease-out
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}
        ${darkMode
          ? 'bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60'
          : 'bg-white border border-slate-200 shadow-2xl shadow-slate-200/80'
        } rounded-2xl overflow-hidden`}
    >
      {/* Green accent strip at top */}
      <div className="h-0.5 bg-gradient-to-r from-green-500 to-emerald-400" />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-11 h-11 rounded-xl bg-green-500 flex items-center justify-center shrink-0 shadow-md">
            <span className="text-white font-bold text-lg leading-none">S</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm leading-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              Install Sol-fa Sanctuary
            </p>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Add to your home screen for the best experience
            </p>
          </div>

          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className={`p-1 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Perks row */}
        <div className={`mt-3 flex items-center gap-4 text-[11px] font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          <span className="flex items-center gap-1"><WifiOff size={11} className="text-green-500" /> Works offline</span>
          <span className="flex items-center gap-1"><Zap size={11} className="text-green-500" /> Faster loading</span>
          <span className="flex items-center gap-1"><Smartphone size={11} className="text-green-500" /> Native feel</span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <Download size={14} /> Install app
          </button>
          <button
            onClick={handleDismiss}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallBanner;
