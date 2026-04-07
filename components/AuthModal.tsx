import React, { useState, useRef } from 'react';
import { X, Mail, Lock, User as UserIcon, LogIn, UserPlus, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { auth, db, supabase } from '../supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, darkMode }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setLoading(false);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !loading) {
      onClose();
    }
  };

  const saveUserProfile = async (user: any, name?: string) => {
    const { error } = await db
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        display_name: name || user.user_metadata?.display_name || '',
        role: user.email === 'solfasanctuary@gmail.com' ? 'admin' : 'user',
      });
    
    if (error) console.error("Error saving profile:", error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            }
          }
        });

        if (signUpError) throw signUpError;
        
        if (data.user) {
          // Ensure profile exists with display name
          await saveUserProfile(data.user, displayName);
          setSuccessMsg("Account created! A verification email has been sent to " + email + ". Please verify your email before uploading music.");
        }
      } else if (mode === 'signin') {
        const { error: signInError } = await auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // The onAuthStateChange listener in App.tsx will handle closing this modal
      } else if (mode === 'reset') {
        const { error: resetError } = await auth.resetPasswordForEmail(email);
        if (resetError) throw resetError;
        setSuccessMsg("If an account exists for " + email + ", a password reset link has been sent.");
      }
      if (mode !== 'signup' && mode !== 'reset') {
        setEmail('');
        setPassword('');
        setDisplayName('');
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
      // Note: Redirect happens, App.tsx will pick up the session
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const bgClass = darkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <div 
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[110] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className={`w-full max-w-md rounded-3xl overflow-hidden border animate-in zoom-in-95 duration-300 ${bgClass}`}>
        <div className="relative p-8">
          <button 
            onClick={onClose} 
            className="absolute top-6 right-6 text-slate-400 hover:text-green-500 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border ${darkMode ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-100'}`}>
              {mode === 'signin' ? <LogIn className="text-green-500" size={32} /> : mode === 'signup' ? <UserPlus className="text-green-500" size={32} /> : <Lock className="text-green-500" size={32} />}
            </div>
            <h2 className={`text-3xl font-serif font-bold ${textPrimary}`}>
              {mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className={`mt-2 ${textSecondary}`}>
              {mode === 'signin' 
                ? 'Sign in to access your music sanctuary.' 
                : mode === 'signup' 
                ? 'Join our community of sol-fa musicians.'
                : 'Enter your email to receive a reset link.'}
            </p>
            {mode === 'signin' && (
              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] leading-relaxed italic">
                Tip: Since we've moved to a new system, you'll need to <strong>Sign Up</strong> for a new account if you haven't already.
              </div>
            )}
          </div>

          <div className="space-y-4">
            {mode !== 'reset' && (
              <>
                <button 
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl border font-bold transition-all active:scale-95 disabled:opacity-50 ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'}`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="relative py-2 flex items-center justify-center">
                  <div className={`flex-1 h-px ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
                  <span className={`px-4 text-[10px] font-bold uppercase tracking-widest ${textSecondary}`}>Or continue with email</span>
                  <div className={`flex-1 h-px ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
                </div>
              </>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
                <CheckCircle size={16} className="shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Display Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      className={`w-full rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                      required={mode === 'signup'}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={`w-full rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                    required
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                    {mode === 'signin' && (
                      <button 
                        type="button" 
                        onClick={() => { setMode('reset'); setError(null); setSuccessMsg(null); }}
                        className="text-xs text-green-500 hover:text-green-600 font-medium"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                      required
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-green-500/20 mt-4 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Processing...' : (mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link')}
              </button>

              {mode === 'reset' && (
                <button 
                  type="button"
                  onClick={() => { setMode('signin'); setError(null); setSuccessMsg(null); }}
                  className={`w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </button>
              )}
            </form>
          </div>

          <div className={`mt-8 text-center border-t pt-6 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <p className={`text-sm ${textSecondary}`}>
              {mode === 'signin' ? "Don't have an account?" : mode === 'signup' ? "Already have an account?" : "Remembered your password?"}{' '}
              <button 
                onClick={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="text-green-500 hover:text-green-600 font-bold ml-1"
              >
                {mode === 'signup' ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;