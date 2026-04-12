import React, { useState, useEffect, useRef } from 'react';
import { Download, Share2, Printer, Eye, Calendar, User, FileText, Music as MusicIcon, X, Moon, Sun, ExternalLink, Menu, ChevronUp, Loader2, AlertTriangle } from 'lucide-react';
import { MusicSheet } from '../types';
import { db } from '../supabase';

interface FullPreviewPageProps {
  sheet: MusicSheet | null;
  darkMode: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
  isLoggedIn: boolean;
  onAuthRequired: () => void;
}

// ─── Module-level render queue ────────────────────────────────────────────────
// Limits concurrent PDF page renders to 2, processed in FIFO (page order).
// This guarantees page 1 always renders first and prevents CPU starvation
// when multiple pages become visible at once.
let _activeRenders = 0;
const _MAX_CONCURRENT = 2;
const _queue: Array<() => void> = [];

const enqueueRender = (task: () => void) => {
  _queue.push(task);
  drainQueue();
};

const drainQueue = () => {
  while (_activeRenders < _MAX_CONCURRENT && _queue.length > 0) {
    _activeRenders++;
    _queue.shift()!();
  }
};

const releaseRender = () => {
  _activeRenders = Math.max(0, _activeRenders - 1);
  drainQueue();
};
// ─────────────────────────────────────────────────────────────────────────────

interface LazyPdfPageProps {
  index: number;
  pdfDoc: any;
  forceRender: boolean;
  darkMode: boolean;
  sheetTitle: string;
  isFirstPage: boolean;
}

