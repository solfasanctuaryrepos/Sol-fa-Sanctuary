import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Share2, Printer, Eye, Calendar, User, FileText, Music as MusicIcon, X, Moon, Sun, ExternalLink, Menu, ChevronUp, Loader2, AlertTriangle } from 'lucide-react';
import { MusicSheet } from '../types';
import { auth, db } from '../supabase';

interface FullPreviewPageProps {
  sheet: MusicSheet | null;
  darkMode: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
  isLoggedIn: boolean;
  onAuthRequired: () => void;
}

const LazyPdfPage: React.FC<{ index: number; pdfDoc: any; forceRender: boolean; darkMode: boolean; sheetTitle: string }> = ({ index, pdfDoc, forceRender, darkMode, sheetTitle }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceRender) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '400px' } // Pre-render pages before they hit the screen
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [forceRender]);

  useEffect(() => {
    let active = true;
    const renderPage = async () => {
      if ((isIntersecting || forceRender) && pdfDoc && !imgUrl && !isRendering) {
        setIsRendering(true);
        try {
          const page = await pdfDoc.getPage(index);
          const viewport = page.getViewport({ scale: 1.8 }); // Balanced for quality and speed
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context && active) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            
            canvas.toBlob((blob) => {
              if (blob && active) {
                const url = URL.createObjectURL(blob);
                setImgUrl(url);
              }
            }, 'image/jpeg', 0.8);
          }
        } catch (err) {
          console.error(`Page ${index} render error:`, err);
        } finally {
          if (active) setIsRendering(false);
        }
      }
    };

    renderPage();
    return () => { 
      active = false;
    };
  }, [isIntersecting, forceRender, pdfDoc, index]);

  // Clean up Blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

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
          <p className="text-xs font-serif italic">Preparing Page {index}...</p>
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

  useEffect(() => {
    if (!sheet) return;

    const loadPdf = async () => {
      setIsInitialLoading(true);
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error("PDF.js not loaded");
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
        const loadingTask = pdfjsLib.getDocument(sheet.pdfUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Error loading PDF document:", error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadPdf();
    return () => setPdfDoc(null);
  }, [sheet?.id, sheet?.pdfUrl]);

  const trackInteraction = async (type: 'views' | 'downloads') => {
    if (!sheet) return;
    const { data: { user } } = await auth.getUser();
    if (user?.email === 'solfasanctuary@gmail.com' || user?.email === sheet.uploadedBy) return;

    try {
      if (user) {
        const interactionId = `${user.id}_${sheet.id}_${type}`;
        
        // Check if interaction already exists
        const { data: existing } = await db
          .from('interactions')
          .select('id')
          .eq('id', interactionId)
          .single();

        if (!existing) {
          // Record interaction
          await db
            .from('interactions')
            .insert({ 
              id: interactionId,
              user_id: user.id, 
              sheet_id: sheet.id, 
              type 
            });

          // Increment sheet count
          const { data: currentSheet } = await db
            .from('sheets')
            .select(type)
            .eq('id', sheet.id)
            .single();

          const currentCount = currentSheet ? (currentSheet as any)[type] : 0;
          await db
            .from('sheets')
            .update({ [type]: currentCount + 1 })
            .eq('id', sheet.id);
        }
      } else {
        const storageKey = `solfa_sanctuary_${type}_${sheet.id}`;
        if (!localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, 'true');
          
          const { data: currentSheet } = await db
            .from('sheets')
            .select(type)
            .eq('id', sheet.id)
            .single();

          const currentCount = currentSheet ? (currentSheet as any)[type] : 0;
          await db
            .from('sheets')
            .update({ [type]: currentCount + 1 })
            .eq('id', sheet.id);
        }
      }
    } catch (error) {
      console.error(`Tracking error:`, error);
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
      navigator.share({ title: sheet?.title, text: `Check out ${sheet?.title} on Sol-fa Sanctuary`, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied!");
    }
  });

  const handlePrint = () => handleProtectedAction(() => {
    setIsPrinting(true);
    // Give a moment for forced rendering to start before bringing up print dialog
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 1000);
  });

  if (!sheet) return null;

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const headerBg = darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200 shadow-sm';

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
                <div className="flex items-center gap-2"><Eye size={16} className="text-blue-400" /><span className={`text-xs font-bold ${textPrimary}`}>{sheet.views}</span></div>
                <div className="flex items-center gap-2"><Download size={16} className="text-green-500" /><span className={`text-xs font-bold ${textPrimary}`}>{sheet.downloads}</span></div>
              </div>
            </div>
            <div className={`${isMobileMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row flex-1 items-start lg:items-center justify-between gap-0.5 lg:gap-0 animate-in slide-in-from-top-2 duration-300 lg:animate-none`}>
              <div className="flex-1 grid grid-cols-3 lg:grid-cols-2 justify-center gap-y-0 gap-x-2 lg:gap-x-12 lg:px-8 lg:border-x border-slate-700/50 w-full lg:w-auto">
                 <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-[100px]"><MusicIcon size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.type}</span></div>
                 <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-auto"><Calendar size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.uploadedAt}</span></div>
                 <div className="lg:hidden flex items-center gap-1.5 text-[10px] min-w-0"><Eye size={14} className="text-blue-400 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.views}</span></div>
                 <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-[100px]"><FileText size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.fileSize}</span></div>
                 <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] min-w-0 lg:w-auto"><User size={14} className="text-slate-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</span></div>
                 <div className="lg:hidden flex items-center gap-1.5 text-[10px] min-w-0"><Download size={14} className="text-green-500 shrink-0" /><span className={`font-bold truncate ${textPrimary}`}>{sheet.downloads}</span></div>
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
                <p className={`text-sm font-medium animate-pulse ${textSecondary}`}>Opening the score...</p>
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
                    />
                  ))
                ) : (
                  <div className="py-20 text-center no-print"><AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} /><p className={textSecondary}>Harmony disrupted. Unable to display score.</p></div>
                )}
              </div>
            )}
          </div>
          <div className="mt-8 md:mt-12 mb-12 text-center max-w-2xl mx-auto space-y-4 no-print"><div className="w-12 h-1 bg-green-500 mx-auto rounded-full"></div><p className={`text-base md:text-lg italic font-serif ${textSecondary}`}>"This sheet music is provided for educational and devotional purposes. May your performance bring joy and sanctuary to all who listen."</p></div>
        </div>
      </main>
    </div>
  );
};

export default FullPreviewPage;