/**
 * JoinTeamModal
 *
 * Lets any logged-in user browse discoverable organisations and request to join.
 * Shows the user's own pending requests so they can track status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Users, CheckCircle2, Clock, Send, ChevronRight,
  AlertCircle, Loader2,
} from 'lucide-react';
import { db } from '../supabase';

interface DiscoverableOrg {
  id: string;
  name: string;
  owner_name: string | null;
  member_count: number;
  max_seats: number;
  is_full: boolean;
  my_status: string | null; // null | 'requested' | 'active' | 'pending'
}

interface JoinTeamModalProps {
  darkMode: boolean;
  onClose: () => void;
}

export const JoinTeamModal: React.FC<JoinTeamModalProps> = ({ darkMode, onClose }) => {
  const [orgs, setOrgs]               = useState<DiscoverableOrg[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [requesting, setRequesting]   = useState<string | null>(null); // org id
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null); // org id showing message input
  const [messages, setMessages]       = useState<Record<string, string>>({}); // org_id → message
  const [error, setError]             = useState<string | null>(null);

  const textPrimary   = darkMode ? 'text-slate-100'  : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400'  : 'text-slate-600';
  const modalBg       = darkMode ? 'bg-slate-900'    : 'bg-white';
  const cardBg        = darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200';
  const inputCls      = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors
    ${darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-green-500'
      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'}`;

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await db.rpc('get_discoverable_orgs');
    if (err) setError(err.message);
    else setOrgs((data ?? []) as DiscoverableOrg[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.owner_name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleRequest = async (orgId: string) => {
    setRequesting(orgId);
    setError(null);
    const msg = messages[orgId]?.trim() || null;
    const { error: err } = await db.rpc('request_to_join_org', {
      org_id_param: orgId,
      message_param: msg,
    });
    if (err) {
      setError(err.message);
    } else {
      // Optimistically update local state
      setOrgs(prev => prev.map(o =>
        o.id === orgId ? { ...o, my_status: 'requested' } : o,
      ));
      setExpandedOrg(null);
    }
    setRequesting(null);
  };

  const statusBadge = (status: string | null, isFull: boolean) => {
    if (status === 'active')    return <span className="text-xs font-medium text-green-500 flex items-center gap-1"><CheckCircle2 size={12} /> Member</span>;
    if (status === 'requested') return <span className="text-xs font-medium text-amber-500 flex items-center gap-1"><Clock size={12} /> Request pending</span>;
    if (status === 'pending')   return <span className="text-xs font-medium text-blue-500 flex items-center gap-1"><Clock size={12} /> Invite pending</span>;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${modalBg}`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-purple-500" />
            <h2 className={`font-bold text-base ${textPrimary}`}>Join a Team</h2>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textSecondary}`} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams…"
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-2 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-purple-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className={`text-center py-10 text-sm ${textSecondary}`}>
              {search ? 'No teams match your search.' : 'No teams are currently accepting members.'}
            </div>
          ) : (
            filtered.map(org => {
              const isExpanded = expandedOrg === org.id;
              const alreadyHandled = org.my_status !== null;

              return (
                <div key={org.id} className={`rounded-xl border p-4 transition-all ${cardBg}`}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-purple-500">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${textPrimary}`}>{org.name}</span>
                        {org.is_full && !alreadyHandled && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                            Full
                          </span>
                        )}
                        {statusBadge(org.my_status, org.is_full)}
                      </div>
                      <p className={`text-xs mt-0.5 ${textSecondary}`}>
                        {org.owner_name ? `Led by ${org.owner_name}` : 'Team'}
                        {' · '}
                        {org.member_count}/{org.max_seats} seats
                      </p>
                    </div>

                    {/* Action */}
                    {!alreadyHandled && (
                      <button
                        onClick={() => setExpandedOrg(isExpanded ? null : org.id)}
                        className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all
                          ${darkMode
                            ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                            : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                      >
                        Request
                        <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Expanded: message + confirm */}
                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={messages[org.id] ?? ''}
                        onChange={e => setMessages(prev => ({ ...prev, [org.id]: e.target.value }))}
                        placeholder="Optional: introduce yourself or explain why you want to join…"
                        rows={2}
                        maxLength={300}
                        className={`${inputCls} resize-none`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs ${textSecondary}`}>
                          {(messages[org.id] ?? '').length}/300
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setExpandedOrg(null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                              ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRequest(org.id)}
                            disabled={requesting === org.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-400 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                          >
                            {requesting === org.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Send size={12} />}
                            Send Request
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t text-xs ${textSecondary} ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          Only teams that have enabled discoverability appear here.
        </div>
      </div>
    </div>
  );
};
