
import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Music, RefreshCw } from 'lucide-react';
import * as Sentry from '@sentry/react';

// VITE_SENTRY_DSN= (add your DSN to .env to activate error tracking)
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  enabled: import.meta.env.PROD,
});

/**
 * Interface for ErrorBoundary component props.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Interface for ErrorBoundary component state.
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary class component to catch rendering errors.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mb-8 border border-red-500/20">
            <Music className="text-red-500" size={48} />
          </div>
          <h1 className="text-3xl font-serif font-bold text-slate-100 mb-4">A Discordant Note Occurred</h1>
          <p className="text-slate-400 max-w-md mb-8 leading-relaxed">
            Our sanctuary is experiencing a temporary disruption. Please refresh the page to restore harmony.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-8 py-3 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-xl shadow-green-500/20"
          >
            <RefreshCw size={20} />
            Restore Harmony
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Instantiating ErrorBoundary - children prop made optional to fix Error on line 50
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mb-8 border border-red-500/20">
          <Music className="text-red-500" size={48} />
        </div>
        <h1 className="text-3xl font-serif font-bold text-slate-100 mb-4">A Discordant Note Occurred</h1>
        <p className="text-slate-400 max-w-md mb-8 leading-relaxed">
          Our sanctuary is experiencing a temporary disruption. Please refresh the page to restore harmony.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-8 py-3 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-xl shadow-green-500/20"
        >
          <RefreshCw size={20} />
          Restore Harmony
        </button>
      </div>
    }>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
