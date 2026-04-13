import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Home, LayoutDashboard, ShieldAlert, Music, Upload, Info, Download, X, Smartphone, LogIn, BookOpen, HelpCircle } from 'lucide-react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import MusicLibrary from './components/MusicLibrary';
import AdminDashboard from './components/AdminDashboard';
import AboutPage from './components/AboutPage';
import UploadModal from './components/UploadModal';
import AuthModal from './components/AuthModal';
import FullPreviewPage from './components/FullPreviewPage';
import ProfilePage from './components/ProfilePage';
import CollectionsPage from './components/CollectionsPage';
import OnboardingTour from './components/OnboardingTour';
import UpdateBanner from './components/UpdateBanner';
import HelpPage from './components/HelpPage';
import { useKeyboardShortcuts, ShortcutsOverlay } from './components/KeyboardShortcuts';
import { View, MusicSheet } from './types';
import { supabase, auth, db } from './supabase';
import { useTheme } from './contexts/ThemeContext';

interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

interface RawSheetRow {
  id: string;
  title: string;
  composer: string;
  type: string;
  uploaded_at: string | null;
  file_size: string;
  views: number;
  downloads: number;
  is_public: boolean;
  is_admin_restricted: boolean;
  thumbnail_url: string;
  pdf_url: string;
  uploaded_by: string;
}

