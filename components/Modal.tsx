import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
  /** If true, clicking the overlay closes the modal */
  closeOnOverlay?: boolean;
  /** Prevents closing while an action is in progress */
  loading?: boolean;
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  maxWidth = 'md',
  children,
  closeOnOverlay = true,
  loading = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap + Escape key
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const focusable = () =>
      cardRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? ([] as unknown as NodeListOf<HTMLElement>);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = Array.from(focusable());
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Autofocus first focusable element after a tick
    setTimeout(() => Array.from(focusable())[0]?.focus(), 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlay && !loading && e.target === overlayRef.current) {
      onClose();
    }
  };

  const cardBg = darkMode
    ? 'bg-[#0f172a] border-slate-800'
    : 'bg-white border-slate-200 shadow-2xl';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[110] overflow-y-auto flex items-start sm:items-center justify-center px-4 py-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div
        ref={cardRef}
        className={`w-full my-auto ${MAX_WIDTH_CLASSES[maxWidth] ?? 'max-w-md'} rounded-3xl overflow-hidden border animate-in zoom-in-95 duration-300 ${cardBg}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