const LazyPdfPage: React.FC<LazyPdfPageProps> = ({
  index,
  pdfDoc,
  forceRender,
  darkMode,
  sheetTitle,
  isFirstPage,
}) => {
  const [isIntersecting, setIsIntersecting] = useState(isFirstPage);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref-based guard: prevents double-enqueue without triggering re-renders.
  // Using state for this caused the critical bug: setIsRendering(true) inside
  // doRender triggered the effect cleanup, which set cancelled=true and killed
  // the render that had just started — resulting in an infinite spinner loop.
  const hasQueued = useRef(false);

  // IntersectionObserver — skipped for page 1 and print mode
  useEffect(() => {
    if (isFirstPage || forceRender) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '200px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isFirstPage, forceRender]);

  // Enqueue render when page becomes visible or is forced (print).
  // Dependency array is intentionally minimal — only values that should
  // legitimately retrigger a render (new doc, scroll into view, print).
  useEffect(() => {
    if (!pdfDoc || (!isIntersecting && !forceRender)) return;
    if (hasQueued.current) return; // Already queued — do not enqueue again
    hasQueued.current = true;

    let cancelled = false;

    const doRender = async () => {
      try {
        const page = await pdfDoc.getPage(index);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        canvas.toBlob(
          (blob) => {
            if (blob && !cancelled) setImgUrl(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        console.error(`Page ${index} render error:`, err);
      } finally {
        releaseRender();
      }
    };

    enqueueRender(doRender);

    return () => {
      cancelled = true;
      // Reset so a remount (e.g. React Strict Mode) can re-enqueue cleanly
      hasQueued.current = false;
    };
  }, [pdfDoc, isIntersecting, forceRender, index]);

  // Revoke Blob URL on unmount to prevent memory leaks
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  const textSecondary = darkMode ? 'text-slate-500' : 'text-slate-400';

  return (
    <div ref={containerRef} className="score-page min-h-[500px] w-full flex items-center justify-center relative">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`${sheetTitle} - Page ${index}`}
          className="w-full h-auto rounded shadow-lg border border-slate-700/10 transition-opacity duration-500 ease-in opacity-100"
        />
      ) : (
        <div className={`flex flex-col items-center gap-3 no-print ${textSecondary}`}>
          <Loader2 className="animate-spin opacity-20" size={32} />
          <p className="text-xs font-serif italic">Preparing Page {index}…</p>
        </div>
      )}
    </div>
  );
};

const FullPreviewPage: React.FC<FullPreviewPageProps> = ({
  sheet,
  darkMode,
  onThemeToggle,
  onClose,
  isLoggedIn,
  onAuthRequired
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  // Optimistic local counts — initialised from sheet prop, updated instantly on interaction.
  const [localViews, setLocalViews] = useState(sheet?.views ?? 0);
  const [localDownloads, setLocalDownloads] = useState(sheet?.downloads ?? 0);

  // Sync local counts when a different sheet is opened.
  useEffect(() => {
    setLocalViews(sheet?.views ?? 0);
    setLocalDownloads(sheet?.downloads ?? 0);
  }, [sheet?.id]);

  useEffect(() => {
    if (!sheet) return;

    // Reset state for new sheet
    setPdfDoc(null);
    setNumPages(0);
    setIsInitialLoading(true);

    const loadPdf = async () => {
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF.js not loaded');

        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

        // Passing an options object (not a plain URL string) enables HTTP 206
        // range requests. PDF.js fetches only the xref table + page 1 data first,
        // so the first page renders before the full file finishes downloading.
        const loadingTask = pdfjsLib.getDocument({
          url: sheet.pdfUrl,
          rangeChunkSize: 65536,   // 64 KB chunks — standard for range requests
          disableAutoFetch: false, // Allow background pre-fetch after page 1 loads
          disableStream: false,    // Keep streaming enabled
        });

        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error('PDF load error:', error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadPdf();
  }, [sheet?.id, sheet?.pdfUrl]);

  const trackInteraction = async (type: 'views' | 'downloads') => {
    if (!sheet) return;

    // ── Deduplication check (no network call needed yet) ─────────────────────
    const storageKey = `solfa_${type}_${sheet.id}`;
    if (localStorage.getItem(storageKey)) return; // already counted this session

    // ── Optimistic UI update — happens instantly, before any network call ─────
    if (type === 'views') setLocalViews(v => v + 1);
    else setLocalDownloads(d => d + 1);

    // Mark counted immediately so rapid re-triggers (e.g. remount) are ignored.
    localStorage.setItem(storageKey, '1');

    try {
      // ── Attempt logged-in dedup via interactions table ────────────────────
      // We get the session from the cached client (no extra network call).
      const { data: { session } } = await db.auth.getSession();
      const user = session?.user ?? null;

      // Don't count views/downloads from admins or the sheet's own uploader.
      if (user?.email === 'solfasanctuary@gmail.com' || user?.email === sheet.uploadedBy) {
        // Undo the optimistic increment — this user shouldn't be counted.
        if (type === 'views') setLocalViews(v => v - 1);
        else setLocalDownloads(d => d - 1);
        localStorage.removeItem(storageKey);
        return;
      }

      if (user) {
        // Logged-in: use interactions table so the dedup persists across devices.
        const interactionId = `${user.id}_${sheet.id}_${type}`;
        const { error: insertError } = await db.from('interactions').insert({
          id: interactionId,
          user_id: user.id,
          sheet_id: sheet.id,
          type,
        });
        // If the row already exists (unique constraint), don't increment.
        if (insertError) {
          if (type === 'views') setLocalViews(v => v - 1);
          else setLocalDownloads(d => d - 1);
          return;
        }
      }

      // ── Atomic increment via RPC — single SQL: UPDATE SET x = x + 1 ───────
      // Eliminates the read-modify-write race condition of the old approach.
      await db.rpc('increment_sheet_counter', {
        p_sheet_id: sheet.id,
        p_field: type,
      });
    } catch {
      // Silently ignore tracking errors — never break the user experience.
    }
  };

  useEffect(() => {
    if (sheet) {
      const timer = setTimeout(() => trackInteraction('views'), 1500);
      return () => clearTimeout(timer);
    }
  }, [sheet?.id]);

  const handleProtectedAction = (action: () => void) => {
    isLoggedIn ? action() : onAuthRequired();
  };

  const handleOpenNewTab = () => handleProtectedAction(() => {
    window.open(`${window.location.origin}${window.location.pathname}?sheet=${sheet?.id}`, '_blank');
  });

  const handleDownload = () => handleProtectedAction(() => {
    trackInteraction('downloads');
    window.open(sheet?.pdfUrl, '_blank');
  });

  const handleShare = () => handleProtectedAction(() => {
    if (navigator.share) {
      navigator.share({
        title: sheet?.title,
        text: `Check out ${sheet?.title} on Sol-fa Sanctuary`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied!');
    }
  });

  const handlePrint = () => handleProtectedAction(() => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 1000);
  });

  if (!sheet) return null;

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const headerBg = darkMode
    ? 'bg-slate-900/95 border-slate-800'
    : 'bg-white/95 border-slate-200 shadow-sm';

  return (
    <div className={`fixed inset-0 flex flex-col h-screen overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <style>{`
        @media print {
          @page { margin: 0; size: auto; }
          html, body, #root, #root > div { height: auto !important; min-height: 0 !important; overflow: visible !important; position: static !important; display: block !important; margin: 0 !important; padding: 0 !important; background: white !important; color: black !important; }
          div.fixed.inset-0 { position: static !important; display: block !important; height: auto !important; width: 100% !important; overflow: visible !important; inset: auto !important; padding: 0 !important; margin: 0 !important; background: transparent !important; }
          header, .no-print, footer, .hide-on-print { display: none !important; height: 0 !important; width: 0 !important; margin: 0 !important; padding: 0 !important; visibility: hidden !important; }
          main { padding: 0 !important; margin: 0 !important; width: 100% !important; overflow: visible !important; height: auto !important; position: static !important; display: block !important; }
          .print-header { display: block !important; text-align: center; font-size: 11pt; font-family: serif; margin: 0 !important; padding: 1cm 0 0.5cm 0 !important; border-bottom: 1px solid #ddd; width: 100%; }
          .score-page-container { padding: 0 !important; margin: 0 !important; display: block !important; background: transparent !important; border: none !important; box-shadow: none !important; width: 100% !important; }
          .score-page { box-shadow: none !important; border: none !important; width: 100% !important; margin: 0 !important; padding: 0.5cm 0 !important; display: block !important; page-break-after: always; break-after: page; }
          .score-page:last-child { page-break-after: avoid; break-after: avoid; }
          img { max-width: 100% !important; height: auto !important; display: block; margin: 0 auto; image-rendering: high-quality; page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <header className={`shrink-0 z-[100] border-b backdrop-blur-xl transition-all ${headerBg} no-print`}>
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-1 lg:py-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-0.5 md:gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <button onClick={onClose} className={`p-2 rounded-lg transition-colors shrink-0 ${darkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'}`} title="Back to Sanctuary"><X size={20} /></button>
              <div className="flex flex-col min-w-0 flex-1">
                <h1 className={`text-lg md:text-xl font-serif font-bold leading-tight truncate ${textPrimary}`}>{sheet.title}</h1>
                <p className="text-green-500 font-medium text-xs truncate">{sheet.composer}</p>
              </div>
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`lg:hidden p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>{isMobileMenuOpen ? <ChevronUp size={24} /> : <Menu size={24} />}</button>
              <div className="hidden lg:flex flex-col justify-center gap-1 border-l border-slate-700/50 pl-6 shrink-0">
                <div className="flex items-center gap-2"><Eye size={16} className="text-blue-400" /><span className={`text-xs font-bold ${textPrimary}`}>{localViews}</span></div>
                <div className="flex items-center gap-2"><Download size={16} className="text-green-500" /><span className={`text-xs font-bold ${textPrimary}`}>{localDownloads}</span></div>
              </div>
            </div>
            <div className={`${isMobileMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row flex-1 items-start lg:items-center justify-between gap-0.5 lg:gap-0 animate-in slide-in-from-top-2 duration-300 lg:animate-none`}>
              <div className="flex-1 grid grid-cols-3 lg:grid-cols-2 justify-center gap-y-0 gap-x-2 lg:gap-x-12 lg:px-8 lg:border-x border-slate-700/50 w-full lg:w-auto">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-[100px]"><MusicIcon size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.type}</span></div>
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-auto"><Calendar size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.uploadedAt}</span></div>
                <div className="lg:hidden flex items-center gap-1.5 text-[10px] min-w-0"><Eye size={14} className="text-blue-400 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{localViews}</span></div>
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-[100px]"><FileText size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.fileSize}</span></div>
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-auto"><User size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</span></div>
                <div className="lg:hidden flex items-center gap-1.5 text-[10px] min-w-0"><Download size={14} className="text-green-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{localDownloads}</span></div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 w-full lg:w-auto">
                <button onClick={onThemeToggle} className={`p-2.5 rounded-xl border transition-colors shrink-0 ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`} title="Toggle Theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
                <div className="h-8 w-px bg-slate-700/50 mx-1 hidden lg:block"></div>
                <div className="flex items-center gap-1.5 md:gap-2 flex-1 lg:flex-none">
                  <button onClick={handleOpenNewTab} className={`p-2.5 rounded-xl border transition-colors shrink-0 ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`} title="Open in new tab"><ExternalLink size={18} /></button>
                  <button onClick={handleShare} className={`p-2.5 rounded-xl border transition-colors shrink-0 ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`} title="Share"><Share2 size={18} /></button>
                  <button onClick={handlePrint} className={`p-2.5 rounded-xl border transition-colors shrink-0 ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`} title="Print"><Printer size={18} /></button>
                  <button onClick={handleDownload} className="flex-1 lg:flex-none px-4 md:px-6 py-2.5 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-green-500/10 flex items-center justify-center gap-2 active:scale-95 text-sm md:text-base"><Download size={18} /><span>Download PDF</span></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full px-4 md:px-8 flex flex-col items-center pt-2 md:pt-4 [will-change:transform]">
        <div className="hidden print-header"><p className="font-bold text-xl">{sheet.title}</p><p className="text-slate-500 text-sm">Sanctuary: {window.location.hostname}</p></div>
        <div className="w-full max-w-[800px] animate-in fade-in zoom-in-95 duration-700">
          <div className={`w-full min-h-[400px] rounded-2xl border-2 md:border-4 overflow-hidden shadow-2xl transition-colors relative score-page-container ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-white bg-white'}`}>
            {isInitialLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 no-print">
                <Loader2 className="animate-spin text-green-500" size={48} />
                <p className={`text-sm font-medium animate-pulse ${textSecondary}`}>Opening the score…</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 p-2 md:p-4 bg-slate-200/5">
                {numPages > 0 ? (
                  Array.from({ length: numPages }).map((_, i) => (
                    <LazyPdfPage
                      key={i}
                      index={i + 1}
                      pdfDoc={pdfDoc}
                      forceRender={isPrinting}
                      darkMode={darkMode}
                      sheetTitle={sheet.title}
                      isFirstPage={i === 0}
                    />
                  ))
                ) : (
                  <div className="py-20 text-center no-print">
                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
                    <p className={textSecondary}>Harmony disrupted. Unable to display score.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-8 md:mt-12 mb-12 text-center max-w-2xl mx-auto space-y-4 no-print">
            <div className="w-12 h-1 bg-green-500 mx-auto rounded-full"></div>
            <p className={`text-base md:text-lg italic font-serif ${textSecondary}`}>"This sheet music is provided for educational and devotional purposes. May your performance bring joy and sanctuary to all who listen."</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FullPreviewPage;
