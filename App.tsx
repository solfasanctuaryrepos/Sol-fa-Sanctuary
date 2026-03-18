import React, { useState, useEffect } from 'react';
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
  
  // PWA States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const [currentUser, setCurrentUser] = useState<{ email: string; role: 'admin' | 'user'; emailVerified: boolean } | null>(null);

  // PWA Logic: Listen for install prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after a slight delay to ensure user has landed
      setTimeout(() => setShowInstallBanner(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    
    if (isIOSDevice && !isStandalone) {
      setIsIOS(true);
      setTimeout(() => setShowInstallBanner(true), 5000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      alert("To install: Tap the 'Share' icon in Safari and select 'Add to Home Screen' 📱");
      setShowInstallBanner(false);
      return;
    }

    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

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
            setActivePreview(data as MusicSheet);
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

  useEffect(() => {
    const fetchSheets = async () => {
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
    };

    fetchSheets();
    // Real-time subscription
    const channel = supabase
      .channel('public:sheets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sheets' }, () => {
        fetchSheets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentView, currentUser]);

  useEffect(() => {
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      const user = session?.user;
      if (user && user.email) {
        try {
          // Fetch profile to get role
          const { data: profile, error: profileError } = await db
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          
          if (profileError) {
            console.warn("Profile fetch error (using fallback):", profileError);
          }

          const role = profile?.role || (user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user');
          
          setCurrentUser({ 
            email: user.email, 
            role: role as 'admin' | 'user', 
            emailVerified: !!user.email_confirmed_at
          });
        } catch (err) {
          console.error("Auth state processing error:", err);
          // Still set basic user info
          setCurrentUser({ 
            email: user.email, 
            role: (user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user'), 
            emailVerified: !!user.email_confirmed_at
          });
        }
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOpenLogin = () => {
    setIsAuthModalOpen(true);
  };

  const handleLogout = () => {
    // Fire and forget to prevent UI hanging on Web Lock or network issues
    auth.signOut().catch(err => console.error("Supabase signout issue:", err));
    
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

          {/* PWA Install Banner */}
          {showInstallBanner && (
            <div className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-[100] animate-in slide-in-from-bottom-4 duration-500`}>
              <div className={`p-4 rounded-2xl border shadow-2xl flex items-center gap-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-green-500/20">
                  <Music className="text-white" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>Install Sanctuary</p>
                  <p className="text-xs text-slate-500 truncate">Access scores from your home screen</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleInstallClick}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors active:scale-95"
                  >
                    Install
                  </button>
                  <button 
                    onClick={() => setShowInstallBanner(false)}
                    className={`p-2 transition-colors ${darkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

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