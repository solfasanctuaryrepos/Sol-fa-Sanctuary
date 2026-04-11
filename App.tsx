import React, { useState, useEffect, useCallback } from 'react';
import { Home, LayoutDashboard, ShieldAlert, Music, Upload, Info, Download, X, Smartphone } from 'lucide-react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import MusicLibrary from './components/MusicLibrary';
import AdminDashboard from './components/AdminDashboard';
import AboutPage from './components/AboutPage';
import UploadModal from './components/UploadModal';
import AuthModal from './components/AuthModal';
import FullPreviewPage from './components/FullPreviewPage';
import { View, MusicSheet } from './types';
import { supabase, auth, db } from './supabase';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreview, setActivePreview] = useState<MusicSheet | null>(null);
  const [sheets, setSheets] = useState<MusicSheet[]>([]);
  
  const [currentUser, setCurrentUser] = useState<{ email: string; role: 'admin' | 'user'; emailVerified: boolean } | null>(null);
  // Gate that opens after INITIAL_SESSION fires — prevents fetchSheets from running
  // before auth state is known (fixes blank sheets + broken login with stale tokens)
  const [sessionInitialized, setSessionInitialized] = useState(false);


  // Deep linking logic: Check for sheet ID in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sheetId = params.get('sheet');
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

  const fetchSheets = useCallback(async () => {
    let query = db.from('sheets').select('*').order('uploaded_at', { ascending: false });

    if (currentView === 'admin' && currentUser?.role === 'admin') {
      // Admin sees all
    } else if (currentView === 'dashboard' && currentUser) {
      query = query.eq('uploaded_by', currentUser.email);
    } else {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Supabase fetch error:", error);
      return;
    }

    const mappedSheets = (data || []).map((s: any) => ({
      ...s,
      uploadedAt: s.uploaded_at ? new Date(s.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      fileSize: s.file_size,
      isPublic: s.is_public,
      isAdminRestricted: s.is_admin_restricted,
      thumbnailUrl: s.thumbnail_url,
      pdfUrl: s.pdf_url,
      uploadedBy: s.uploaded_by
    }));

    setSheets(mappedSheets as MusicSheet[]);
  }, [currentView, currentUser]);

  useEffect(() => {
    // Don't fetch until we know whether the user is logged in or not.
    // INITIAL_SESSION fires once on startup and sets sessionInitialized = true.
    // This prevents a race where fetchSheets runs with a stale/revoked token
    // and the client gets stuck, leaving sheets blank and blocking re-login.
    if (!sessionInitialized) return;

    fetchSheets();
    const channel = supabase
      .channel('public:sheets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sheets' }, () => {
        fetchSheets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSheets, sessionInitialized]);

  // Helper to set user from a Supabase user object
  const setUserFromSession = async (user: any) => {
    if (!user || !user.email) {
      setCurrentUser(null);
      return;
    }
    try {
      const { data: profile } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role || (user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user');
      setCurrentUser({
        email: user.email,
        role: role as 'admin' | 'user',
        emailVerified: !!user.email_confirmed_at
      });
    } catch {
      setCurrentUser({
        email: user.email,
        role: user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user',
        emailVerified: !!user.email_confirmed_at
      });
    }
  };

  // Single auth listener — handles initial session + sign-in/sign-out.
  // Using INITIAL_SESSION event avoids double getSession() calls in React Strict Mode
  // which caused Web Lock contention warnings.
  useEffect(() => {
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        await setUserFromSession(session?.user ?? null);
        // Unlock data fetching now that auth state is known
        setSessionInitialized(true);
      } else if (event === 'SIGNED_IN') {
        setIsAuthModalOpen(false);
        await setUserFromSession(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);


  const handleOpenLogin = () => {
    setIsAuthModalOpen(true);
  };

  const handleLogout = () => {
    // Use scope:'local' — clears localStorage immediately without a network call or
    // Web Lock. This guarantees the stale token is removed even if the network is
    // slow or the global signOut hangs, which was causing re-login to break.
    auth.signOut({ scope: 'local' }).catch(err => console.error("Supabase signout issue:", err));

    // Instantly update local UI state
    setCurrentUser(null);
    setCurrentView('home');
    setActivePreview(null);
    setIsAuthModalOpen(false);
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
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
          />
        ) : null;
      case 'library':
        return <MusicLibrary darkMode={darkMode} initialSearch={searchQuery} onPreview={handlePreview} sheets={sheets} />;
      case 'admin':
        return currentUser?.role === 'admin' ? (
          <AdminDashboard
            onPreview={handlePreview}
            darkMode={darkMode}
            sheets={sheets}
            onRefresh={fetchSheets}
          />
        ) : null;
      case 'about':
        return <AboutPage darkMode={darkMode} />;
      default:
        return <LandingPage 
          onUploadClick={currentUser ? () => setIsUploadModalOpen(true) : handleOpenLogin} 
          onBrowseClick={() => { setSearchQuery(''); setCurrentView('library'); }} 
          onSearch={handleHomeSearch}
          onPreview={handlePreview}
          isLoggedIn={!!currentUser}
          darkMode={darkMode}
          sheets={sheets}
        />;
    }
  };

  const themeClasses = darkMode 
    ? "bg-slate-950 text-slate-100" 
    : "bg-slate-50 text-slate-900";

  return (
    <div className={`min-h-screen transition-colors duration-300 selection:bg-green-500/30 selection:text-green-200 font-sans ${themeClasses}`}>
      {activePreview ? (
        <FullPreviewPage 
          sheet={activePreview} 
          darkMode={darkMode} 
          onThemeToggle={toggleTheme} 
          onClose={() => setActivePreview(null)}
          isLoggedIn={!!currentUser}
          onAuthRequired={() => setIsAuthModalOpen(true)}
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
          />
          
          <main className="max-w-7xl mx-auto px-4 pt-3 pb-12 lg:py-12 pb-24">
            {renderView()}
          </main>


          <div className={`md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-lg border-t p-2 flex justify-around items-center z-50 ${darkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-slate-200 shadow-lg'}`}>
            <button onClick={() => { setCurrentView('home'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'home' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Home size={24} />
            </button>
            <button onClick={() => { setSearchQuery(''); setCurrentView('library'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'library' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Music size={24} />
            </button>
            <button onClick={() => { setCurrentView('about'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'about' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Info size={24} />
            </button>
            {currentUser && (
              <>
                <button onClick={() => setIsUploadModalOpen(true)} className="p-3 bg-green-500 text-slate-950 rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-transform">
                  <Upload size={24} />
                </button>
                <button onClick={() => { setCurrentView('dashboard'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'dashboard' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <LayoutDashboard size={24} />
                </button>
                {currentUser.role === 'admin' && (
                  <button onClick={() => { setCurrentView('admin'); setActivePreview(null); }} className={`p-3 rounded-xl transition-colors ${currentView === 'admin' ? 'text-green-500' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    <ShieldAlert size={24} />
                  </button>
                )}
              </>
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
      />

      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        darkMode={darkMode}
      />
    </div>
  );
};

export default App;
