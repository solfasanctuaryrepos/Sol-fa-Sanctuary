
import React, { useState, useEffect, useRef } from 'react';
import { Home, Music, LayoutDashboard, ShieldAlert, Moon, Sun, LogOut, LogIn, Info, HelpCircle, Heart } from 'lucide-react';
import { View } from '../types';

interface NavbarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  currentUser: { email: string; role: 'admin' | 'user' } | null;
  onLogout: () => void;
  onLogin: () => void;
  darkMode: boolean;
  onThemeToggle: () => void;
  onShowShortcuts?: () => void;
  onDonate?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ activeView, onViewChange, currentUser, onLogout, onLogin, darkMode, onThemeToggle, onShowShortcuts, onDonate }) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const NavItem = ({ id, icon: Icon, label }: { id: View; icon: any; label: string }) => (
    <button
      onClick={() => onViewChange(id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        activeView === id 
          ? 'text-green-500 font-semibold' 
          : darkMode ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      <Icon size={18} />
      <span className="text-sm">{label}</span>
    </button>
  );

  const borderClass = darkMode ? 'border-slate-800' : 'border-slate-200';
  const bgClass = darkMode ? 'bg-slate-950' : 'bg-white';
  const textClass = darkMode ? 'text-slate-100' : 'text-slate-900';

  return (
    <nav className={`border-b sticky top-0 z-[60] transition-colors duration-300 ${borderClass} ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewChange('home')}>
            <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
              <Music className="text-white" size={20} />
            </div>
            <span className={`text-xl font-serif font-bold tracking-tight ${textClass}`}>Sol-fa Sanctuary</span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <NavItem id="home" icon={Home} label="Home" />
            <NavItem id="library" icon={Music} label="Music Library" />
            <NavItem id="about" icon={Info} label="About" />
            {currentUser && (
              <>
                <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
                {currentUser.role === 'admin' && <NavItem id="admin" icon={ShieldAlert} label="Admin" />}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Donate button — visible to everyone */}
          {onDonate && (
            <button
              onClick={onDonate}
              title="Support Sol-fa Sanctuary"
              aria-label="Support Sol-fa Sanctuary"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-green-500/30 text-green-500 hover:bg-green-500/10 transition-colors text-sm font-semibold"
            >
              <Heart size={15} className="fill-green-500" />
              <span>Support</span>
            </button>
          )}

          <button
            onClick={onThemeToggle}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={`p-2 border rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-100 border-slate-800 hover:bg-slate-900' : 'text-slate-500 hover:text-slate-900 border-slate-200 hover:bg-slate-50'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          {currentUser ? (
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 text-slate-100 border-slate-700 hover:border-slate-500' : 'bg-slate-100 text-slate-900 border-slate-200 hover:border-slate-400'}`}
              >
                {currentUser.email[0].toUpperCase()}
              </button>

              {showProfileMenu && (
                <div className={`absolute right-0 mt-2 w-64 border rounded-xl shadow-2xl py-2 overflow-hidden z-[70] animate-in fade-in slide-in-from-top-2 duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 border-b mb-2 ${borderClass}`}>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{currentUser.role}</p>
                    <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{currentUser.email}</p>
                  </div>
                  <button onClick={() => { onViewChange('dashboard'); setShowProfileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <LayoutDashboard size={16} />
                    Dashboard
                  </button>
                  <button onClick={() => { onViewChange('help'); setShowProfileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <HelpCircle size={16} />
                    Help &amp; FAQ
                  </button>
                  {currentUser.role === 'admin' && (
                    <button onClick={() => { onViewChange('admin'); setShowProfileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <ShieldAlert size={16} />
                      Admin
                    </button>
                  )}
                  <div className={`h-px my-1 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
                  <button 
                    onClick={() => { onLogout(); setShowProfileMenu(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 transition-colors ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-red-50'}`}
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={onLogin}
              className="flex items-center gap-2 px-5 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition-all shadow-lg shadow-green-500/10 active:scale-95"
            >
              <LogIn size={18} />
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;