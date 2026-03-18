import { Search, List, Grid, ChevronDown, Eye, Download, Music as MusicIcon, ArrowUp, ArrowDown, Check, MoreVertical } from 'lucide-react';
import React, { useState, useEffect, useMemo, memo } from 'react';
import { MusicSheet } from '../types';

interface MusicLibraryProps {
  darkMode: boolean;
  initialSearch?: string;
  onPreview: (sheet: MusicSheet) => void;
  sheets: MusicSheet[];
}

type SortConfig = { key: keyof MusicSheet; direction: 'asc' | 'desc' } | null;

// Extracted for performance optimization with memoization
const SheetCard = memo(({ sheet, onPreview, activeMobileMenuId, setActiveMobileMenuId, darkMode }: { 
  sheet: MusicSheet; 
  onPreview: (s: MusicSheet) => void; 
  activeMobileMenuId: string | null;
  setActiveMobileMenuId: (id: string | null) => void;
  darkMode: boolean;
}) => {
  const tableBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(sheet.pdfUrl, '_blank');
  };

  return (
    <div className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${tableBg}`}>
      <div 
        className="aspect-[3/4] overflow-hidden relative cursor-pointer"
        onClick={() => onPreview(sheet)}
      >
        <img src={sheet.thumbnailUrl} alt={sheet.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setActiveMobileMenuId(activeMobileMenuId === sheet.id ? null : sheet.id);
          }}
          className="md:hidden absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
        >
          <MoreVertical size={16} />
        </button>
        <div className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col justify-end p-4 ${activeMobileMenuId === sheet.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button 
            onClick={handleDownload}
            className="w-full py-2.5 bg-green-500 text-white text-sm font-bold rounded-xl transform translate-y-2 group-hover:translate-y-0 transition-transform shadow-lg active:scale-95 flex items-center justify-center gap-2 hover:bg-green-600"
          >
            <Download size={18} />
            Download
          </button>
        </div>
      </div>
      <div className="p-4">
        <h3 className={`font-bold truncate mb-1 ${textPrimary}`}>{sheet.title}</h3>
        <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
          <span className="truncate">{sheet.composer}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
            <span className="flex items-center gap-1"><Download size={12} /> {sheet.downloads}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

const MusicLibrary: React.FC<MusicLibraryProps> = ({ darkMode, initialSearch = '', onPreview, sheets }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState<string | null>(null);

  const [visibleColumns] = useState({
    title: true,
    composer: true,
    type: true,
    uploadedAt: true,
    views: true,
    downloads: true,
  });

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  const handleSort = (key: keyof MusicSheet) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Performance Optimization: Memoize filtering and sorting to prevent jank during searching
  const filteredSheets = useMemo(() => {
    const publicSheets = sheets.filter(s => s.isPublic && !s.isAdminRestricted);
    
    let result = publicSheets.filter(sheet =>
      sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sheet.composer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sheet.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [sheets, searchTerm, sortConfig]);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const tableBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const headerBg = darkMode ? 'bg-slate-950/50' : 'bg-slate-50';

  const SortIcon = ({ colKey }: { colKey: keyof MusicSheet }) => {
    if (sortConfig?.key !== colKey) return null;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Music Library</h1>
          <p className={textSecondary}>Browse and discover Tonic Solfa sheets.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search library..."
              className={`border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 w-full md:w-64 ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
            />
          </div>
          <div className={`flex border rounded-lg overflow-hidden shrink-0 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}><List size={16} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}><Grid size={16} /></button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredSheets.map(sheet => (
            <SheetCard 
              key={sheet.id} 
              sheet={sheet} 
              onPreview={onPreview} 
              activeMobileMenuId={activeMobileMenuId} 
              setActiveMobileMenuId={setActiveMobileMenuId} 
              darkMode={darkMode} 
            />
          ))}
        </div>
      ) : (
        <div className={`border rounded-2xl overflow-hidden transition-colors ${tableBg}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px] md:min-w-full">
              <thead>
                <tr className={`text-slate-500 text-[10px] font-bold uppercase tracking-wider ${headerBg}`}>
                  {visibleColumns.title && <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('title')}><div className="flex items-center">Title <SortIcon colKey="title" /></div></th>}
                  {visibleColumns.composer && <th className="hidden md:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('composer')}><div className="flex items-center">Composed by <SortIcon colKey="composer" /></div></th>}
                  {visibleColumns.type && <th className="hidden lg:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('type')}><div className="flex items-center">Type <SortIcon colKey="type" /></div></th>}
                  {visibleColumns.uploadedAt && <th className="hidden xl:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('uploadedAt')}><div className="flex items-center">Uploaded <SortIcon colKey="uploadedAt" /></div></th>}
                  {visibleColumns.views && <th className="px-4 md:px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('views')}><div className="flex justify-center items-center">Views <SortIcon colKey="views" /></div></th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {filteredSheets.map((sheet) => (
                  <tr key={sheet.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                    {visibleColumns.title && (
                      <td className="px-4 md:px-6 py-4">
                        <button onClick={() => onPreview(sheet)} className="flex items-center gap-3 text-left group/title active:scale-[0.98] transition-transform">
                          <img src={sheet.thumbnailUrl} className="w-10 h-10 object-cover rounded border border-slate-700/50" alt="" />
                          <span className={`font-medium group-hover/title:text-green-500 transition-colors ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{sheet.title}</span>
                        </button>
                      </td>
                    )}
                    {visibleColumns.composer && <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500">{sheet.composer}</td>}
                    {visibleColumns.type && (<td className="hidden lg:table-cell px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{sheet.type}</span></td>)}
                    {visibleColumns.uploadedAt && <td className="hidden xl:table-cell px-6 py-4 text-sm text-slate-500">{sheet.uploadedAt}</td>}
                    {visibleColumns.views && <td className="px-4 md:px-6 py-4 text-sm text-slate-500 text-center">{sheet.views}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicLibrary;