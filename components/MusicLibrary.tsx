import { Search, List, Grid, Eye, Download, Music as MusicIcon, ArrowUp, ArrowDown, SearchX, Heart, MessageSquare, BookOpen, Plus } from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { MusicSheet, SheetRequest } from '../types';
import { db } from '../supabase';
import RequestCard from './RequestCard';

interface MusicLibraryProps {
  darkMode: boolean;
  initialSearch?: string;
  onPreview: (sheet: MusicSheet) => void;
  sheets: MusicSheet[];
  currentUserId?: string;
  userFavorites?: string[];
  onFavoritesChange?: (favs: string[]) => void;
  onAuthRequired?: () => void;
  onViewProfile?: (email: string) => void;
  /** Open RequestModal pre-filled */
  onRequestSheet?: (prefillTitle?: string) => void;
  /** Open upload modal pre-filled for fulfilling a request */
  onFulfillRequest?: (req: SheetRequest) => void;
  /** Initial tab: 'sheets' | 'requests' */
  initialTab?: 'sheets' | 'requests';
}

type LibTab = 'sheets' | 'requests';

type SortConfig = { key: keyof MusicSheet; direction: 'asc' | 'desc' } | null;

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isNewThisWeek(uploadedAt: string): boolean {
  try {
    const d = new Date(uploadedAt);
    return !isNaN(d.getTime()) && Date.now() - d.getTime() < ONE_WEEK_MS;
  } catch { return false; }
}

