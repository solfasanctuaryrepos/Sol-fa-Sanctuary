
import React, { useState, useEffect } from 'react';
import { Upload, Search, Shield, Share2, ArrowRight, Eye, Download, LogIn, Music, Heart, MessageSquare, BookOpen, ThumbsUp, Star, WifiOff, Layers } from 'lucide-react';
import { MusicSheet, SheetRequest } from '../types';
import { db } from '../supabase';

interface LandingPageProps {
  onUploadClick: () => void;
  onBrowseClick: () => void;
  onSearch: (query: string) => void;
  onPreview: (sheet: MusicSheet) => void;
  isLoggedIn: boolean;
  darkMode: boolean;
  sheets: MusicSheet[];
  currentUserId?: string;
  userFavorites?: string[];
  onFavoritesChange?: (favs: string[]) => void;
  onAuthRequired?: () => void;
  onViewProfile?: (email: string) => void;
  onRequestSheet?: () => void;
  onBrowseRequests?: () => void;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function isNewThisWeek(uploadedAt: string): boolean {
  try {
    const d = new Date(uploadedAt);
    return !isNaN(d.getTime()) && Date.now() - d.getTime() < ONE_WEEK_MS;
  } catch { return false; }
}

const LandingPage: React.FC<LandingPageProps> = ({ onUploadClick, onBrowseClick, onSearch, onPreview, isLoggedIn, darkMode, sheets, currentUserId, userFavorites = [], onFavoritesChange, onAuthRequired, onRequestSheet, onBrowseRequests }) => {
  const [localSearch, setLocalSearch] = useState('');
  const [topRequests, setTopRequests] = useState<SheetRequest[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await db
        .from('sheet_requests')
        .select('*')
        .in('status', ['open', 'in_progress'])
        .order('votes_count', { ascending: false })
        .limit(5);
      setTopRequests((data ?? []) as SheetRequest[]);
    })();
  }, []);

  const handleToggleFavorite = async (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localSearch.trim()) {
      onSearch(localSearch.trim());
    }
  };

  const publicSheets = sheets
    .filter(s => s.isPublic && !s.isAdminRestricted)
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 4);

  const bgCardClass = darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const textPrimaryClass = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondaryClass = darkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="space-y-24 animate-in fade-in duration-700">
      <section className="flex flex-col lg:flex-row items-center gap-12 pt-2 lg:pt-8">
        <div className="flex-1 space-y-4 lg:space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-bold uppercase tracking-wider">
            <Music size={14} /> The Musician's Choice
          </div>
          <h1 className={`text-6xl font-serif font-bold leading-[1.1] ${textPrimaryClass}`}>
            Your Sanctuary for <span className="text-green-500">Tonic Solfa</span> Music Sheets
          </h1>
          <p className={`text-xl leading-relaxed max-w-xl ${textSecondaryClass}`}>
            Discover, manage, and share Tonic Solfa music sheets with a vibrant community of musicians. Sol-fa Sanctuary is your dedicated platform for professional scores.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              onClick={onUploadClick}
              className="shrink-0 px-8 h-[48px] bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-green-500/20 flex items-center justify-center gap-2 active:scale-95"
            >
              {isLoggedIn ? <Upload size={20} /> : <LogIn size={20} />}
              {isLoggedIn ? 'Upload Music' : 'Get Started'}
            </button>
            <form onSubmit={handleSearchSubmit} className="relative group w-full sm:w-64 lg:w-72">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${darkMode ? 'text-slate-500 group-hover:text-green-500' : 'text-slate-400 group-hover:text-green-600'}`} size={16} />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search sheets…"
                className={`pl-9 pr-9 h-[48px] border rounded-xl focus:outline-none focus:border-green-500 w-full transition-all text-sm ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-green-500 transition-colors">
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
        <div className="flex-1 relative w-full overflow-hidden">
          <div className={`absolute -inset-4 rounded-[40px] blur-3xl opacity-20 ${darkMode ? 'bg-green-500' : 'bg-green-300'}`}></div>
          <div className={`relative aspect-[16/10] rounded-[32px] overflow-hidden border shadow-2xl transition-colors duration-300 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <img 
              src="https://images.unsplash.com/photo-1514119412350-e174d90d280e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" 
              alt="Music Sanctuary" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent"></div>
          </div>
        </div>
      </section>

      <section className="space-y-16">
        <div className="text-center space-y-4">
          <p className="text-green-500 font-bold uppercase tracking-[0.2em] text-sm">Core Features</p>
          <h2 className={`text-4xl font-serif font-bold ${textPrimaryClass}`}>Why You'll Love Sol-fa Sanctuary</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Upload & Publish',
              desc: 'Share your scores with the world in seconds. Upload PDFs, set privacy, and reach musicians globally.',
              icon: Upload,
              accent: 'text-green-500',
              bg: darkMode ? 'bg-green-500/10' : 'bg-green-50',
            },
            {
              title: 'Full PDF Preview',
              desc: 'Crisp, paginated sheet music viewer right in your browser — no downloads needed to sight-read.',
              icon: Eye,
              accent: 'text-blue-500',
              bg: darkMode ? 'bg-blue-500/10' : 'bg-blue-50',
            },
            {
              title: 'Smart Search',
              desc: 'Find any piece instantly by title, composer, or instrument with typo-tolerant fuzzy matching.',
              icon: Search,
              accent: 'text-purple-500',
              bg: darkMode ? 'bg-purple-500/10' : 'bg-purple-50',
            },
            {
              title: 'Community Requests',
              desc: 'Can\'t find a score? Submit a request and vote on what the community should upload next.',
              icon: BookOpen,
              accent: 'text-amber-500',
              bg: darkMode ? 'bg-amber-500/10' : 'bg-amber-50',
            },
            {
              title: 'Collections & Favourites',
              desc: 'Save and organise sheets into personal or shared collections — your digital music cabinet.',
              icon: Layers,
              accent: 'text-rose-500',
              bg: darkMode ? 'bg-rose-500/10' : 'bg-rose-50',
            },
            {
              title: 'Offline Viewing',
              desc: 'Save any sheet to your device and open it anywhere — even with no internet connection.',
              icon: WifiOff,
              accent: 'text-teal-500',
              bg: darkMode ? 'bg-teal-500/10' : 'bg-teal-50',
            },
          ].map((feature, i) => (
            <div key={i} className={`p-7 rounded-3xl border hover:border-green-500/60 transition-all space-y-5 group ${bgCardClass}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${feature.accent} ${feature.bg} group-hover:scale-110 transition-transform`}>
                <feature.icon size={26} />
              </div>
              <h3 className={`text-lg font-bold ${textPrimaryClass}`}>{feature.title}</h3>
              <p className={`leading-relaxed text-sm ${textSecondaryClass}`}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-16">
        <div className="text-center space-y-5 max-w-3xl mx-auto">
          <p className="text-green-500 font-bold uppercase tracking-[0.35em] text-xs">Top Charts</p>
          <h2 className={`text-5xl font-serif font-bold ${textPrimaryClass}`}>Most Downloaded</h2>
          <p className={`text-lg opacity-70 ${textPrimaryClass}`}>Explore the music sheets that our community is loving right now.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {publicSheets.length > 0 ? publicSheets.map(sheet => (
            <div
              key={sheet.id}
              className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col cursor-pointer ${bgCardClass}`}
              onClick={() => onPreview(sheet)}
            >
              <div className="aspect-[3/4] overflow-hidden relative">
                <img src={sheet.thumbnailUrl} alt={sheet.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                {isNewThisWeek(sheet.uploadedAt) && (
                  <div className="absolute top-2 left-2 pointer-events-none z-10">
                    <span className="bg-green-500 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">NEW</span>
                  </div>
                )}
                <button
                  onClick={(e) => handleToggleFavorite(e, sheet)}
                  aria-label={userFavorites.includes(sheet.id) ? 'Remove from favourites' : 'Add to favourites'}
                  className={`absolute top-2 right-2 z-10 p-1.5 rounded-full backdrop-blur-sm transition-all ${userFavorites.includes(sheet.id) ? 'bg-rose-500 text-white' : 'bg-black/40 text-white/70 hover:text-rose-400'}`}
                >
                  <Heart size={14} className={userFavorites.includes(sheet.id) ? 'fill-current' : ''} />
                </button>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white text-slate-900 px-4 py-2 rounded-xl font-bold text-sm shadow-xl flex items-center gap-2">
                    <Eye size={16} /> Preview
                  </div>
                </div>
              </div>
              <div className="p-4">
                <h3 className={`font-bold truncate mb-1 ${textPrimaryClass}`}>{sheet.title}</h3>
                <div className={`flex items-center justify-between text-xs ${textSecondaryClass}`}>
                  <span className="truncate max-w-[100px]">{sheet.composer}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
                    <span className="flex items-center gap-1"><Heart size={12} /> {sheet.likesCount}</span>
                    <span className="flex items-center gap-1"><MessageSquare size={12} /> {sheet.commentsCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center text-slate-500 border-2 border-dashed rounded-3xl border-slate-800/50">
               <Music size={48} className="mx-auto mb-4 opacity-20" />
               <p>No music sheets discovered yet.</p>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <button 
            onClick={onBrowseClick}
            className={`flex items-center gap-2 px-8 py-2.5 border rounded-xl transition-all font-medium ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'}`}
          >
            View Full Library <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Community Wishlist Strip */}
      <section className={`rounded-3xl border p-8 md:p-12 space-y-8 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-amber-50 border-amber-100'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-wider">
              <BookOpen size={13} /> Community Wishlist
            </div>
            <h2 className={`text-2xl font-serif font-bold ${textPrimaryClass}`}>Most Wanted Sheets</h2>
            <p className={`text-sm ${textSecondaryClass}`}>Help the community by uploading one of these requested scores.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={onBrowseRequests}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${darkMode ? 'border-slate-700 text-slate-300 hover:text-white' : 'border-amber-200 text-amber-700 hover:bg-amber-100'}`}
            >
              View all
            </button>
            <button
              onClick={onRequestSheet}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all"
            >
              + Request
            </button>
          </div>
        </div>

        {topRequests.length === 0 ? (
          <p className={`text-sm ${textSecondaryClass}`}>No requests yet — be the first!</p>
        ) : (
          <div className="space-y-3">
            {topRequests.map((req, i) => (
              <div
                key={req.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors cursor-pointer ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-amber-100 hover:border-amber-300 shadow-sm'}`}
                onClick={onBrowseRequests}
              >
                <span className={`text-2xl font-serif font-bold w-8 text-center ${i < 3 ? 'text-amber-500' : textSecondaryClass}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${textPrimaryClass}`}>{req.title}</p>
                  {req.composer && <p className={`text-sm truncate ${textSecondaryClass}`}>{req.composer}</p>}
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 text-sm font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                  <ThumbsUp size={14} /> {req.votes_count}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className={`pt-16 pb-8 border-t text-center ${darkMode ? 'border-slate-900 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
        <p className="text-sm">© 2026 Sol-fa Sanctuary. Designed for Music lovers.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
