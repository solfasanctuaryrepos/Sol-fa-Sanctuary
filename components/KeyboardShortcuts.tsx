import React, { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsOptions {
  focusSearch?: () => void;
  onEscape?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onToggleFavorite?: () => void;
  previewOpen?: boolean;
  isLoggedIn?: boolean;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement)?.isContentEditable;

      // Escape — always allowed
      if (e.key === 'Escape') {
        if (showOverlay) {
          setShowOverlay(false);
          return;
        }
        options.onEscape?.();
        return;
      }

      // All other shortcuts blocked when typing
      if (isTyping) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowOverlay(prev => !prev);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        options.focusSearch?.();
        return;
      }

      if (options.previewOpen) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          options.onPrevPage?.();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          options.onNextPage?.();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          options.onToggleFavorite?.();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options, showOverlay]);

  return { showOverlay, setShowOverlay };
}

interface ShortcutsOverlayProps {
  darkMode: boolean;
  onClose: () => void;
}

export const ShortcutsOverlay: React.FC<ShortcutsOverlayProps> = ({ darkMode, onClose }) => {
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const overlayBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const kbdCls = darkMode
    ? 'bg-slate-800 border-slate-700 text-slate-300'
    : 'bg-slate-100 border-slate-300 text-slate-700';

  const shortcuts = [
    { key: '/', desc: 'Focus search' },
    { key: '?', desc: 'Toggle shortcuts overlay' },
    { key: 'Esc', desc: 'Close preview / modal' },
    { key: '←', desc: 'Previous PDF page (preview open)' },
    { key: '→', desc: 'Next PDF page (preview open)' },
    { key: 'f', desc: 'Toggle favourite (preview open)' },
  ];

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border overflow-hidden animate-in zoom-in-95 duration-200 ${overlayBg}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <Keyboard size={20} className="text-green-500" />
            <h2 className={`text-lg font-serif font-bold ${textPrimary}`}>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          <table className="w-full">
            <tbody className="divide-y divide-slate-800/30">
              {shortcuts.map(({ key, desc }) => (
                <tr key={key}>
                  <td className="py-3 pr-6 w-24">
                    <kbd className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${kbdCls}`}>
                      {key}
                    </kbd>
                  </td>
                  <td className={`py-3 text-sm ${textSecondary}`}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`text-xs mt-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
            Shortcuts are disabled when typing in an input field.
          </p>
        </div>
      </div>
    </div>
  );
};

interface ShortcutsButtonProps {
  darkMode: boolean;
  onClick: () => void;
}

export const ShortcutsButton: React.FC<ShortcutsButtonProps> = ({ darkMode, onClick }) => (
  <button
    onClick={onClick}
    aria-label="Keyboard shortcuts"
    title="Keyboard shortcuts (?)"
    className={`p-2 border rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-100 border-slate-800 hover:bg-slate-900' : 'text-slate-400 hover:text-slate-900 border-slate-200 hover:bg-slate-50'}`}
  >
    <Keyboard size={16} />
  </button>
);

export default ShortcutsOverlay;
