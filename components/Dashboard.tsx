
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, Eye, Download, Search, List, Grid, MoreVertical, Edit2, Trash2, FileText, ArrowUp, ArrowDown, X, Check, Lock, ShieldAlert, Globe, AlertTriangle, Heart, BarChart2, RefreshCw, BookOpen, MessageSquare, ThumbsUp, Clock, CheckCircle2 } from 'lucide-react';
import { MusicSheet, SheetRequest } from '../types';
import { db, storage } from '../supabase';
import Modal from './Modal';

interface DashboardProps {
  onUploadClick: () => void;
  onPreview: (sheet: MusicSheet) => void;
  darkMode: boolean;
  sheets: MusicSheet[];
  userEmail: string;
  userId: string;
  /** Called immediately after a successful delete so the item disappears without waiting for realtime. */
  onSheetDeleted: (id: string) => void;
  /** Called with the new sheet object after an update so the item reflects changes without waiting for realtime. */
  onSheetUpdated: (updated: MusicSheet) => void;
  userFavorites?: string[];
  onFavoritesChange?: (favs: string[]) => void;
  onNavigateCollections?: () => void;
  onRequestSheet?: () => void;
}

type SortConfig = { key: keyof MusicSheet; direction: 'asc' | 'desc' } | null;
type DashTab = 'mine' | 'favourites' | 'requests';

// ── Analytics panel ───────────────────────────────────────────────────────────
interface DayData { views: number; downloads: number; label: string; }

