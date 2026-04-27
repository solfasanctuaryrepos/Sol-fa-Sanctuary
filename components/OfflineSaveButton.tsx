import React from 'react';
import { CloudDownload, CloudOff, Loader2, WifiOff } from 'lucide-react';

interface OfflineSaveButtonProps {
  isSaved: boolean;
  isSaving: boolean;
  isRemoving: boolean;
  progress: number; // 0–100, only meaningful when isSaving
  onSave: () => void;
  onRemove: () => void;
  darkMode: boolean;
  /** 'icon' = small icon-only button for cards, 'full' = labelled button for preview page */
  variant?: 'icon' | 'full';
  className?: string;
}

const OfflineSaveButton: React.FC<OfflineSaveButtonProps> = ({
  isSaved, isSaving, isRemoving, progress, onSave, onRemove, darkMode, variant = 'full', className = '',
}) => {
  const busy = isSaving || isRemoving;

  if (variant === 'icon') {
    return (
      <button
        onClick={e => { e.stopPropagation(); isSaved ? onRemove() : onSave(); }}
        disabled={busy}
        title={isSaved ? 'Remove offline copy' : 'Save for offline viewing'}
        aria-label={isSaved ? 'Remove offline copy' : 'Save for offline viewing'}
        className={`relative p-1.5 rounded-full backdrop-blur-sm transition-all disabled:opacity-50 ${
          isSaved
            ? 'bg-green-500 text-white'
            : darkMode
              ? 'bg-black/40 text-white/70 hover:text-green-400'
              : 'bg-white/70 text-slate-500 hover:text-green-600'
        } ${className}`}
      >
        {isSaving ? (
          <Loader2 size={13} className="animate-spin" />
        ) : isSaved ? (
          <WifiOff size={13} />
        ) : (
          <CloudDownload size={13} />
        )}
        {/* tiny progress ring overlay */}
        {isSaving && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28" width="28" height="28">
            <circle
              cx="14" cy="14" r="12"
              fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 12}`}
              strokeDashoffset={`${2 * Math.PI * 12 * (1 - progress / 100)}`}
              className="transition-all duration-300"
            />
          </svg>
        )}
      </button>
    );
  }

  // Full labelled variant for FullPreviewPage toolbar
  return (
    <button
      onClick={() => isSaved ? onRemove() : onSave()}
      disabled={busy}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 overflow-hidden ${
        isSaved
          ? darkMode
            ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            : 'bg-green-50 border border-green-200 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
          : darkMode
            ? 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-green-500/50 hover:text-green-400'
            : 'bg-white border border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-700 shadow-sm'
      } ${className}`}
    >
      {/* Progress fill bar */}
      {isSaving && (
        <span
          className="absolute inset-0 bg-green-500/20 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      )}

      {isSaving ? (
        <><Loader2 size={15} className="animate-spin relative z-10" />
          <span className="relative z-10">Saving… {progress}%</span></>
      ) : isRemoving ? (
        <><Loader2 size={15} className="animate-spin" /><span>Removing…</span></>
      ) : isSaved ? (
        <><WifiOff size={15} /><span>Saved offline</span></>
      ) : (
        <><CloudDownload size={15} /><span>Save offline</span></>
      )}
    </button>
  );
};

export default OfflineSaveButton;
