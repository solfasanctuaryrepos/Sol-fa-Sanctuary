
import React, { useRef } from 'react';
import { X, Download, Share2, Printer, Eye, Calendar, User, FileText, Music as MusicIcon } from 'lucide-react';
import { MusicSheet } from '../types';

interface PreviewModalProps {
  sheet: MusicSheet | null;
  onClose: () => void;
  darkMode: boolean;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ sheet, onClose, darkMode }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!sheet) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const bgClass = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const sidebarBg = darkMode ? 'bg-slate-900/50' : 'bg-slate-50';

  return (
    <div 
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className={`w-full max-w-5xl h-full max-h-[90vh] rounded-3xl overflow-hidden border flex flex-col md:flex-row animate-in zoom-in-95 duration-300 ${bgClass}`}>
        {/* Preview Area */}
        <div className="flex-1 overflow-auto bg-slate-200/20 p-4 md:p-8 flex items-center justify-center relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 md:hidden p-2 bg-white/10 rounded-full text-white backdrop-blur-md"
          >
            <X size={20} />
          </button>
          <img 
            src={sheet.thumbnailUrl} 
            alt={sheet.title} 
            className="max-w-full h-auto shadow-2xl rounded border border-white/10"
          />
        </div>

        {/* Sidebar Info */}
        <div className={`w-full md:w-80 flex flex-col border-l ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="p-6 flex-1 space-y-8 overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className={`text-2xl font-serif font-bold ${textPrimary}`}>{sheet.title}</h2>
                <p className="text-green-500 font-medium">{sheet.composer}</p>
              </div>
              <button 
                onClick={onClose}
                className={`hidden md:flex p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Views</p>
                <p className={`text-sm font-bold flex items-center gap-1.5 ${textPrimary}`}><Eye size={14} className="text-blue-500" /> {sheet.views}</p>
              </div>
              <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Downloads</p>
                <p className={`text-sm font-bold flex items-center gap-1.5 ${textPrimary}`}><Download size={14} className="text-green-500" /> {sheet.downloads}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className={`text-xs font-bold text-slate-500 uppercase tracking-widest ${darkMode ? 'opacity-80' : ''}`}>Metadata</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <MusicIcon size={16} className="text-slate-500" />
                  <span className={textSecondary}>Type:</span>
                  <span className={`font-medium ${textPrimary}`}>{sheet.type}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar size={16} className="text-slate-500" />
                  <span className={textSecondary}>Uploaded:</span>
                  <span className={`font-medium ${textPrimary}`}>{sheet.uploadedAt}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <FileText size={16} className="text-slate-500" />
                  <span className={textSecondary}>File Size:</span>
                  <span className={`font-medium ${textPrimary}`}>{sheet.fileSize}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <User size={16} className="text-slate-500" />
                  <span className={textSecondary}>Uploaded by:</span>
                  <span className={`font-medium truncate ${textPrimary}`} title={sheet.uploadedBy}>{sheet.uploadedBy.split('@')[0]}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`p-6 space-y-3 border-t ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'bg-slate-50 border-slate-100'}`}>
            <button className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
              <Download size={18} />
              Download PDF
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button className={`py-2 border rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-white shadow-sm'}`}>
                <Share2 size={16} /> Share
              </button>
              <button className={`py-2 border rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-white shadow-sm'}`}>
                <Printer size={16} /> Print
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
