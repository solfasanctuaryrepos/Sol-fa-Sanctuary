/**
 * EnsemblePage — Team workspace for Ensemble plan subscribers.
 *
 * State machine:
 *   1. Not logged in           → auth prompt
 *   2. Has pending invite      → InviteCard (accept / decline)
 *   3. Has ensemble plan,
 *      no org yet              → CreateOrgCard
 *   4. Active org member       → OrgWorkspace (Members + Collections tabs)
 *   5. No ensemble plan,
 *      no invite, no org       → UpsellCard
 *
 * All mutations go through Supabase RPC (SECURITY DEFINER) functions —
 * no direct client writes to org_members.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Loader2, CheckCircle2, XCircle, Crown, Shield,
  UserPlus, Trash2, LogOut, BookOpen, Music, Search, ChevronRight,
  ArrowLeft, Zap, Copy, RefreshCw, Info,
} from 'lucide-react';
import { db } from '../supabase';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';
import type { Organisation, OrgMember, OrgCollection, MusicSheet } from '../types';

// ── Props ──────────────────────────────────────────────────────────────────────
interface EnsemblePageProps {
  darkMode: boolean;
  currentUser: {
    id: string;
    email: string;
    role: 'admin' | 'user';
    emailVerified: boolean;
    displayName?: string;
  } | null;
  onAuthRequired: () => void;
  onOpenPricing: () => void;
}

// ── Internal types ─────────────────────────────────────────────────────────────
interface PendingInvite {
  member: OrgMember;
  org: Organisation;
}

interface SheetInCollection {
  id: string;           // org_collection_sheets.id
  sheet_id: string;
  added_by: string;
  added_at: string;
  sheets: {
    id: string; title: string; composer: string;
    thumbnail_url: string; is_public: boolean;
  } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function roleBadge(role: OrgMember['role'], dark: boolean) {
  const map: Record<string, string> = {
    owner:  dark ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'  : 'bg-amber-50 text-amber-700 border-amber-200',
    admin:  dark ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'     : 'bg-blue-50 text-blue-700 border-blue-200',
    member: dark ? 'bg-slate-700 text-slate-400 border-slate-600'        : 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return `text-xs font-semibold px-2 py-0.5 rounded-full border ${map[role] ?? map.member}`;
}

function statusDot(status: OrgMember['status']) {
  if (status === 'active')  return 'bg-green-500';
  if (status === 'pending') return 'bg-amber-500';
  return 'bg-slate-500';
}

// ── Main component ─────────────────────────────────────────────────────────────
const EnsemblePage: React.FC<EnsemblePageProps> = ({
  darkMode, currentUser, onAuthRequired, onOpenPricing,
}) => {
  const ent = useEntitlementsContext();

  // ── Core state ───────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [org, setOrg]                       = useState<Organisation | null>(null);
  const [myMembership, setMyMembership]     = useState<OrgMember | null>(null);
  const [pendingInvite, setPendingInvite]   = useState<PendingInvite | null>(null);
  const [members, setMembers]               = useState<OrgMember[]>([]);
  const [collections, setCollections]       = useState<OrgCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<OrgCollection | null>(null);
  const [collectionSheets, setCollectionSheets] = useState<SheetInCollection[]>([]);
  const [tab, setTab]                       = useState<'members' | 'collections'>('members');

  // ── Create org form ───────────────────────────────────────────────────────────
  const [orgName, setOrgName]               = useState('');
  const [creatingOrg, setCreatingOrg]       = useState(false);
  const [createOrgErr, setCreateOrgErr]     = useState<string | null>(null);

  // ── Invite form ───────────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail]       = useState('');
  const [inviteRole, setInviteRole]         = useState<'member' | 'admin'>('member');
  const [inviting, setInviting]             = useState(false);
  const [inviteMsg, setInviteMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  // ── Member actions ────────────────────────────────────────────────────────────
  const [removingId, setRemovingId]         = useState<string | null>(null);

  // ── Collection form ───────────────────────────────────────────────────────────
  const [colName, setColName]               = useState('');
  const [colDesc, setColDesc]               = useState('');
  const [creatingCol, setCreatingCol]       = useState(false);
  const [colMsg, setColMsg]                 = useState<{ ok: boolean; text: string } | null>(null);
  const [showColForm, setShowColForm]       = useState(false);

  // ── Sheet search (add to collection) ─────────────────────────────────────────
  const [sheetQuery, setSheetQuery]         = useState('');
  const [sheetResults, setSheetResults]     = useState<MusicSheet[]>([]);
  const [searchingSheets, setSearchingSheets] = useState(false);
  const [addingSheetId, setAddingSheetId]   = useState<string | null>(null);

  // ── Invite accept/decline ─────────────────────────────────────────────────────
  const [handlingInvite, setHandlingInvite] = useState(false);

  const textPrimary   = darkMode ? 'text-slate-100'  : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400'  : 'text-slate-600';
  const cardBg        = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const inputCls      = `w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
    ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-600 focus:border-green-500'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'}`;

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const loadMembers = useCallback(async (orgId: string) => {
    const { data } = await db
      .from('org_members')
      .select('*, profiles(display_name)')
      .eq('org_id', orgId)
      .neq('status', 'removed')
      .order('role');
    setMembers((data ?? []) as OrgMember[]);
  }, []);

  const loadCollections = useCallback(async (orgId: string) => {
    const { data } = await db
      .from('org_collections')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    setCollections((data ?? []) as OrgCollection[]);
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) { setLoading(false); return; }
    setLoading(true);
    try {
      // Check for pending invite matching this user's email
      const { data: inviteRow } = await db
        .from('org_members')
        .select('*, organisations(*)')
        .eq('email', currentUser.email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle();

      if (inviteRow) {
        setPendingInvite({
          member: inviteRow as OrgMember,
          org: (inviteRow as any).organisations as Organisation,
        });
      } else {
        setPendingInvite(null);
      }

      // Check for active membership
      const { data: memberRow } = await db
        .from('org_members')
        .select('*, organisations(*)')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .maybeSingle();

      if (memberRow) {
        const orgData = (memberRow as any).organisations as Organisation;
        setOrg(orgData);
        setMyMembership(memberRow as OrgMember);
        await Promise.all([
          loadMembers(memberRow.org_id),
          loadCollections(memberRow.org_id),
        ]);
      } else {
        setOrg(null);
        setMyMembership(null);
        setMembers([]);
        setCollections([]);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, loadMembers, loadCollections]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadCollectionSheets = useCallback(async (collectionId: string) => {
    const { data } = await db
      .from('org_collection_sheets')
      .select('*, sheets(id, title, composer, thumbnail_url, is_public)')
      .eq('collection_id', collectionId)
      .order('added_at', { ascending: false });
    setCollectionSheets((data ?? []) as SheetInCollection[]);
  }, []);

  useEffect(() => {
    if (activeCollection) loadCollectionSheets(activeCollection.id);
    else setCollectionSheets([]);
  }, [activeCollection, loadCollectionSheets]);

  // ── Sheet search ──────────────────────────────────────────────────────────────
  const searchSheets = useCallback(async (q: string) => {
    if (!q.trim()) { setSheetResults([]); return; }
    setSearchingSheets(true);
    const { data } = await db
      .from('sheets')
      .select('id, title, composer, thumbnail_url, is_public, pdf_url, uploaded_by, file_size, views, downloads, is_admin_restricted, uploaded_at')
      .eq('is_public', true)
      .or(`title.ilike.%${q}%,composer.ilike.%${q}%`)
      .limit(8);
    setSheetResults(
      (data ?? []).map((s: any) => ({
        ...s,
        uploadedAt: s.uploaded_at ?? '',
        fileSize: s.file_size,
        isPublic: s.is_public,
        isAdminRestricted: s.is_admin_restricted,
        thumbnailUrl: s.thumbnail_url,
        pdfUrl: s.pdf_url,
        uploadedBy: s.uploaded_by,
        commentsCount: 0,
        likesCount: 0,
      })) as MusicSheet[],
    );
    setSearchingSheets(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchSheets(sheetQuery), 350);
    return () => clearTimeout(t);
  }, [sheetQuery, searchSheets]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createOrg = async () => {
    if (!orgName.trim()) return;
    setCreatingOrg(true);
    setCreateOrgErr(null);
    try {
      const { error } = await db.rpc('create_organisation', { org_name: orgName.trim() });
      if (error) throw error;
      await loadData();
      ent.refresh();
    } catch (e: any) {
      setCreateOrgErr(e.message ?? 'Failed to create organisation');
    } finally {
      setCreatingOrg(false);
    }
  };

  const acceptInvite = async () => {
    if (!pendingInvite) return;
    setHandlingInvite(true);
    try {
      const { error } = await db.rpc('accept_org_invite', { invite_id: pendingInvite.member.id });
      if (error) throw error;
      await loadData();
      ent.refresh();
    } catch (e: any) {
      alert(e.message ?? 'Failed to accept invite');
    } finally {
      setHandlingInvite(false);
    }
  };

  const declineInvite = async () => {
    if (!pendingInvite) return;
    setHandlingInvite(true);
    try {
      const { error } = await db.rpc('decline_org_invite', { invite_id: pendingInvite.member.id });
      if (error) throw error;
      setPendingInvite(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to decline invite');
    } finally {
      setHandlingInvite(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !org) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const { error } = await db.rpc('invite_org_member', {
        org_id_param: org.id,
        invite_email: inviteEmail.trim().toLowerCase(),
        invite_role:  inviteRole,
      });
      if (error) throw error;
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail.trim()}. They'll see it when they log in.` });
      setInviteEmail('');
      await loadMembers(org.id);
    } catch (e: any) {
      setInviteMsg({ ok: false, text: e.message ?? 'Failed to send invite' });
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      const { error } = await db.rpc('remove_org_member', { member_id: memberId });
      if (error) throw error;
      setMembers(prev => prev.filter(m => m.id !== memberId));
      if (memberId === myMembership?.id) {
        // Self-removal — refresh everything
        await loadData();
        ent.refresh();
      }
    } catch (e: any) {
      alert(e.message ?? 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  const createCollection = async () => {
    if (!colName.trim() || !org) return;
    setCreatingCol(true);
    setColMsg(null);
    try {
      const { error } = await db.from('org_collections').insert({
        org_id:     org.id,
        name:       colName.trim(),
        description: colDesc.trim() || null,
        created_by: currentUser!.id,
      });
      if (error) throw error;
      setColMsg({ ok: true, text: 'Collection created.' });
      setColName('');
      setColDesc('');
      setShowColForm(false);
      await loadCollections(org.id);
    } catch (e: any) {
      setColMsg({ ok: false, text: e.message ?? 'Failed to create collection' });
    } finally {
      setCreatingCol(false);
    }
  };

  const deleteCollection = async (col: OrgCollection) => {
    if (!window.confirm(`Delete collection "${col.name}"? This cannot be undone.`)) return;
    await db.from('org_collections').delete().eq('id', col.id);
    setCollections(prev => prev.filter(c => c.id !== col.id));
    if (activeCollection?.id === col.id) setActiveCollection(null);
  };

  const addSheetToCollection = async (sheet: MusicSheet) => {
    if (!activeCollection) return;
    setAddingSheetId(sheet.id);
    try {
      const { error } = await db.from('org_collection_sheets').insert({
        collection_id: activeCollection.id,
        sheet_id:      sheet.id,
        added_by:      currentUser!.id,
      });
      if (error && error.code === '23505') {
        // already in collection — just close search
      } else if (error) {
        throw error;
      }
      setSheetQuery('');
      setSheetResults([]);
      await loadCollectionSheets(activeCollection.id);
    } catch (e: any) {
      alert(e.message ?? 'Failed to add sheet');
    } finally {
      setAddingSheetId(null);
    }
  };

  const removeSheetFromCollection = async (item: SheetInCollection) => {
    await db.from('org_collection_sheets').delete().eq('id', item.id);
    setCollectionSheets(prev => prev.filter(s => s.id !== item.id));
  };

  const isOwnerOrAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const activeCount    = members.filter(m => m.status === 'active').length;

  // ── Render helpers ────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className={`max-w-md mx-auto mt-16 rounded-2xl border p-8 text-center ${cardBg}`}>
        <Users size={40} className="text-purple-400 mx-auto mb-4" />
        <h2 className={`text-xl font-bold mb-2 ${textPrimary}`}>Ensemble Workspace</h2>
        <p className={`text-sm mb-6 ${textSecondary}`}>Sign in to access your team workspace.</p>
        <button onClick={onAuthRequired}
          className="px-6 py-2.5 bg-green-500 text-slate-950 rounded-xl font-bold text-sm hover:bg-green-400 transition-colors">
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-purple-400" />
      </div>
    );
  }

  // ── Pending invite ────────────────────────────────────────────────────────────
  if (pendingInvite && !myMembership) {
    return (
      <div className="max-w-xl mx-auto mt-12 animate-in fade-in duration-300">
        <div className={`rounded-2xl border p-8 text-center ${darkMode ? 'bg-purple-950/20 border-purple-800/40' : 'bg-purple-50 border-purple-200'}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${darkMode ? 'bg-purple-900/40' : 'bg-purple-100'}`}>
            <UserPlus size={28} className="text-purple-500" />
          </div>
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>You've been invited</h2>
          <p className={`text-sm mb-1 ${textSecondary}`}>You have a pending invitation to join</p>
          <p className={`text-lg font-bold mb-6 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
            {pendingInvite.org.name}
          </p>
          <p className={`text-xs mb-8 ${textSecondary}`}>
            Accepting grants you full Ensemble plan access — shared collections, unlimited downloads,
            and collaboration with your team.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={declineInvite}
              disabled={handlingInvite}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors
                ${darkMode ? 'border-slate-700 text-slate-400 hover:border-slate-500' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              Decline
            </button>
            <button
              onClick={acceptInvite}
              disabled={handlingInvite}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              {handlingInvite ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Accept & Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No org yet: has ensemble plan → create org ────────────────────────────────
  if (!myMembership && ent.plan === 'ensemble') {
    return (
      <div className="max-w-lg mx-auto mt-12 animate-in fade-in duration-300">
        <div className={`rounded-2xl border p-8 ${cardBg}`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
            <Users size={26} className="text-purple-500" />
          </div>
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Create Your Organisation</h2>
          <p className={`text-sm mb-6 ${textSecondary}`}>
            Give your choir, music group, or team a name to set up your shared workspace.
            You'll be the owner and can invite up to 19 additional members.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
              placeholder="e.g. Harmony Choir, Grace Music Team…"
              maxLength={80}
              className={inputCls}
            />
            {createOrgErr && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <XCircle size={13} /> {createOrgErr}
              </p>
            )}
            <button
              onClick={createOrg}
              disabled={creatingOrg || !orgName.trim()}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
            >
              {creatingOrg ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create Organisation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No ensemble plan, no invite, no membership → upsell ──────────────────────
  if (!myMembership) {
    return (
      <div className="max-w-xl mx-auto mt-12 animate-in fade-in duration-300">
        <div className={`rounded-2xl border p-8 text-center ${darkMode ? 'bg-purple-950/20 border-purple-800/40' : 'bg-purple-50 border-purple-200'}`}>
          <Users size={40} className="text-purple-400 mx-auto mb-4" />
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Ensemble Workspace</h2>
          <p className={`text-sm mb-6 max-w-sm mx-auto ${textSecondary}`}>
            Collaborate with your choir or music group. Shared sheet collections,
            20-seat team workspace, and unified billing — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {['20-seat workspace', 'Shared collections', 'Invite by email', 'Team billing'].map(f => (
              <span key={f} className={`text-xs font-medium px-3 py-1 rounded-full border
                ${darkMode ? 'bg-purple-900/30 text-purple-400 border-purple-800/40' : 'bg-purple-100 text-purple-700 border-purple-200'}`}>
                {f}
              </span>
            ))}
          </div>
          <button onClick={onOpenPricing}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 mx-auto transition-colors">
            <Zap size={16} /> View Ensemble Plan
          </button>
          <p className={`mt-4 text-xs ${textSecondary}`}>
            Already invited to a team? Ask your admin to resend the invite, then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  // ── OrgWorkspace ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6 pb-16 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              Ensemble Workspace
            </span>
          </div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>{org?.name}</h1>
          <p className={`text-sm mt-1 ${textSecondary}`}>
            {activeCount} of {org?.max_seats ?? 20} seats used
            {myMembership.role !== 'member' ? '' : ' · Member'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData}
            className={`p-2 rounded-xl border text-sm transition-colors
              ${darkMode ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <RefreshCw size={15} />
          </button>
          <span className={roleBadge(myMembership.role, darkMode)}>
            {myMembership.role === 'owner' && <Crown size={10} className="inline mr-1" />}
            {myMembership.role}
          </span>
        </div>
      </div>

      {/* Seat progress bar */}
      <div className={`rounded-2xl border p-4 ${cardBg}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-semibold ${textSecondary}`}>Seats used</span>
          <span className={`text-xs font-bold ${activeCount >= (org?.max_seats ?? 20) ? 'text-red-400' : textSecondary}`}>
            {activeCount} / {org?.max_seats ?? 20}
          </span>
        </div>
        <div className={`w-full rounded-full h-2 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <div
            className={`h-full rounded-full transition-all ${activeCount >= (org?.max_seats ?? 20) ? 'bg-red-500' : 'bg-purple-500'}`}
            style={{ width: `${Math.min(100, (activeCount / (org?.max_seats ?? 20)) * 100)}%` }}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className={`flex gap-1 rounded-xl p-1 ${darkMode ? 'bg-slate-800/60' : 'bg-slate-100'}`}>
        {(['members', 'collections'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all capitalize
              ${tab === t
                ? (darkMode ? 'bg-slate-700 text-slate-100 shadow' : 'bg-white text-slate-900 shadow-sm')
                : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
          >
            {t === 'members' ? <Users size={15} /> : <BookOpen size={15} />}
            {t === 'members' ? `Members (${members.length})` : `Collections (${collections.length})`}
          </button>
        ))}
      </div>

      {/* ── Members tab ─────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-4">

          {/* Invite form (owner/admin only) */}
          {isOwnerOrAdmin && (
            <div className={`rounded-2xl border p-5 ${cardBg}`}>
              <h3 className={`font-bold mb-3 flex items-center gap-2 ${textPrimary}`}>
                <UserPlus size={16} className="text-purple-400" /> Invite a Member
              </h3>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  placeholder="member@example.com"
                  className={inputCls + ' flex-1 min-w-0'}
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as 'member' | 'admin')}
                  className={`px-3 py-2 rounded-xl border text-sm outline-none shrink-0
                    ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={sendInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shrink-0"
                >
                  {inviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Invite
                </button>
              </div>
              {inviteMsg && (
                <p className={`mt-2 text-sm flex items-center gap-1.5 ${inviteMsg.ok ? 'text-green-500' : 'text-red-400'}`}>
                  {inviteMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {inviteMsg.text}
                </p>
              )}
              <p className={`mt-2 text-xs flex items-start gap-1.5 ${textSecondary}`}>
                <Info size={11} className="mt-0.5 shrink-0" />
                Invites are visible to the recipient when they log in and visit this page.
                No email is sent automatically — share the link manually if needed.
              </p>
            </div>
          )}

          {/* Members list */}
          <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
            {members.length === 0 ? (
              <p className={`p-6 text-sm ${textSecondary}`}>No members yet.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: darkMode ? 'rgb(30,41,59)' : 'rgb(241,245,249)' }}>
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                      ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                      {m.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${textPrimary}`}>
                        {(m as any).profiles?.display_name ?? m.email.split('@')[0]}
                      </p>
                      <p className={`text-xs truncate ${textSecondary}`}>{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusDot(m.status)}`} title={m.status} />
                      <span className={`text-xs ${textSecondary}`}>{m.status}</span>
                      <span className={roleBadge(m.role, darkMode)}>{m.role}</span>
                    </div>
                    {/* Remove / Leave button */}
                    {(isOwnerOrAdmin && m.role !== 'owner') || m.user_id === currentUser?.id && m.role !== 'owner' ? (
                      <button
                        onClick={() => removeMember(m.id)}
                        disabled={removingId === m.id}
                        title={m.user_id === currentUser?.id ? 'Leave org' : 'Remove member'}
                        className={`p-1.5 rounded-lg transition-colors shrink-0
                          ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-500'}`}
                      >
                        {removingId === m.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : m.user_id === currentUser?.id
                            ? <LogOut size={14} />
                            : <Trash2 size={14} />}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Collections tab ──────────────────────────────────────────────────── */}
      {tab === 'collections' && !activeCollection && (
        <div className="space-y-4">

          {/* Create collection */}
          <div className={`rounded-2xl border p-5 ${cardBg}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-bold flex items-center gap-2 ${textPrimary}`}>
                <BookOpen size={16} className="text-purple-400" /> Shared Collections
              </h3>
              <button
                onClick={() => { setShowColForm(!showColForm); setColMsg(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors"
              >
                <Plus size={12} /> New Collection
              </button>
            </div>

            {showColForm && (
              <div className={`mb-4 p-4 rounded-xl border space-y-2 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <input
                  type="text"
                  value={colName}
                  onChange={e => setColName(e.target.value)}
                  placeholder="Collection name *"
                  className={inputCls}
                  maxLength={80}
                />
                <input
                  type="text"
                  value={colDesc}
                  onChange={e => setColDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className={inputCls}
                  maxLength={200}
                />
                <div className="flex gap-2">
                  <button
                    onClick={createCollection}
                    disabled={creatingCol || !colName.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {creatingCol ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Create
                  </button>
                  <button onClick={() => setShowColForm(false)}
                    className={`px-3 py-2 rounded-xl text-sm ${textSecondary}`}>Cancel</button>
                </div>
                {colMsg && (
                  <p className={`text-sm flex items-center gap-1.5 ${colMsg.ok ? 'text-green-500' : 'text-red-400'}`}>
                    {colMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {colMsg.text}
                  </p>
                )}
              </div>
            )}

            {collections.length === 0 ? (
              <p className={`text-sm py-2 ${textSecondary}`}>No collections yet. Create one to start sharing sheets with your team.</p>
            ) : (
              <div className="space-y-2">
                {collections.map(col => (
                  <div key={col.id} className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
                    <div className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-slate-700' : 'bg-white'}`}>
                      <BookOpen size={16} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${textPrimary}`}>{col.name}</p>
                      {col.description && (
                        <p className={`text-xs truncate ${textSecondary}`}>{col.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setActiveCollection(col)}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0
                        ${darkMode ? 'text-purple-400 hover:bg-purple-900/30' : 'text-purple-600 hover:bg-purple-50'}`}
                    >
                      Open <ChevronRight size={13} />
                    </button>
                    {(isOwnerOrAdmin || col.created_by === currentUser?.id) && (
                      <button
                        onClick={() => deleteCollection(col)}
                        className={`p-1.5 rounded-lg transition-colors shrink-0
                          ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-500'}`}
                        title="Delete collection"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Collection detail ─────────────────────────────────────────────────── */}
      {tab === 'collections' && activeCollection && (
        <div className="space-y-4">

          {/* Back + header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveCollection(null); setSheetQuery(''); setSheetResults([]); }}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors
                ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ArrowLeft size={16} /> Collections
            </button>
            <span className={darkMode ? 'text-slate-700' : 'text-slate-300'}>/</span>
            <span className={`text-sm font-semibold ${textPrimary}`}>{activeCollection.name}</span>
          </div>

          {/* Add sheet search */}
          <div className={`rounded-2xl border p-5 ${cardBg}`}>
            <h3 className={`font-bold mb-3 flex items-center gap-2 ${textPrimary}`}>
              <Music size={15} className="text-purple-400" /> Add a Sheet
            </h3>
            <div className="relative">
              <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textSecondary}`} />
              <input
                type="text"
                value={sheetQuery}
                onChange={e => setSheetQuery(e.target.value)}
                placeholder="Search public sheets by title or composer…"
                className={`${inputCls} pl-9`}
              />
              {searchingSheets && (
                <Loader2 size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 animate-spin ${textSecondary}`} />
              )}
            </div>
            {sheetResults.length > 0 && (
              <div className={`mt-2 rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                {sheetResults.map(s => (
                  <div key={s.id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-0
                      ${darkMode ? 'border-slate-700 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-slate-50'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${textPrimary}`}>{s.title}</p>
                      <p className={`text-xs ${textSecondary}`}>{s.composer}</p>
                    </div>
                    <button
                      onClick={() => addSheetToCollection(s)}
                      disabled={addingSheetId === s.id}
                      className="text-xs font-bold px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-1 shrink-0 disabled:opacity-50 transition-colors"
                    >
                      {addingSheetId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sheets in collection */}
          <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
            <div className={`px-5 py-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
              <h3 className={`font-bold text-sm ${textPrimary}`}>
                Sheets in this collection ({collectionSheets.length})
              </h3>
            </div>
            {collectionSheets.length === 0 ? (
              <p className={`p-5 text-sm ${textSecondary}`}>No sheets yet. Search above to add some.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: darkMode ? 'rgb(30,41,59)' : 'rgb(241,245,249)' }}>
                {collectionSheets.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <Music size={14} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${textPrimary}`}>
                        {item.sheets?.title ?? 'Unknown'}
                      </p>
                      <p className={`text-xs ${textSecondary}`}>{item.sheets?.composer}</p>
                    </div>
                    {(item.added_by === currentUser?.id || isOwnerOrAdmin) && (
                      <button
                        onClick={() => removeSheetFromCollection(item)}
                        className={`p-1.5 rounded-lg shrink-0 transition-colors
                          ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-500'}`}
                        title="Remove from collection"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnsemblePage;