// Extracted for performance optimization with memoization
const SheetCard = memo(({ sheet, onPreview, activeMobileMenuId, setActiveMobileMenuId, darkMode, isFavorited, onToggleFavorite }: {
  sheet: MusicSheet;
  onPreview: (s: MusicSheet) => void;
  activeMobileMenuId: string | null;
  setActiveMobileMenuId: (id: string | null) => void;
  darkMode: boolean;
  isFavorited: boolean;
  onToggleFavorite: (sheet: MusicSheet) => void;
}) => {
  const tableBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const isNew = isNewThisWeek(sheet.uploadedAt);

  const isActive = activeMobileMenuId === sheet.id;

  // ── Long-press detection ─────────────────────────────────────────────────
  // Industry standard mobile equivalent of hover: a ~350ms press-and-hold
  // reveals the same action overlay that desktop hover shows.
  // Used by Spotify, Apple Music, Pinterest, and Google Photos for cards.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handleTouchStart = () => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      // Subtle haptic pulse where supported (Android Chrome, some iOS)
      if (navigator.vibrate) navigator.vibrate(10);
      setActiveMobileMenuId(sheet.id);
    }, 350);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Unified click/tap handler
  const handleClick = () => {
    // If the long-press just fired, the overlay is opening — swallow the
    // synthetic click so it doesn't immediately dismiss what we just showed.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (isActive) {
      setActiveMobileMenuId(null); // Tap active card again → dismiss overlay
    } else {
      onPreview(sheet);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${tableBg}`}>
      <div
        className="aspect-[3/4] overflow-hidden relative cursor-pointer select-none"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}  // Finger moved = user is scrolling, not pressing
        onContextMenu={(e) => e.preventDefault()} // Block browser's native long-press menu
      >
        <img
          src={sheet.thumbnailUrl}
          alt={sheet.title}
          draggable={false}
          className={`w-full h-full object-cover transition-transform duration-500 ${isActive ? 'scale-105' : 'group-hover:scale-105'}`}
        />

        {/* NEW badge */}
        {isNew && (
          <div className="absolute top-2 left-2 pointer-events-none z-10">
            <span className="bg-green-500 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">NEW</span>
          </div>
        )}

        {/* Heart favourite button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(sheet); }}
          aria-label={isFavorited ? 'Remove from favourites' : 'Add to favourites'}
          title={isFavorited ? 'Remove from favourites' : 'Add to favourites'}
          className={`absolute top-2 right-2 z-10 p-1.5 rounded-full backdrop-blur-sm transition-all ${isFavorited ? 'bg-rose-500 text-white' : 'bg-black/40 text-white/70 hover:text-rose-400'}`}
        >
          <Heart size={14} className={isFavorited ? 'fill-current' : ''} />
        </button>

        {/* Action overlay — shown on desktop hover OR mobile long-press */}
        <div className={`absolute inset-0 bg-black/60 transition-opacity duration-300 flex flex-col justify-end p-4 gap-2 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(sheet); }}
            className="w-full py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Eye size={18} />
            Open Sheet
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const filename = `${sheet.title} - ${sheet.composer}.pdf`.replace(/[\\/:*?"<>|]/g, '_').trim();
              try {
                const resp = await fetch(sheet.pdfUrl);
                if (!resp.ok) throw new Error();
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch { window.open(sheet.pdfUrl, '_blank'); }
            }}
            aria-label={`Download ${sheet.title}`}
            className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-slate-950 text-sm font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
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
            <span className="flex items-center gap-1"><Heart size={12} /> {sheet.likesCount}</span>
            <span className="flex items-center gap-1"><MessageSquare size={12} /> {sheet.commentsCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

type TypeFilter = 'All' | 'Classical' | 'Liturgical' | 'Choral' | 'Contemporary';
type SortOption = 'newest' | 'views' | 'downloads' | 'az';

const PAGE_SIZE = 24;

const mapSheet = (s: Record<string, unknown>): MusicSheet => ({
  id: s.id as string,
  title: s.title as string,
  composer: s.composer as string,
  type: s.type as string,
  uploadedAt: s.uploaded_at ? new Date(s.uploaded_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
  fileSize: s.file_size as string,
  views: (s.views as number) ?? 0,
  downloads: (s.downloads as number) ?? 0,
  commentsCount: (s.comments_count as number) ?? 0,
  likesCount: (s.likes_count as number) ?? 0,
  isPublic: s.is_public as boolean,
  isAdminRestricted: (s.is_admin_restricted as boolean) ?? false,
  thumbnailUrl: s.thumbnail_url as string,
  pdfUrl: s.pdf_url as string,
  uploadedBy: s.uploaded_by as string,
});

const MusicLibrary: React.FC<MusicLibraryProps> = ({ darkMode, initialSearch = '', onPreview, sheets, currentUserId, userFavorites = [], onFavoritesChange, onAuthRequired, onViewProfile, onRequestSheet, onFulfillRequest, initialTab = 'sheets' }) => {
  const [libTab, setLibTab] = useState<LibTab>(initialTab);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [serverSheets, setServerSheets] = useState<MusicSheet[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Requests tab state ──────────────────────────────────────────────────────
  const [requests, setRequests] = useState<SheetRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsSort, setRequestsSort] = useState<'votes' | 'newest'>('votes');

  const fetchRequests = async () => {
    setRequestsLoading(true);
    try {
      const { data } = await db
        .from('sheet_requests')
        .select('*')
        .in('status', ['open', 'in_progress'])
        .order(requestsSort === 'votes' ? 'votes_count' : 'created_at', { ascending: false })
        .limit(50);

      let rows = (data ?? []) as SheetRequest[];

      // Annotate voted_by_me & comment counts
      if (currentUserId && rows.length > 0) {
        const ids = rows.map(r => r.id);
        const [votesRes, commentRes] = await Promise.all([
          db.from('request_votes').select('request_id').eq('user_id', currentUserId).in('request_id', ids),
          db.from('request_comments').select('request_id').in('request_id', ids),
        ]);
        const votedSet = new Set((votesRes.data ?? []).map((v: any) => v.request_id));
        const commentCounts: Record<string, number> = {};
        for (const c of (commentRes.data ?? [])) {
          commentCounts[c.request_id] = (commentCounts[c.request_id] ?? 0) + 1;
        }
        rows = rows.map(r => ({ ...r, voted_by_me: votedSet.has(r.id), comments_count: commentCounts[r.id] ?? 0 }));
      }

      setRequests(rows);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (libTab === 'requests') fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libTab, requestsSort, currentUserId]);

  const handleToggleFavorite = async (sheet: MusicSheet) => {
    if (!currentUserId) { onAuthRequired?.(); return; }
    const wasFav = userFavorites.includes(sheet.id);
    const newFavs = wasFav ? userFavorites.filter(id => id !== sheet.id) : [...userFavorites, sheet.id];
    onFavoritesChange?.(newFavs);
    try {
      if (wasFav) {
        await db.from('favorites').delete().eq('user_id', currentUserId).eq('sheet_id', sheet.id);
      } else {
        await db.from('favorites').insert({ user_id: currentUserId, sheet_id: sheet.id });
      }
    } catch {
      onFavoritesChange?.(userFavorites); // rollback
    }
  };

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

  // Debounced server-side search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchTerm.length < 2) {
      setServerSheets(null);
      setIsSearching(false);
      setPage(1);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const term = searchTerm;
      try {
        const { data } = await db
          .from('sheets')
          .select('*')
          .eq('is_public', true)
          .eq('is_admin_restricted', false)
          .or(`title.ilike.%${term}%,composer.ilike.%${term}%`)
          .order('uploaded_at', { ascending: false })
          .limit(100);
        setServerSheets((data || []).map(s => mapSheet(s as Record<string, unknown>)));
        setPage(1);
      } catch {
        setServerSheets(null);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm]);

  // Reset page when filter/sort changes
  useEffect(() => { setPage(1); }, [typeFilter, sortOption, sortConfig]);

  const handleSort = (key: keyof MusicSheet) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Performance Optimization: Memoize filtering and sorting to prevent jank during searching
  const filteredSheets = useMemo(() => {
    // Use server results when available, otherwise filter client-side
    const baseSheets = serverSheets !== null
      ? serverSheets
      : sheets.filter(s => s.isPublic && !s.isAdminRestricted).filter(sheet => {
          const matchesSearch = !searchTerm ||
            sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sheet.composer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sheet.type.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesSearch;
        });

    let result = baseSheets.filter(sheet => {
      const matchesType = typeFilter === 'All' || sheet.type.toLowerCase() === typeFilter.toLowerCase();
      return matchesType;
    });

    // Apply sort option (overrides column sort when set)
    if (sortOption === 'newest') {
      // default DB order (already sorted by uploadedAt desc from server) — no-op
    } else if (sortOption === 'views') {
      result = [...result].sort((a, b) => b.views - a.views);
    } else if (sortOption === 'downloads') {
      result = [...result].sort((a, b) => b.downloads - a.downloads);
    } else if (sortOption === 'az') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortConfig) {
      const { key, direction } = sortConfig;
      result = [...result].sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (sortOption === 'newest' && sortConfig) {
      const { key, direction } = sortConfig;
      result = [...result].sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [sheets, serverSheets, searchTerm, sortConfig, typeFilter, sortOption]);

  const displayedSheets = filteredSheets.slice(0, page * PAGE_SIZE);

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
          {libTab === 'sheets' && (
            <>
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
            </>
          )}
          {libTab === 'requests' && (
            <button
              onClick={() => onRequestSheet?.()}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95"
            >
              <Plus size={15} /> New Request
            </button>
          )}
        </div>
      </div>

      {/* Lib tab switcher */}
      <div className={`flex w-fit rounded-xl overflow-hidden border transition-colors p-1 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
        <button
          onClick={() => setLibTab('sheets')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${libTab === 'sheets' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <MusicIcon size={14} /> Sheets
        </button>
        <button
          onClick={() => setLibTab('requests')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${libTab === 'requests' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <BookOpen size={14} /> Requests
        </button>
      </div>

      {/* ── REQUESTS TAB ─────────────────────────────────────────────────────── */}
      {libTab === 'requests' && (
        <div className="space-y-6">
          {/* Sort pills */}
          <div className="flex items-center gap-3">
            {(['votes', 'newest'] as const).map(s => (
              <button
                key={s}
                onClick={() => setRequestsSort(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize ${
                  requestsSort === s
                    ? 'bg-amber-500 text-white border-amber-500'
                    : darkMode
                      ? 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400'
                }`}
              >
                {s === 'votes' ? 'Most Voted' : 'Newest'}
              </button>
            ))}
          </div>

          {requestsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`rounded-2xl border h-36 animate-pulse ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-4 text-slate-500">
              <BookOpen size={48} className="opacity-30" />
              <p className="text-base">No open requests yet.</p>
              <button
                onClick={() => onRequestSheet?.()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all"
              >
                Be the first to request a sheet
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map(req => (
                <RequestCard
                  key={req.id}
                  request={req}
                  darkMode={darkMode}
                  currentUserId={currentUserId ?? null}
                  onAuthRequired={onAuthRequired}
                  onFulfill={onFulfillRequest}
                  onVoteChange={(id, count, voted) => {
                    setRequests(prev => prev.map(r => r.id === id ? { ...r, votes_count: count, voted_by_me: voted } : r));
                  }}
                />
              ))}
            </div>
          )}

          <p className={`text-xs text-center pt-2 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
            Can't find what you're looking for?{' '}
            <button onClick={() => onRequestSheet?.()} className="underline text-amber-500 hover:text-amber-600">
              Submit a request
            </button>
          </p>
        </div>
      )}

      {/* ── SHEETS TAB ───────────────────────────────────────────────────────── */}
      {libTab === 'sheets' && (<>

      {/* Search status */}
      {(isSearching || filteredSheets.length > 0) && (
        <div className={`text-sm flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {isSearching ? (
            <><div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> Searching…</>
          ) : (
            <span>Showing {displayedSheets.length} of {filteredSheets.length} sheet{filteredSheets.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Type filter pills + Sort dropdown */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {(['All', 'Classical', 'Liturgical', 'Choral', 'Contemporary'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                typeFilter === t
                  ? 'bg-green-500 text-white border-green-500'
                  : darkMode
                    ? 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={sortOption}
          onChange={e => setSortOption(e.target.value as SortOption)}
          className={`ml-auto border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
        >
          <option value="newest">Newest</option>
          <option value="views">Most Viewed</option>
          <option value="downloads">Most Downloaded</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredSheets.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center gap-4 text-slate-500">
              <SearchX size={48} className="opacity-30" />
              <p className="text-base">No sheets match your search.</p>
              <button
                onClick={() => { setSearchTerm(''); setTypeFilter('All'); }}
                className={`px-5 py-2 rounded-xl border text-sm font-medium transition-colors ${darkMode ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'}`}
              >
                Clear search
              </button>
            </div>
          ) : displayedSheets.map(sheet => (
            <SheetCard
              key={sheet.id}
              sheet={sheet}
              onPreview={onPreview}
              activeMobileMenuId={activeMobileMenuId}
              setActiveMobileMenuId={setActiveMobileMenuId}
              darkMode={darkMode}
              isFavorited={userFavorites.includes(sheet.id)}
              onToggleFavorite={handleToggleFavorite}
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
                  <th className="hidden sm:table-cell px-4 md:px-6 py-4 text-center" title="Likes"><div className="flex justify-center items-center"><Heart size={12} /></div></th>
                  <th className="hidden sm:table-cell px-4 md:px-6 py-4 text-center" title="Comments"><div className="flex justify-center items-center"><MessageSquare size={12} /></div></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {filteredSheets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20">
                      <div className="flex flex-col items-center gap-4 text-slate-500">
                        <SearchX size={40} className="opacity-30" />
                        <p>No sheets match your search.</p>
                        <button
                          onClick={() => { setSearchTerm(''); setTypeFilter('All'); }}
                          className={`px-5 py-2 rounded-xl border text-sm font-medium transition-colors ${darkMode ? 'border-slate-700 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'}`}
                        >
                          Clear search
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : displayedSheets.map((sheet) => (
                  <tr key={sheet.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                    {visibleColumns.title && (
                      <td className="px-4 md:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button onClick={() => onPreview(sheet)} className="flex items-center gap-3 text-left group/title active:scale-[0.98] transition-transform flex-1 min-w-0">
                            <img src={sheet.thumbnailUrl} className="w-10 h-10 object-cover rounded border border-slate-700/50 shrink-0" alt="" />
                            <span className={`font-medium group-hover/title:text-green-500 transition-colors truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{sheet.title}</span>
                          </button>
                          {isNewThisWeek(sheet.uploadedAt) && (
                            <span className="bg-green-500 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0">NEW</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(sheet); }}
                            aria-label={userFavorites.includes(sheet.id) ? 'Remove from favourites' : 'Add to favourites'}
                            className={`shrink-0 p-1 transition-colors ${userFavorites.includes(sheet.id) ? 'text-rose-500' : darkMode ? 'text-slate-600 hover:text-rose-400' : 'text-slate-300 hover:text-rose-500'}`}
                          >
                            <Heart size={14} className={userFavorites.includes(sheet.id) ? 'fill-current' : ''} />
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.composer && <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500">{sheet.composer}</td>}
                    {visibleColumns.type && (<td className="hidden lg:table-cell px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{sheet.type}</span></td>)}
                    {visibleColumns.uploadedAt && <td className="hidden xl:table-cell px-6 py-4 text-sm text-slate-500">{sheet.uploadedAt}</td>}
                    {visibleColumns.views && <td className="px-4 md:px-6 py-4 text-sm text-slate-500 text-center">{sheet.views}</td>}
                    <td className="hidden sm:table-cell px-4 md:px-6 py-4 text-sm text-slate-500 text-center">{sheet.likesCount}</td>
                    <td className="hidden sm:table-cell px-4 md:px-6 py-4 text-sm text-slate-500 text-center">{sheet.commentsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load More */}
      {filteredSheets.length > page * PAGE_SIZE && (
        <div className="flex flex-col items-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => p + 1)}
            className="px-8 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-95"
          >
            Load more sheets
          </button>
          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Showing {displayedSheets.length} of {filteredSheets.length}
          </p>
        </div>
      )}

      <p className={`text-xs text-center pt-2 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
        Can't find what you need?{' '}
        <button onClick={() => setLibTab('requests')} className="underline text-amber-500 hover:text-amber-600">
          Browse or submit requests
        </button>
      </p>
      </>)} {/* end libTab === 'sheets' */}
    </div>
  );
};

export default MusicLibrary;