const AnalyticsPanel: React.FC<{ sheet: MusicSheet; darkMode: boolean; onClose: () => void }> = ({ sheet, darkMode, onClose }) => {
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const fetchData = async () => {
      try {
        const { data } = await db.from('interactions')
          .select('type, created_at')
          .eq('sheet_id', sheet.id)
          .gte('created_at', since);
        // Build 14-day buckets
        const buckets: Record<string, DayData> = {};
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().slice(0, 10);
          const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
          buckets[key] = { views: 0, downloads: 0, label };
        }
        (data || []).forEach((row: any) => {
          const key = row.created_at.slice(0, 10);
          if (buckets[key]) {
            if (row.type === 'views') buckets[key].views++;
            else buckets[key].downloads++;
          }
        });
        setDays(Object.values(buckets));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sheet.id]);

  const maxVal = Math.max(1, ...days.map(d => d.views + d.downloads));
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const panelBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  const hasData = days.some(d => d.views > 0 || d.downloads > 0);

  return (
    <div className={`mt-4 rounded-2xl border p-6 ${panelBg} animate-in slide-in-from-top-2 duration-200`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className={`font-bold text-lg ${textPrimary}`}>{sheet.title}</h3>
          <p className={`text-sm ${textSecondary}`}>{sheet.composer} — Last 14 days</p>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-6 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
          <span className={textSecondary}>Views: <span className={`font-bold ${textPrimary}`}>{sheet.views}</span></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-sm bg-green-500"></div>
          <span className={textSecondary}>Downloads: <span className={`font-bold ${textPrimary}`}>{sheet.downloads}</span></span>
        </div>
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData ? (
        <p className={`text-center py-8 text-sm ${textSecondary}`}>No interaction data yet.</p>
      ) : (
        <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
          {days.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-[28px]">
              <div className="flex items-end gap-px w-full h-20">
                <div
                  className="flex-1 bg-blue-500 rounded-t transition-all duration-300"
                  style={{ height: `${(day.views / maxVal) * 100}%`, minHeight: day.views > 0 ? '3px' : '0' }}
                  title={`Views: ${day.views}`}
                />
                <div
                  className="flex-1 bg-green-500 rounded-t transition-all duration-300"
                  style={{ height: `${(day.downloads / maxVal) * 100}%`, minHeight: day.downloads > 0 ? '3px' : '0' }}
                  title={`Downloads: ${day.downloads}`}
                />
              </div>
              <span className={`text-[8px] ${textSecondary}`}>{day.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ onUploadClick, onPreview, darkMode, sheets, userEmail, userId, onSheetDeleted, onSheetUpdated, userFavorites = [], onFavoritesChange, onNavigateCollections, onRequestSheet }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashTab>('mine');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [myRequests, setMyRequests] = useState<SheetRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [selectedSheetForAnalytics, setSelectedSheetForAnalytics] = useState<MusicSheet | null>(null);

  const userSheets = sheets.filter(sheet => sheet.uploadedBy === userEmail);
  const favoriteSheets = sheets.filter(s => userFavorites.includes(s.id) && s.isPublic && !s.isAdminRestricted);

  useEffect(() => {
    if (activeTab !== 'requests' || !userId) return;
    setRequestsLoading(true);
    db.from('sheet_requests')
      .select('*')
      .eq('requested_by', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setMyRequests((data ?? []) as SheetRequest[]);
        setRequestsLoading(false);
      });
  }, [activeTab, userId]);
  const [editingSheet, setEditingSheet] = useState<MusicSheet | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleSort = (key: keyof MusicSheet) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const parseSize = (size: string) => {
    if (!size) return 0;
    const [val, unit] = size.split(' ');
    const num = parseFloat(val);
    if (unit === 'GB') return num * 1024 * 1024 * 1024;
    if (unit === 'MB') return num * 1024 * 1024;
    if (unit === 'KB') return num * 1024;
    return num;
  };

  const sortedSheets = [...userSheets].sort((a: MusicSheet, b: MusicSheet) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;

    let valA: string | number = a[key] as string | number;
    let valB: string | number = b[key] as string | number;

    if (key === 'fileSize') {
      valA = parseSize(valA as string);
      valB = parseSize(valB as string);
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredSheets = sortedSheets.filter(sheet =>
    sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sheet.composer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Batch operations ────────────────────────────────────────────────────────
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const batchUpdateVisibility = async (isPublic: boolean) => {
    const ids = [...selectedIds];
    ids.forEach(id => {
      const sheet = userSheets.find(s => s.id === id);
      if (sheet) onSheetUpdated({ ...sheet, isPublic });
    });
    setSelectedIds(new Set());
    try {
      await db.from('sheets').update({ is_public: isPublic }).in('id', ids);
    } catch (err) {
      console.error('Batch visibility error:', err);
    }
  };

  const executeBatchDelete = async () => {
    const ids = [...selectedIds];
    setBatchDeleteConfirm(false);
    setSelectedIds(new Set());
    ids.forEach(id => onSheetDeleted(id));
    try {
      await db.from('sheets').delete().in('id', ids);
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDownload = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = sheet.pdfUrl;
    a.download = `${sheet.title}.pdf`;
    a.click();
  };

  const handleDelete = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.nativeEvent.stopImmediatePropagation();
    e.preventDefault();
    e.stopPropagation();
    
    setDeleteConfirmation({
      id: sheet.id,
      title: sheet.title
    });
  };

  const executeDeletion = async () => {
    if (!deleteConfirmation) return;
    const { id } = deleteConfirmation;
    setDeleteConfirmation(null); // close modal immediately — no waiting
    try {
      const { error } = await db.from('sheets').delete().eq('id', id);
      if (error) throw error;
      onSheetDeleted(id); // remove from list right after network confirms
    } catch (error: any) {
      console.error("Deletion error:", error);
      alert(`Failed to delete: ${error.message || 'Unknown error'}`);
    }
  };

  const handleEdit = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    setEditingSheet(sheet);
  };

  const toggleVisibility = async (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    onSheetUpdated({ ...sheet, isPublic: !sheet.isPublic }); // optimistic flip
    try {
      const { error } = await db
        .from('sheets')
        .update({ is_public: !sheet.isPublic })
        .eq('id', sheet.id);
      if (error) throw error;
    } catch (error) {
      onSheetUpdated(sheet); // rollback on failure
      console.error("Visibility update error:", error);
    }
  };

  const handleUpdateSheet = async (updatedSheet: MusicSheet) => {
    const original = userSheets.find(s => s.id === updatedSheet.id) ?? null;
    setEditingSheet(null);       // close modal immediately
    onSheetUpdated(updatedSheet); // apply changes optimistically
    try {
      const { id, ...data } = updatedSheet;
      const { error } = await db
        .from('sheets')
        .update({
          title: data.title,
          composer: data.composer,
          type: data.type,
          is_public: data.isPublic,
          // Only send file fields if they changed
          ...(data.pdfUrl !== original?.pdfUrl ? { pdf_url: data.pdfUrl } : {}),
          ...(data.thumbnailUrl !== original?.thumbnailUrl ? { thumbnail_url: data.thumbnailUrl } : {}),
          ...(data.fileSize !== original?.fileSize ? { file_size: data.fileSize } : {}),
        })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      if (original) onSheetUpdated(original); // rollback on failure
      console.error("Update error:", error);
      alert("Failed to save changes.");
    }
  };

  const SortIcon = ({ colKey }: { colKey: keyof MusicSheet }) => {
    if (sortConfig?.key !== colKey) return null;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
  };

  const stats = [
    { label: 'Total Uploads', value: String(userSheets.length), sub: 'music sheets uploaded', icon: Music },
    { label: 'Total Views', value: String(userSheets.reduce((acc, s) => acc + s.views, 0)), sub: 'times your sheets were viewed', icon: Eye },
    { label: 'Total Downloads', value: String(userSheets.reduce((acc, s) => acc + s.downloads, 0)), sub: 'times your sheets were downloaded', icon: Download },
  ];

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Dashboard</h1>
          <p className={textSecondary}>Here's an overview of your music sanctuary.</p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateCollections && (
            <button
              onClick={onNavigateCollections}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 border font-semibold rounded-lg transition-all active:scale-95 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <BookOpen size={18} />
              Collections
            </button>
          )}
          <button
            onClick={onUploadClick}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all shadow-lg active:scale-95 shadow-green-500/10"
          >
            <Upload size={18} />
            Upload Music
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`p-6 rounded-2xl relative overflow-hidden group border ${cardBg}`}>
            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              <stat.icon size={64} />
            </div>
            <p className={`text-sm font-medium mb-4 ${textSecondary}`}>{stat.label}</p>
            <p className={`text-4xl font-bold mb-1 ${textPrimary}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher: My Sheets / Favourites / Requests */}
      <div className={`flex w-fit rounded-xl overflow-hidden border transition-colors p-1 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-200 border-slate-300'}`}>
        <button
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'mine' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <Music size={15} /> My Sheets
        </button>
        <button
          onClick={() => setActiveTab('favourites')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'favourites' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <Heart size={15} /> My Favourites <span className="text-[10px] font-bold ml-0.5">({favoriteSheets.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'requests' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <BookOpen size={15} /> My Requests
        </button>
      </div>

      {/* Favourites tab */}
      {activeTab === 'favourites' && (
        <div className="space-y-4">
          {favoriteSheets.length === 0 ? (
            <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
              <Heart size={40} className="mx-auto mb-3 opacity-20" />
              <p>No favourited sheets yet.</p>
              <p className="text-xs mt-1">Tap the heart icon on any sheet to save it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {favoriteSheets.map(sheet => (
                <div key={sheet.id} className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${cardBg}`}>
                  <div className="aspect-[3/4] overflow-hidden relative cursor-pointer" onClick={() => onPreview(sheet)}>
                    <img src={sheet.thumbnailUrl} alt={sheet.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="bg-white text-slate-900 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-1.5">
                        <Eye size={14} /> Preview
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className={`font-bold truncate mb-1 ${textPrimary}`}>{sheet.title}</h3>
                    <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                      <span>{sheet.composer}</span>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
                        <span className="flex items-center gap-1"><Download size={12} /> {sheet.downloads}</span>
                        <span className="flex items-center gap-1"><Heart size={12} /> {sheet.likesCount}</span>
                        <span className="flex items-center gap-1"><MessageSquare size={12} /> {sheet.commentsCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className={`text-sm ${textSecondary}`}>Sheets you've asked the community to upload.</p>
            <button
              onClick={onRequestSheet}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all"
            >
              <BookOpen size={14} /> New Request
            </button>
          </div>
          {requestsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`h-20 rounded-2xl border animate-pulse ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
              ))}
            </div>
          ) : myRequests.length === 0 ? (
            <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
              <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
              <p>No requests yet.</p>
              <p className="text-xs mt-1">Can't find a sheet? Submit a request and the community will help.</p>
              <button
                onClick={onRequestSheet}
                className="mt-4 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all"
              >
                Request a Sheet
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map(req => {
                const statusMap: Record<string, { label: string; cls: string }> = {
                  open:        { label: 'Open',        cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
                  in_progress: { label: 'In Progress', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
                  fulfilled:   { label: 'Fulfilled',   cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
                  closed:      { label: 'Closed',      cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
                };
                const st = statusMap[req.status] ?? statusMap.open;
                return (
                  <div key={req.id} className={`flex items-center gap-4 p-4 border rounded-2xl ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${textPrimary}`}>{req.title}</p>
                      {req.composer && <p className={`text-sm truncate ${textSecondary}`}>{req.composer}</p>}
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      <span className={`flex items-center gap-1 text-sm font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        <ThumbsUp size={13} /> {req.votes_count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Sheets tab */}
      {activeTab === 'mine' && (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className={`text-2xl font-serif font-bold ${textPrimary}`}>My Music Sheets</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by title..."
                className={`border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 w-full sm:w-64 ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
              />
            </div>
            <div className={`flex border rounded-lg overflow-hidden ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}
              >
                <Grid size={16} />
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredSheets.length > 0 ? filteredSheets.map((sheet) => (
              <div key={sheet.id} className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${selectedIds.has(sheet.id) ? 'ring-2 ring-green-500' : ''} ${cardBg}`}>
                <div
                  className="aspect-[3/4] overflow-hidden relative cursor-pointer"
                  onClick={() => onPreview(sheet)}
                >
                  {/* Checkbox overlay */}
                  <button
                    onClick={(e) => toggleSelect(sheet.id, e)}
                    aria-label="Select sheet"
                    className={`absolute top-2 left-2 z-20 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(sheet.id) ? 'bg-green-500 border-green-500' : 'bg-black/40 border-white/50 opacity-0 group-hover:opacity-100'} ${selectedIds.size > 0 ? 'opacity-100' : ''}`}
                  >
                    {selectedIds.has(sheet.id) && <Check size={11} className="text-white" />}
                  </button>
                  <img src={sheet.thumbnailUrl} alt={sheet.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  
                  {/* Badge moved to top-left to avoid overlap with menu dots on mobile */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start group-hover:opacity-0 transition-opacity">
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-lg ${sheet.isPublic ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {sheet.isPublic ? 'Public' : 'Private'}
                    </div>
                  </div>

                  {/* Mobile Trigger Button: Swapped to top-right to match standard UX patterns */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMobileMenuId(activeMobileMenuId === sheet.id ? null : sheet.id);
                    }}
                    aria-label="More actions"
                    className="md:hidden absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
                  >
                    <MoreVertical size={16} />
                  </button>

                  <div className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col p-4 ${activeMobileMenuId === sheet.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {/* Action buttons moved to the center of the card to clear corner controls */}
                    <div className="flex-1 flex items-center justify-center gap-4 transform -translate-y-2 group-hover:translate-y-0 transition-transform delay-75">
                      <button
                        type="button"
                        onClick={(e) => toggleVisibility(e, sheet)}
                        aria-label={sheet.isPublic ? 'Make private' : 'Make public'}
                        className={`p-3 rounded-full backdrop-blur-md border border-white/20 text-white transition-all hover:scale-110 active:scale-90 ${sheet.isPublic ? 'bg-blue-500/40 hover:bg-blue-500' : 'bg-slate-700/40 hover:bg-slate-700'}`}
                        title={sheet.isPublic ? "Make Private" : "Make Public"}
                      >
                        {sheet.isPublic ? <Lock size={20} /> : <Globe size={20} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleEdit(e, sheet)}
                        aria-label="Edit sheet"
                        className="p-3 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white hover:bg-green-500 transition-all hover:scale-110 active:scale-90"
                        title="Edit"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, sheet)}
                        aria-label="Delete sheet"
                        className="p-3 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white hover:bg-red-500 transition-all hover:scale-110 active:scale-90"
                        title="Delete"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDownload(e, sheet)}
                        aria-label={`Download ${sheet.title}`}
                        className="w-full py-2.5 bg-green-500 text-white text-sm font-bold rounded-xl transform translate-y-2 group-hover:translate-y-0 transition-transform shadow-lg active:scale-95 flex items-center justify-center gap-2 hover:bg-green-600"
                      >
                        <Download size={18} />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className={`font-bold truncate mb-1 ${textPrimary}`}>
                    {sheet.title}
                  </h3>
                  <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                    <span>{sheet.composer}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
                      <span className="flex items-center gap-1"><Download size={12} /> {sheet.downloads}</span>
                      <span className="flex items-center gap-1"><Heart size={12} /> {sheet.likesCount}</span>
                      <span className="flex items-center gap-1"><MessageSquare size={12} /> {sheet.commentsCount}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedSheetForAnalytics(selectedSheetForAnalytics?.id === sheet.id ? null : sheet); }}
                        aria-label="View analytics"
                        className={`p-0.5 transition-colors ${selectedSheetForAnalytics?.id === sheet.id ? 'text-green-500' : 'hover:text-green-500'}`}
                        title="Analytics"
                      >
                        <BarChart2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-20 text-center text-slate-500 border-2 border-dashed rounded-3xl border-slate-800/50">
                <Music size={48} className="mx-auto mb-4 opacity-20" />
                <p>No music sheets found in your collection.</p>
              </div>
            )}
          </div>
        ) : (
          <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px] md:min-w-full">
                <thead className={darkMode ? 'bg-slate-950/50' : 'bg-slate-50'}>
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-3 py-4 w-10">
                      <button
                        onClick={() => setSelectedIds(prev => prev.size === filteredSheets.length ? new Set() : new Set(filteredSheets.map(s => s.id)))}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.size > 0 ? 'bg-green-500 border-green-500' : darkMode ? 'border-slate-600' : 'border-slate-300'}`}
                        aria-label="Select all"
                      >
                        {selectedIds.size > 0 && selectedIds.size === filteredSheets.length && <Check size={9} className="text-white" />}
                      </button>
                    </th>
                    <th className="px-4 md:px-6 py-4">Sheet</th>
                    <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('title')}>
                      <div className="flex items-center">Title <SortIcon colKey="title" /></div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4">Visibility</th>
                    <th className="hidden md:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('fileSize')}>
                      <div className="flex items-center">Size <SortIcon colKey="fileSize" /></div>
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('views')}>
                      <div className="flex justify-center items-center">Views <SortIcon colKey="views" /></div>
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('downloads')}>
                      <div className="flex justify-center items-center">Downloads <SortIcon colKey="downloads" /></div>
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-center" title="Likes"><div className="flex justify-center"><Heart size={12} /></div></th>
                    <th className="hidden md:table-cell px-6 py-4 text-center" title="Comments"><div className="flex justify-center"><MessageSquare size={12} /></div></th>
                    <th className="px-4 md:px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {filteredSheets.map(sheet => (
                    <tr key={sheet.id} className={`transition-colors ${selectedIds.has(sheet.id) ? (darkMode ? 'bg-green-500/5' : 'bg-green-50') : (darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50')}`}>
                      <td className="px-3 py-4">
                        <button
                          onClick={(e) => toggleSelect(sheet.id, e)}
                          aria-label="Select"
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(sheet.id) ? 'bg-green-500 border-green-500' : darkMode ? 'border-slate-600' : 'border-slate-300'}`}
                        >
                          {selectedIds.has(sheet.id) && <Check size={9} className="text-white" />}
                        </button>
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <button
                          type="button"
                          onClick={() => onPreview(sheet)}
                          className="relative overflow-hidden rounded border border-slate-700 active:scale-95 transition-transform group/img"
                        >
                          <img src={sheet.thumbnailUrl} className="w-10 h-10 object-cover" alt="" />
                          <div className="absolute inset-0 bg-green-500/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye size={14} className="text-white" />
                          </div>
                        </button>
                      </td>
                      <td className={`px-4 md:px-6 py-4 text-sm font-medium cursor-pointer hover:text-green-500 transition-colors ${textPrimary}`} onClick={() => onPreview(sheet)}>
                        {sheet.title}
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sheet.isPublic ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                              {sheet.isPublic ? 'Public' : 'Private'}
                           </span>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500">{sheet.fileSize}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.views}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.downloads}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.likesCount}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.commentsCount}</td>
                      <td className="px-4 md:px-6 py-4 text-right">
                        {/* Added text-white on mobile to dashboard list actions as requested */}
                        <div className="flex items-center justify-end gap-1 max-md:text-white">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedSheetForAnalytics(selectedSheetForAnalytics?.id === sheet.id ? null : sheet); }}
                            aria-label="Analytics"
                            className={`p-2 transition-colors ${selectedSheetForAnalytics?.id === sheet.id ? 'text-green-500' : 'hover:text-green-500'}`}
                            title="Analytics"
                          >
                            <BarChart2 size={16}/>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => toggleVisibility(e, sheet)}
                            aria-label={sheet.isPublic ? 'Make private' : 'Make public'}
                            className={`p-2 transition-colors ${sheet.isPublic ? 'hover:text-amber-500' : 'hover:text-green-500'}`}
                            title={sheet.isPublic ? "Make Private" : "Make Public"}
                          >
                            {sheet.isPublic ? <Lock size={16}/> : <Globe size={16}/>}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDownload(e, sheet)}
                            aria-label={`Download ${sheet.title}`}
                            className="p-2 hover:text-green-500 transition-colors"
                            title="Download"
                          >
                            <Download size={16}/>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleEdit(e, sheet)}
                            aria-label="Edit sheet"
                            className="p-2 hover:text-blue-500 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, sheet)}
                            aria-label="Delete sheet"
                            className="p-2 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Analytics panel */}
        {selectedSheetForAnalytics && (
          <AnalyticsPanel
            sheet={selectedSheetForAnalytics}
            darkMode={darkMode}
            onClose={() => setSelectedSheetForAnalytics(null)}
          />
        )}
      </div>
      )} {/* end activeTab === 'mine' */}

      {/* Floating batch action bar */}
      {selectedIds.size > 0 && (
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-200 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <span className={`text-sm font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-slate-600/30 mx-1" />
          <button
            onClick={() => { const all = filteredSheets.map(s => s.id); setSelectedIds(prev => prev.size === all.length ? new Set() : new Set(all)); }}
            className="text-xs text-slate-500 hover:text-green-500 transition-colors"
          >
            {selectedIds.size === filteredSheets.length ? 'Deselect all' : 'Select all'}
          </button>
          <button
            onClick={() => batchUpdateVisibility(true)}
            className="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white text-xs font-bold rounded-lg transition-all"
          >
            Make Public
          </button>
          <button
            onClick={() => batchUpdateVisibility(false)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Make Private
          </button>
          <button
            onClick={() => setBatchDeleteConfirm(true)}
            className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold rounded-lg transition-all"
          >
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      )}

      {editingSheet && (
        <EditSheetModal
          sheet={editingSheet}
          onClose={() => setEditingSheet(null)}
          onSave={handleUpdateSheet}
          darkMode={darkMode}
          userEmail={userEmail}
        />
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmation && (
        <DeleteConfirmModal
          title={deleteConfirmation.title}
          darkMode={darkMode}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={executeDeletion}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      )}

      {/* Batch delete confirmation */}
      <Modal isOpen={batchDeleteConfirm} onClose={() => setBatchDeleteConfirm(false)} darkMode={darkMode} maxWidth="md">
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="text-red-500" size={32} />
          </div>
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Delete {selectedIds.size} Sheets?</h2>
          <p className={`mb-8 ${textSecondary}`}>This will permanently delete {selectedIds.size} selected sheet{selectedIds.size > 1 ? 's' : ''}. This cannot be undone.</p>
          <div className="flex gap-3">
            <button autoFocus onClick={() => setBatchDeleteConfirm(false)} className={`flex-1 py-3.5 font-bold rounded-xl border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>Cancel</button>
            <button onClick={executeBatchDelete} className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"><Trash2 size={18} /> Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ── Delete confirmation modal ─────────────────────────────────────────────────
interface DeleteConfirmModalProps {
  title: string;
  darkMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  textPrimary: string;
  textSecondary: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ title, darkMode, onCancel, onConfirm, textPrimary, textSecondary }) => {
  return (
    <Modal isOpen={true} onClose={onCancel} darkMode={darkMode} maxWidth="md">
      <div className="p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="text-red-500" size={32} />
        </div>
        <div className="text-center mb-8">
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Confirm Deletion</h2>
          <p className={`${textSecondary}`}>
            Are you sure you want to permanently delete <span className="font-bold text-red-500">{title}</span>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            autoFocus
            onClick={onCancel}
            className={`flex-1 py-3.5 font-bold rounded-xl border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

interface EditSheetModalProps {
  sheet: MusicSheet;
  onClose: () => void;
  onSave: (sheet: MusicSheet) => void;
  darkMode: boolean;
  userEmail: string;
}

const generateThumbnailForEdit = async (pdfFile: File): Promise<Blob> => {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfjsLib = (window as any)['pdfjsLib'];
  if (!pdfjsLib) throw new Error('PDF.js library not found.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 0.7;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: ctx, viewport }).promise;
  await new Promise(r => setTimeout(r, 0));
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Thumbnail generation failed')), 'image/jpeg', 0.75);
  });
};

const formatFileSizeEdit = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const EditSheetModal: React.FC<EditSheetModalProps> = ({ sheet, onClose, onSave, darkMode, userEmail }) => {
  const [formData, setFormData] = useState<MusicSheet>({ ...sheet });
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [showFileInput, setShowFileInput] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setFileError('Please select a valid PDF file.'); return; }
    if (f.size > 10 * 1024 * 1024) { setFileError('File is too large. Maximum allowed size is 10 MB.'); return; }
    setFileError(null);
    setReplaceFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceFile) {
      onSave(formData);
      return;
    }

    setUploading(true);
    try {
      setUploadStatus('Generating thumbnail…');
      const thumbnailBlob = await generateThumbnailForEdit(replaceFile);

      const timestamp = Date.now();
      const fileName = `${timestamp}_${replaceFile.name}`;

      setUploadStatus('Uploading PDF…');
      const { error: pdfError } = await storage
        .from('sheets')
        .upload(`${userEmail}/${fileName}`, replaceFile, { contentType: 'application/pdf', upsert: true });
      if (pdfError) throw pdfError;

      const { data: { publicUrl: pdfUrl } } = storage
        .from('sheets')
        .getPublicUrl(`${userEmail}/${fileName}`);

      setUploadStatus('Uploading thumbnail…');
      const thumbName = `${timestamp}_thumb.jpg`;
      const { error: thumbError } = await storage
        .from('thumbnails')
        .upload(`${userEmail}/${thumbName}`, thumbnailBlob, { contentType: 'image/jpeg', upsert: true });
      if (thumbError) throw thumbError;

      const { data: { publicUrl: thumbnailUrl } } = storage
        .from('thumbnails')
        .getPublicUrl(`${userEmail}/${thumbName}`);

      setUploadStatus('Saving…');
      onSave({
        ...formData,
        pdfUrl,
        thumbnailUrl,
        fileSize: formatFileSizeEdit(replaceFile.size),
      });
    } catch (err: any) {
      console.error('Re-upload error:', err);
      alert('File upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} darkMode={darkMode} maxWidth="xl" loading={uploading}>
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <Edit2 className="text-green-500" size={20} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>Edit Music Sheet</h2>
              <p className={`text-sm ${textSecondary}`}>Update the details for this piece in the sanctuary.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} aria-label="Close edit modal" className="text-slate-400 hover:text-green-500 transition-colors disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <form className="p-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            />
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Composed by</label>
            <input
              type="text"
              required
              value={formData.composer}
              onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
              className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            />
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Music Type</label>
            <select
              value={formData.type.toLowerCase()}
              onChange={(e) => setFormData({ ...formData, type: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) })}
              className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all appearance-none cursor-pointer ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            >
              <option value="classical">Classical</option>
              <option value="liturgical">Liturgical</option>
              <option value="choral">Choral</option>
              <option value="contemporary">Contemporary</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sheet Music File</label>
            {!showFileInput && !replaceFile ? (
              <div className={`rounded-lg p-4 border flex items-center justify-between gap-4 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-900' : 'bg-white border border-slate-200'}`}>
                    <Check className="text-green-500" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{formData.title}.pdf</p>
                    <p className="text-xs text-slate-500">{formData.fileSize} · exists on server</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFileInput(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 text-green-500 border-green-500/30 hover:bg-green-500/10"
                >
                  <RefreshCw size={13} /> Replace file
                </button>
              </div>
            ) : replaceFile ? (
              <div className={`rounded-lg p-4 border flex items-center justify-between gap-4 ${darkMode ? 'bg-green-500/5 border-green-500/30' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <FileText className="text-green-500" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${textPrimary}`}>{replaceFile.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSizeEdit(replaceFile.size)} · new file selected</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setReplaceFile(null); setShowFileInput(false); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className={`w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-green-500/10 file:text-green-500 hover:file:bg-green-500/20 transition-all cursor-pointer ${textSecondary}`}
                />
                <button type="button" onClick={() => setShowFileInput(false)} className={`text-xs ${textSecondary} hover:text-green-500 transition-colors`}>
                  Cancel replacement
                </button>
                {fileError && <p className="text-xs text-red-500">{fileError}</p>}
              </div>
            )}
          </div>

          <div className={`p-4 rounded-xl border flex items-center justify-between ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-inner'}`}>
            <div>
              <p className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Make Public</p>
              <p className="text-xs text-slate-500">Allow anyone to view and download this sheet music.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              />
              <div className="w-11 h-6 bg-slate-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:opacity-70 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 shadow-green-500/20 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {uploadStatus || 'Uploading…'}
              </>
            ) : 'Save Changes'}
          </button>
        </form>
    </Modal>
  );
};

export default Dashboard;
