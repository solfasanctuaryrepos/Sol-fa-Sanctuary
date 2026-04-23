import React, { useEffect, useState } from 'react';
import { Eye, Download, Music, Calendar, ChevronLeft } from 'lucide-react';
import { MusicSheet } from '../types';
import { db } from '../supabase';

interface ProfilePageProps {
  email: string;
  sheets: MusicSheet[];
  currentUserEmail?: string;
  darkMode: boolean;
  onPreview: (sheet: MusicSheet) => void;
  onBack?: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ email, sheets, currentUserEmail, darkMode, onPreview, onBack }) => {
  const [displayName, setDisplayName] = useState<string>('');
  const [memberSince, setMemberSince] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    const fetchProfile = async () => {
      try {
        const { data } = await db.from('profiles')
          .select('display_name, created_at')
          .eq('email', email)
          .maybeSingle();
        if (data) {
          setDisplayName(data.display_name || '');
          setMemberSince(
            data.created_at
              ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : ''
          );
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [email]);

  const publicSheets = sheets.filter(s => s.uploadedBy === email && s.isPublic && !s.isAdminRestricted);
  const totalViews = publicSheets.reduce((acc, s) => acc + s.views, 0);
  const totalDownloads = publicSheets.reduce((acc, s) => acc + s.downloads, 0);

  // Generate initials from email
  const getInitials = (e: string) => {
    const parts = e.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return e.slice(0, 2).toUpperCase();
  };

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <ChevronLeft size={18} />
          Back
        </button>
      )}

      {/* Profile header */}
      <div className={`p-8 rounded-2xl border ${cardBg}`}>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-green-500">{getInitials(email)}</span>
          </div>
          <div className="flex-1 text-center sm:text-left space-y-2">
            <h1 className={`text-2xl font-serif font-bold ${textPrimary}`}>
              {displayName || email.split('@')[0]}
            </h1>
            <p className={`text-sm ${textSecondary}`}>{email}</p>
            {memberSince && (
              <div className={`flex items-center gap-1.5 text-xs ${textSecondary} justify-center sm:justify-start`}>
                <Calendar size={13} />
                <span>Member since {memberSince}</span>
              </div>
            )}
            {currentUserEmail === email && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-green-500 border border-green-500/30 px-2.5 py-0.5 rounded-full bg-green-500/10">
                Your public profile
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700/30">
          {[
            { label: 'Uploads', value: publicSheets.length, icon: Music },
            { label: 'Total Views', value: totalViews, icon: Eye },
            { label: 'Total Downloads', value: totalDownloads, icon: Download },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <stat.icon size={18} className="text-green-500 mx-auto mb-1" />
              <p className={`text-xl font-bold ${textPrimary}`}>{stat.value}</p>
              <p className={`text-xs ${textSecondary}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Public sheets grid */}
      <div>
        <h2 className={`text-xl font-serif font-bold mb-4 ${textPrimary}`}>Public Sheets</h2>
        {publicSheets.length === 0 ? (
          <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <Music size={40} className="mx-auto mb-3 opacity-20" />
            <p>No public sheets yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {publicSheets.map(sheet => (
              <div
                key={sheet.id}
                className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col cursor-pointer ${cardBg}`}
                onClick={() => onPreview(sheet)}
              >
                <div className="aspect-[3/4] overflow-hidden relative">
                  <img
                    src={sheet.thumbnailUrl}
                    alt={sheet.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-white text-slate-900 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-1.5">
                      <Eye size={14} /> Preview
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className={`font-bold text-sm truncate mb-1 ${textPrimary}`}>{sheet.title}</h3>
                  <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                    <span className="truncate">{sheet.composer}</span>
                    <span className="flex items-center gap-1 shrink-0"><Eye size={11} /> {sheet.views}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
