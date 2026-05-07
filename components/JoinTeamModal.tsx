/**
 * JoinTeamModal
 *
 * Two sections:
 *   1. Pending Invitations — direct invites from any org (discoverable or not)
 *   2. Browse Teams — discoverable orgs the user can request to join
 *
 * Bugs fixed vs v1:
 *   - get_my_pending_invite shown so non-discoverable org invites are visible
 *   - my_status='pending' rows in browse list show Accept/Decline, not just badge
 *   - ent.refresh() called after accept so plan updates immediately
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Users, CheckCircle2, Clock, Send, ChevronRight,
  AlertCircle, Loader2, Mail, XCircle,
} from 'lucide-react';
import { db } from '../supabase';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';

interface DiscoverableOrg {
  id: string;
  name: string;
  owner_name: string | null;
  member_count: number;
  max_seats: number;
  is_full: boolean;
  my_status: string | null; // null | 'requested' | 'active' | 'pending'
}

interface PendingInvite {
  member_id: string;
  org_id: string;
  org_name: string;
}

interface JoinTeamModalProps {
  darkMode: boolean;
  onClose: () => void;
}

export const JoinTeamModal: React.FC<JoinTeamModalProps> = ({ darkMode, onClose }) => {
  const ent = useEntitlementsContext();

  const [orgs, setOrgs]               = useState<DiscoverableOrg[]>([]);
  const [invite, setInvite]           = useState<PendingInvite | null>(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [requesting, setRequesting]   = useState<string | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [messages, setMessages]       = useState<Record<string, string>>({});
  const [handlingInvite, setHandlingInvite] = useState<'accept' | 'decline' | null>(null);
  const [handlingOrgInvite, setHandlingOrgInvite] = useState<string | null>(null); // org id
  const [error, setError]             = useState<string | null>(null);

  const textPrimary   = darkMode ? 'text-slate-100'  : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400'  : 'text-slate-600';
  const modalBg       = darkMode ? 'bg-slate-900'    : 'bg-white';
  const cardBg        = darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200';
  const inputCls      = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors
    ${darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-green-500'
      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [orgsRes, inviteRes] = await Promise.all([
      db.rpc('get_discoverable_orgs'),
      db.rpc('get_my_pending_invite'),
    ]);
    if (orgsRes.error) setError(orgsRes.error.message);
    else setOrgs((orgsRes.data ?? []) as DiscoverableOrg[]);

    const rawInvite = Array.isArray(inviteRes.data) ? inviteRes.data[0] : null;
    setInvite(rawInvite ? {
      member_id: rawInvite.member_id,
      org_id:    rawInvite.org_id,
      org_name:  rawInvite.org_name,
    } : null);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.owner_name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // ── Accept/decline direct invite (non-discoverable or discoverable orgs) ────

  const acceptInvite = async (inviteId: string, source: 'banner' | string) => {
    const key = source === 'banner' ? null : source;
    if (source === 'banner') setHandlingInvite('accept');
    else setHandlingOrgInvite(source);
    setError(null);
    try {
      const { error: err } = await db.rpc('accept_org_invite', { invite_id: inviteId });
      if (err) throw err;
      ent.refresh();
      onClose(); // Member now — close modal, entitlements will update
    } catch (e: any) {
      setError(e.message ?? 'Failed to accept invite');
      setHandlingInvite(null);
      setHandlingOrgInvite(null);
    }
  };

  const declineInvite = async (inviteId: string, source: 'banner' | string) => {
    if (source === 'banner') setHandlingInvite('decline');
    else setHandlingOrgInvite(source);
    setError(null);
    try {
      const { error: err } = await db.rpc('decline_org_invite', { invite_id: inviteId });
      if (err) throw err;
      setInvite(null);
      // Also clear from browse list if present
      setOrgs(prev => prev.map(o =>
        o.id === (source === 'banner' ? invite?.org_id : source)
          ? { ...o, my_status: null }
          : o,
      ));
    } catch (e: any) {
      setError(e.message ?? 'Failed to decline invite');
    } finally {
      setHandlingInvite(null);
      setHandlingOrgInvite(null);
    }
  };

  // ── Join request ────────────────────────────────────────────────────────────

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
      setOrgs(prev => prev.map(o =>
        o.id === orgId ? { ...o, my_status: 'requested' } : o,
      ));
      setExpandedOrg(null);
    }
    setRequesting(null);
  };

  // ── Helper: invite member id for a discoverable org with pending status ─────
  // We need the org_members row id to call accept/decline — fetch on demand
  const [orgInviteIds, setOrgInviteIds] = useState<Record<string, string>>({});

  const resolveOrgInviteId = async (orgId: string): Promise<string | null> => {
    if (orgInviteIds[orgId]) return orgInviteIds[orgId];
    // get_my_pending_invite returns the invite for the first pending row matching user email
    // For a specific org we need to find its member row id
    const { data } = await db.rpc('get_my_pending_invite');
    const raw = Array.isArray(data) ? data[0] : null;
    if (raw && raw.org_id === orgId) {
      setOrgInviteIds(prev => ({ ...prev, [orgId]: raw.member_id }));
      return raw.member_id;
    }
    return null;
  };

  const handleOrgInviteAccept = async (orgId: string) => {
    setHandlingOrgInvite(orgId);
    const id = await resolveOrgInviteId(orgId);
    if (!id) { setError('Invite not found'); setHandlingOrgInvite(null); return; }
    await acceptInvite(id, orgId);
  };

  const handleOrgInviteDecline = async (orgId: string) => {
    setHandlingOrgInvite(orgId);
    const id = await resolveOrgInviteId(orgId);
    if (!id) { setError('Invite not found'); setHandlingOrgInvite(null); return; }
    await declineInvite(id, orgId);
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-purple-500" />
            </div>
          ) : (
            <>
              {/* ── Pending invitation (non-discoverable or any org) ─────────── */}
              {invite && (
                <div className={`rounded-xl border p-4 ${darkMode ? 'bg-purple-950/30 border-purple-800/40' : 'bg-purple-50 border-purple-200'}`}>
                  <div className="flex items-start gap-3">
                    <Mail size={18} className="text-purple-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${textPrimary}`}>
                        You've been invited to <span className="text-purple-500">{invite.org_name}</span>
                      </p>
                      <p className={`text-xs mt-0.5 ${textSecondary}`}>
                        Accept to join the team and gain access to shared collections.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => acceptInvite(invite.member_id, 'banner')}
                      disabled={handlingInvite !== null}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {handlingInvite === 'accept' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Accept
                    </button>
                    <button
                      onClick={() => declineInvite(invite.member_id, 'banner')}
                      disabled={handlingInvite !== null}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors border
                        ${darkMode ? 'border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-500' : 'border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-300'}`}
                    >
                      {handlingInvite === 'decline' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* ── Browse teams ─────────────────────────────────────────────── */}
              <div>
                <div className="relative mb-3">
                  <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textSecondary}`} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search teams…"
                    className={`${inputCls} pl-9`}
                  />
                </div>

                {filtered.length === 0 ? (
                  <div className={`text-center py-8 text-sm ${textSecondary}`}>
                    {search ? 'No teams match your search.' : 'No teams are currently accepting members.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(org => {
                      const isExpanded   = expandedOrg === org.id;
                      const isPending    = org.my_status === 'pending';
                      const isHandled    = org.my_status !== null && !isPending;

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
                                {org.is_full && !isHandled && !isPending && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>Full</span>
                                )}
                                {org.my_status === 'active'    && <span className="text-xs font-medium text-green-500 flex items-center gap-1"><CheckCircle2 size={12} /> Member</span>}
                                {org.my_status === 'requested' && <span className="text-xs font-medium text-amber-500 flex items-center gap-1"><Clock size={12} /> Request pending</span>}
                                {isPending                     && <span className="text-xs font-medium text-purple-500 flex items-center gap-1"><Mail size={12} /> Invited</span>}
                              </div>
                              <p className={`text-xs mt-0.5 ${textSecondary}`}>
                                {org.owner_name ? `Led by ${org.owner_name}` : 'Team'}
                                {' · '}{org.member_count}/{org.max_seats} seats
                              </p>
                            </div>

                            {/* Request button (no existing status) */}
                            {!isHandled && !isPending && (
                              <button
                                onClick={() => setExpandedOrg(isExpanded ? null : org.id)}
                                className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all
                                  ${darkMode ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                              >
                                Request
                                <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </button>
                            )}
                          </div>

                          {/* Invite accept/decline row (for pending invites in browse list) */}
                          {isPending && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleOrgInviteAccept(org.id)}
                                disabled={handlingOrgInvite === org.id}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                {handlingOrgInvite === org.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                Accept Invite
                              </button>
                              <button
                                onClick={() => handleOrgInviteDecline(org.id)}
                                disabled={handlingOrgInvite === org.id}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors border
                                  ${darkMode ? 'border-slate-600 text-slate-400 hover:text-red-400' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}
                              >
                                <XCircle size={12} />
                                Decline
                              </button>
                            </div>
                          )}

                          {/* Request expand: message + confirm */}
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
                                <span className={`text-xs ${textSecondary}`}>{(messages[org.id] ?? '').length}/300</span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setExpandedOrg(null)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                  >Cancel</button>
                                  <button
                                    onClick={() => handleRequest(org.id)}
                                    disabled={requesting === org.id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-400 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                                  >
                                    {requesting === org.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                    Send Request
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t text-xs ${textSecondary} ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          Invites from any team appear here. Only discoverable teams appear in search.
        </div>
      </div>
    </div>
  );
};