const App: React.FC = () => {
  const { darkMode, toggleTheme } = useTheme();
  const [currentView, setCurrentView] = useState<View>('home');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreview, setActivePreview] = useState<MusicSheet | null>(null);
  const [sheets, setSheets] = useState<MusicSheet[]>([]);
  
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: 'admin' | 'user'; emailVerified: boolean; displayName?: string } | null>(null);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [profileEmail, setProfileEmail] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('solfa-onboarded'));
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Guards onAuthStateChange from firing before getSession() resolves.
  const authReadyRef = useRef(false);
  // Tracks the last sheet query key to skip redundant re-fetches.
  const lastQueryKeyRef = useRef<string>('');


  // Deep linking logic: Check for sheet/collection ID in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sheetId = params.get('sheet');
    const collectionId = params.get('collection');
    if (sheetId) {
      const fetchDeepLinkedSheet = async () => {
        try {
          const { data, error } = await db
            .from('sheets')
            .select('*')
            .eq('id', sheetId)
            .single();

          if (data && !error) {
            // Apply the same snake_case → camelCase mapping as fetchSheets
            const mappedSheet: MusicSheet = {
              ...data,
              uploadedAt: data.uploaded_at ? new Date(data.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
              fileSize: data.file_size,
              isPublic: data.is_public,
              isAdminRestricted: data.is_admin_restricted,
              thumbnailUrl: data.thumbnail_url,
              pdfUrl: data.pdf_url,
              uploadedBy: data.uploaded_by
            };
            setActivePreview(mappedSheet);
          }
        } catch (error) {
          console.error("Error fetching deep-linked sheet:", error);
        }
      };
      fetchDeepLinkedSheet();
    }
    if (collectionId) {
      setCurrentView('collections');
    }
  }, []);

  // Sync activePreview state with URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activePreview) {
      url.searchParams.set('sheet', activePreview.id);
    } else {
      url.searchParams.delete('sheet');
    }
    window.history.replaceState({}, '', url.toString());
  }, [activePreview]);

  // Converts a raw DB row to the MusicSheet shape the UI expects.
  const mapSheet = (s: RawSheetRow): MusicSheet => ({
    ...s,
    uploadedAt: s.uploaded_at
      ? new Date(s.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '',
    fileSize: s.file_size,
    isPublic: s.is_public,
    isAdminRestricted: s.is_admin_restricted,
    thumbnailUrl: s.thumbnail_url,
    pdfUrl: s.pdf_url,
    uploadedBy: s.uploaded_by,
  });

  // Builds the correct query for the current view + user combination.
  // Returns { query, key } — key is a stable string that changes only when
  // the query shape changes, preventing redundant re-fetches.
  const buildQuery = useCallback(() => {
    const isAdmin  = currentView === 'admin'     && currentUser?.role === 'admin';
    const isDash   = currentView === 'dashboard' && !!currentUser;
    const key = isAdmin ? 'admin' : isDash ? `dash:${currentUser!.email}` : 'public';
    let q = db.from('sheets').select('*').order('uploaded_at', { ascending: false });
    if (isDash) q = q.eq('uploaded_by', currentUser!.email);
    else if (!isAdmin) q = q.eq('is_public', true);
    return { query: q, key };
  }, [currentView, currentUser]);

  const fetchSheets = useCallback(async () => {
    const { query, key } = buildQuery();
    const { data, error } = await query;
    if (error) { console.error('Supabase fetch error:', error); return; }
    lastQueryKeyRef.current = key;
    setSheets((data || []).map(mapSheet));
  }, [buildQuery]);

  // ── Mount: kick off public sheets immediately, don't wait for auth.
  // This is the primary speed-up: sheets appear in ~100–300 ms instead of
  // waiting for two sequential network calls (auth then sheets).
  useEffect(() => {
    fetchSheets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Re-fetch when the query shape changes (view switch or login/logout).
  // Skips the redundant initial fetch by comparing the query key.
  useEffect(() => {
    const { key } = buildQuery();
    if (key === lastQueryKeyRef.current) return; // same query, nothing to do
    fetchSheets();
  }, [buildQuery, fetchSheets]);

  // ── Realtime: keep sheets in sync with DB changes.
  useEffect(() => {
    const channel = supabase
      .channel('public:sheets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sheets' }, () => {
        fetchSheets();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // Only re-subscribe if fetchSheets identity changes (i.e. view/user changed).
  }, [fetchSheets]);

  // ─── AUTH ────────────────────────────────────────────────────────────────────
  // Fetch user's favorites from DB
  const fetchUserFavorites = useCallback(async (userId: string) => {
    try {
      const { data } = await db
        .from('favorites')
        .select('sheet_id')
        .eq('user_id', userId);
      setUserFavorites((data || []).map((r: { sheet_id: string }) => r.sheet_id));
    } catch {
      setUserFavorites([]);
    }
  }, []);

  // Load role from profiles table, fall back to email-based heuristic.
  const resolveUser = useCallback(async (user: SupabaseUser | null) => {
    if (!user?.email) { setCurrentUser(null); setUserFavorites([]); return; }
    try {
      const { data: profile } = await db
        .from('profiles')
        .select('role, display_name')
        .eq('id', user.id)
        .maybeSingle();
      setCurrentUser({
        id: user.id,
        email: user.email,
        role: (profile?.role ?? (user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user')) as 'admin' | 'user',
        emailVerified: !!user.email_confirmed_at,
        displayName: profile?.display_name ?? undefined,
      });
      fetchUserFavorites(user.id);
    } catch {
      setCurrentUser({
        id: user.id,
        email: user.email,
        role: user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user',
        emailVerified: !!user.email_confirmed_at,
      });
    }
  }, [fetchUserFavorites]);

  useEffect(() => {
    // getSession() is the single source of truth on mount.
    // We call it once, set user state, then open the gate for data fetching.
    // onAuthStateChange handles live updates (sign-in, sign-out) after that.
    let cancelled = false;

    auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      resolveUser(session?.user ?? null).finally(() => {
        if (!cancelled) {
          authReadyRef.current = true;
        }
      });
    });

    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      if (!authReadyRef.current) return; // ignore events before initial session resolves
      if (event === 'SIGNED_IN') {
        setIsAuthModalOpen(false);
        resolveUser(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      } else if (event === 'TOKEN_REFRESHED') {
        resolveUser(session?.user ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [resolveUser]);
  // ─────────────────────────────────────────────────────────────────────────────

  const handleOpenLogin = () => { setIsAuthModalOpen(true); };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserFavorites([]);
    setCurrentView('home');
    setActivePreview(null);
    setIsAuthModalOpen(false);
    auth.signOut().catch(() => {});
  };

  const handleViewProfile = (email: string) => {
    setProfileEmail(email);
    setCurrentView('profile');
    setActivePreview(null);
  };

  const handleHomeSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentView('library');
  };

  const handlePreview = (sheet: MusicSheet) => {
    setActivePreview(sheet);
  };

  useEffect(() => {
    if (!currentUser && (currentView === 'dashboard' || currentView === 'admin')) {
      setCurrentView('home');
    }
    if (currentUser && currentUser.role !== 'admin' && currentView === 'admin') {
      setCurrentView('home');
    }
  }, [currentUser, currentView]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  const { showOverlay: shortcutsFromHook, setShowOverlay: setShortcutsFromHook } = useKeyboardShortcuts({
    onEscape: () => {
      setActivePreview(null);
      setIsAuthModalOpen(false);
      setIsUploadModalOpen(false);
    },
    focusSearch: () => {
      (document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null)?.focus();
    },
    previewOpen: !!activePreview,
  });

  // Merge hook-internal overlay state with the external showShortcuts state
  const isShortcutsOpen = showShortcuts || shortcutsFromHook;
  const handleCloseShortcuts = () => {
    setShowShortcuts(false);
    setShortcutsFromHook(false);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <LandingPage
            onUploadClick={currentUser ? () => setIsUploadModalOpen(true) : handleOpenLogin}
            onBrowseClick={() => { setSearchQuery(''); setCurrentView('library'); }}
            onSearch={handleHomeSearch}
            onPreview={handlePreview}
            isLoggedIn={!!currentUser}
            darkMode={darkMode}
            sheets={sheets}
            currentUserId={currentUser?.id}
            userFavorites={userFavorites}
            onFavoritesChange={setUserFavorites}
            onAuthRequired={() => setIsAuthModalOpen(true)}
            onViewProfile={handleViewProfile}
          />
        );
      case 'dashboard':
        return currentUser ? (
          <Dashboard
            onUploadClick={() => setIsUploadModalOpen(true)}
            onPreview={handlePreview}
            darkMode={darkMode}
            sheets={sheets}
            userEmail={currentUser.email}
            userId={currentUser.id}
            onSheetDeleted={(id) => setSheets(prev => prev.filter(s => s.id !== id))}
            onSheetUpdated={(sheet) => setSheets(prev => prev.map(s => s.id === sheet.id ? sheet : s))}
            userFavorites={userFavorites}
            onFavoritesChange={setUserFavorites}
            onNavigateCollections={() => setCurrentView('collections')}
          />
        ) : null;
      case 'library':
        return (
          <MusicLibrary
            darkMode={darkMode}
            initialSearch={searchQuery}
            onPreview={handlePreview}
            sheets={sheets}
            currentUserId={currentUser?.id}
            userFavorites={userFavorites}
            onFavoritesChange={setUserFavorites}
            onAuthRequired={() => setIsAuthModalOpen(true)}
            onViewProfile={handleViewProfile}
          />
        );
      case 'admin':
        return currentUser?.role === 'admin' ? (
          <AdminDashboard
            onPreview={handlePreview}
            darkMode={darkMode}
            sheets={sheets}
            onRefresh={fetchSheets}
            onSheetDeleted={(id) => setSheets(prev => prev.filter(s => s.id !== id))}
            onSheetUpdated={(sheet) => setSheets(prev => prev.map(s => s.id === sheet.id ? sheet : s))}
          />
        ) : null;
      case 'about':
        return <AboutPage darkMode={darkMode} />;
      case 'help':
        return <HelpPage darkMode={darkMode} />;
      case 'collections':
        return currentUser ? (
          <CollectionsPage
            darkMode={darkMode}
            currentUserId={currentUser.id}
            currentUserEmail={currentUser.email}
            onPreview={handlePreview}
          />
        ) : null;
      case 'profile':
        return (
          <ProfilePage
            email={profileEmail}
            sheets={sheets}
            currentUserEmail={currentUser?.email}
            darkMode={darkMode}
            onPreview={handlePreview}
          />
        );
      default:
        return <LandingPage
          onUploadClick={currentUser ? () => setIsUploadModalOpen(true) : handleOpenLogin}
          onBrowseClick={() => { setSearchQuery(''); setCurrentView('library'); }}
          onSearch={handleHomeSearch}
          onPreview={handlePreview}
          isLoggedIn={!!currentUser}
          darkMode={darkMode}
          sheets={sheets}
          currentUserId={currentUser?.id}
          userFavorites={userFavorites}
          onFavoritesChange={setUserFavorites}
          onAuthRequired={() => setIsAuthModalOpen(true)}
          onViewProfile={handleViewProfile}
        />;
    }
  };

  const themeClasses = darkMode 
    ? "bg-slate-950 text-slate-100" 
    : "bg-slate-50 text-slate-900";

  return (
    <div className={`min-h-screen transition-colors duration-300 selection:bg-green-500/30 selection:text-green-200 font-sans ${themeClasses}`}>
      <UpdateBanner darkMode={darkMode} />
      {activePreview ? (
        <FullPreviewPage
          sheet={activePreview}
          darkMode={darkMode}
          onThemeToggle={toggleTheme}
          onClose={() => setActivePreview(null)}
          isLoggedIn={!!currentUser}
          onAuthRequired={() => setIsAuthModalOpen(true)}
          currentUserId={currentUser?.id}
          currentUserEmail={currentUser?.email}
          currentUserDisplayName={currentUser?.displayName ?? undefined}
          userFavorites={userFavorites}
          onFavoritesChange={setUserFavorites}
          onViewProfile={handleViewProfile}
          sheets={sheets}
          onPreview={handlePreview}
          onNavigateCollections={() => { setCurrentView('collections'); setActivePreview(null); }}
        />
      ) : (
        <>
          <Navbar
            activeView={currentView}
            onViewChange={(view) => { setCurrentView(view); setActivePreview(null); }}
            currentUser={currentUser}
            onLogout={handleLogout}
            onLogin={handleOpenLogin}
            darkMode={darkMode}
            onThemeToggle={toggleTheme}
            onShowShortcuts={() => { setShowShortcuts(true); }}
          />
          
          <main className="max-w-7xl mx-auto px-4 pt-3 pb-12 lg:py-12 pb-24">
            {renderView()}
          </main>


          {/* Mobile bottom nav — exactly 5 buttons */}
          <div className={`md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t p-2 flex justify-around items-center z-50 ${darkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-slate-200 shadow-lg'}`}>
            {/* 1: Home */}
            <button aria-label="Home" onClick={() => { setCurrentView('home'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'home' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Home size={24} />
            </button>
            {/* 2: Music Library */}
            <button aria-label="Music Library" onClick={() => { setSearchQuery(''); setCurrentView('library'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'library' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Music size={24} />
            </button>
            {/* 3: Upload (logged-in) or About (logged-out) */}
            {currentUser ? (
              <button aria-label="Upload music" onClick={() => setIsUploadModalOpen(true)} className="p-3 bg-green-500 text-slate-950 rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-transform">
                <Upload size={24} />
              </button>
            ) : (
              <button aria-label="About" onClick={() => { setCurrentView('about'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'about' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <Info size={24} />
              </button>
            )}
            {/* 4: Dashboard (logged-in) or Help (logged-out) */}
            {currentUser ? (
              <button aria-label="Dashboard" onClick={() => { setCurrentView('dashboard'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'dashboard' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <LayoutDashboard size={24} />
              </button>
            ) : (
              <button aria-label="Help" onClick={() => { setCurrentView('help'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'help' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <HelpCircle size={24} />
              </button>
            )}
            {/* 5: Admin (admin role) | About (regular user) | Sign In (logged-out) */}
            {currentUser?.role === 'admin' ? (
              <button aria-label="Admin" onClick={() => { setCurrentView('admin'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'admin' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <ShieldAlert size={24} />
              </button>
            ) : currentUser ? (
              <button aria-label="About" onClick={() => { setCurrentView('about'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'about' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <Info size={24} />
              </button>
            ) : (
              <button aria-label="Sign In" onClick={handleOpenLogin} className={`p-3 rounded-xl transition-colors ${darkMode ? 'text-slate-500 hover:text-green-500' : 'text-slate-400 hover:text-green-600'}`}>
                <LogIn size={24} />
              </button>
            )}
          </div>
        </>
      )}

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        darkMode={darkMode}
        userEmail={currentUser?.email || ''}
        isVerified={currentUser?.emailVerified || currentUser?.email === 'solfasanctuary@gmail.com'}
        onSheetUploaded={(sheet) => setSheets(prev => [sheet, ...prev])}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        darkMode={darkMode}
      />

      {showOnboarding && (
        <OnboardingTour
          onComplete={() => setShowOnboarding(false)}
          darkMode={darkMode}
        />
      )}

      {isShortcutsOpen && (
        <ShortcutsOverlay
          darkMode={darkMode}
          onClose={handleCloseShortcuts}
        />
      )}
    </div>
  );
};

export default App;
