import React, { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface UpdateBannerProps {
  darkMode: boolean;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ darkMode: _darkMode }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleSwUpdate = () => setIsVisible(true);
    window.addEventListener('swUpdateReady', handleSwUpdate);
    return () => window.removeEventListener('swUpdateReady', handleSwUpdate);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-green-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
      <span className="text-sm font-medium flex items-center gap-2">
        ✨ A new version of Sol-fa Sanctuary is available.
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1 bg-white text-green-700 text-sm font-bold rounded-lg hover:bg-green-50 active:scale-95 transition-all"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          onClick={() => setIsVisible(false)}
          aria-label="Dismiss update banner"
          className="p-1 hover:bg-green-500 rounded transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
