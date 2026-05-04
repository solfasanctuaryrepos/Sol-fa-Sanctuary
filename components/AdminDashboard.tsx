
import { Search, Trash2, ChevronDown, Music, List, Grid, X, ArrowUp, ArrowDown, Lock, Unlock, Globe, Eye, Download, Check, Settings2, Calendar, Users, Shield, User as UserIcon, AlertTriangle, MoreVertical, ChevronLeft, ChevronRight, Heart, MessageSquare, BookOpen, ThumbsUp, CheckCircle2, Clock, XCircle, Tag, Plus, Copy, RefreshCw, Loader2, Crown } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { AdminTab, MusicSheet, User, SheetRequest } from '../types';
import { db } from '../supabase';
import Modal from './Modal';

const PAGE_SIZE = 20;

interface AdminDashboardProps {
  onPreview: (sheet: MusicSheet) => void;
  darkMode: boolean;
  sheets: MusicSheet[];
  onRefresh: () => void;
  /** Called with the new sheet object so the list reflects changes without waiting for realtime. */
  onSheetUpdated?: (updated: MusicSheet) => void;
  /** Called with the deleted sheet's id so the list is pruned without waiting for realtime. */
  onSheetDeleted?: (id: string) => void;
}

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onPreview, darkMode, sheets, onRefresh, onSheetUpdated, onSheetDeleted }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('content');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [sheetSortConfig, setSheetSortConfig] = useState<SortConfig>(null);
  const [userSortConfig, setUserSortConfig] = useState<SortConfig>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState<string | null>(null);
  const [contentFilter, setContentFilter] = useState<'all' | 'approved' | 'restricted'>('all');
  const [sheetPage, setSheetPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [roleChangeConfirmation, setRoleChangeConfirmation] = useState<{ user: User; newRole: 'admin' | 'user' } | null>(null);
  const [adminRequests, setAdminRequests] = useState<SheetRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'fulfilled' | 'closed'>('all');

  // ── Promo codes ────────────────────────────────────────────────────────────────
  interface PromoCode {
    id: string; code: string; max_uses: number; used_count: number;
    is_active: boolean; expires_at: string | null; created_at: string;
  }
  const [promoCodes, setPromoCodes]       = useState<PromoCode[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoMaxUses, setPromoMaxUses]   = useState(1);
  const [promoExpiry, setPromoExpiry]     = useState('');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [promoMsg, setPromoMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied]       = useState(false);

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setPromoCodeInput(`FOUNDING-${seg(4)}-${seg(4)}`);
  };

  const loadPromos = useCallback(async () => {
    setPromosLoading(true);
    const { data } = await db.from('promo_codes').select('*').order('created_at', { ascending: false });
    setPromoCodes((data ?? []) as PromoCode[]);
    setPromosLoading(false);
  }, []);

  const createPromo = async () => {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code) return;
    setCreatingPromo(true);
    setPromoMsg(null);
    setLastCreatedCode(null);
    try {
      const { error } = await db.from('promo_codes').insert({
        code, type: 'founding', max_uses: promoMaxUses,
        is_active: true, expires_at: promoExpiry || null,
      });
      if (error) throw error;
      setLastCreatedCode(code);
      setPromoMsg({ ok: true, text: 'Code created — copy it now.' });
      setPromoCodeInput('');
      setPromoMaxUses(1);
      setPromoExpiry('');
      loadPromos();
    } catch (err: any) {
      setPromoMsg({ ok: false, text: err.message ?? 'Failed to create code.' });
    } finally {
      setCreatingPromo(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const deactivatePromo = async (id: string) => {
    await db.from('promo_codes').update({ is_active: false }).eq('id', id);
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, is_active: false } : p));
  };

  useEffect(() => {
    if (activeTab !== 'promos') return;
    loadPromos();
  }, [activeTab, loadPromos]);
  // ──────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'requests') return;
    setRequestsLoading(true);
    db.from('sheet_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setAdminRequests((data ?? []) as SheetRequest[]);
        setRequestsLoading(false);
      });
  }, [activeTab]);

  const handleRequestStatusChange = async (reqId: string, newStatus: SheetRequest['status']) => {
    await db.from('sheet_requests').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', reqId);
    setAdminRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));
  };

  // State for the custom delete confirmation modal
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    id: string;
    type: 'sheet' | 'user';
    title: string;
  } | null>(null);

  const [visibleSheetColumns, setVisibleSheetColumns] = useState({
    sheet: true,
    title: true,
    composer: true,
    uploader: true,
    status: true,
    uploadedAt: true,
    views: true,
    downloads: true,
  });

  const [visibleUserColumns, setVisibleUserColumns] = useState({
    user: true,
    role: true,
    status: true,
    createdAt: true,
  });

  const fetchUsers = useCallback(async () => {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .order('email', { ascending: true });

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }
    setUsers(data as User[]);
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();

      const channel = db
        .channel('public:profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchUsers();
        })
        .subscribe();

      return () => {
        db.removeChannel(channel);
      };
    }
  }, [activeTab, fetchUsers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSheetSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sheetSortConfig && sheetSortConfig.key === key && sheetSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSheetSortConfig({ key, direction });
  };

  const handleUserSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (userSortConfig && userSortConfig.key === key && userSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setUserSortConfig({ key, direction });
  };

  const toggleAdminRestriction = async (e: React.MouseEvent, sheet: MusicSheet) => {
    e.preventDefault();
    e.stopPropagation();
    onSheetUpdated?.({ ...sheet, isAdminRestricted: !sheet.isAdminRestricted }); // optimistic flip
    try {
      const { error } = await db
        .from('sheets')
        .update({ is_admin_restricted: !sheet.isAdminRestricted })
        .eq('id', sheet.id);

      if (error) throw error;
      // no more onRefresh() — optimistic update already applied above
    } catch (error: any) {
      onSheetUpdated?.(sheet); // rollback on failure
      console.error("Restriction error:", error);
      alert(`Failed to update restriction status: ${error.message || 'Unknown error'}`);
    }
  };

  const toggleUserRole = (user: User) => {
    if (user.email === 'solfasanctuary@gmail.com') {
      alert("This is the primary admin account and its role cannot be changed.");
      return;
    }
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setRoleChangeConfirmation({ user, newRole });
  };

  const executeRoleChange = async () => {
    if (!roleChangeConfirmation) return;
    const { user, newRole } = roleChangeConfirmation;
    setRoleChangeConfirmation(null);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    try {
      const { error } = await db.from('profiles').update({ role: newRole }).eq('id', user.id);
      if (error) throw error;
    } catch (error: any) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: user.role } : u));
      alert("Failed to update user role.");
    }
  };

  const toggleUserStatus = async (user: User) => {
    if (user.email === 'solfasanctuary@gmail.com') {
      alert("This is the primary admin account and its status cannot be changed.");
      return;
    }
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u)); // optimistic
    try {
      const { error } = await db
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', user.id);

      if (error) throw error;
      // no more fetchUsers() — optimistic update already applied above
    } catch (error: any) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: user.status } : u)); // rollback
      alert("Failed to update user status.");
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.email === 'solfasanctuary@gmail.com') {
      alert("The primary administrator account cannot be deleted.");
      return;
    }
    setDeleteConfirmation({
      id: user.id,
      type: 'user',
      title: user.displayName || user.email
    });
  };

  const handleDeleteSheet = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.nativeEvent.stopImmediatePropagation();
    e.preventDefault();
    e.stopPropagation();
    
    setDeleteConfirmation({
      id: sheet.id,
      type: 'sheet',
      title: sheet.title
    });
  };

  const executeDeletion = async () => {
    if (!deleteConfirmation) return;
    const { id, type } = deleteConfirmation;
    setDeleteConfirmation(null); // close modal immediately

    // Optimistic removal — remove from local state before the network call
    if (type === 'sheet') {
      onSheetDeleted?.(id);
    } else {
      setUsers(prev => prev.filter(u => u.id !== id));
    }

    try {
      if (type === 'sheet') {
        // admin_delete_sheet verifies caller is admin server-side, bypasses RLS
        const { error } = await db.rpc('admin_delete_sheet', { p_sheet_id: id });
        if (error) throw error;
      } else {
        // admin_delete_user deletes from both profiles + auth.users server-side
        const { error } = await db.rpc('admin_delete_user', { p_user_id: id });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error("Deletion error:", error);
      alert(`Failed to delete: ${error.message || 'Unknown error'}`);
      // Restore on failure
      if (type === 'sheet') {
        onRefresh(); // re-fetch sheets to restore the removed item
      } else {
        fetchUsers(); // re-fetch users to restore the removed item
      }
    }
  };

  const filteredSheets = sheets.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.composer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = contentFilter === 'all' || (contentFilter === 'restricted' ? s.isAdminRestricted : !s.isAdminRestricted);
    return matchesSearch && matchesFilter;
  });

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedSheets = [...filteredSheets].sort((a: MusicSheet, b: MusicSheet) => {
    if (!sheetSortConfig) return 0;
    const { key, direction } = sheetSortConfig;
    let valA: string | number = a[key as keyof MusicSheet] as string | number;
    let valB: string | number = b[key as keyof MusicSheet] as string | number;
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const sortedUsers = [...filteredUsers].sort((a: User, b: User) => {
    if (!userSortConfig) return 0;
    const { key, direction } = userSortConfig;
    let valA: string | number = (a[key as keyof User] ?? '') as string | number;
    let valB: string | number = (b[key as keyof User] ?? '') as string | number;
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSheetColumn = (col: keyof typeof visibleSheetColumns) => {
    setVisibleSheetColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleUserColumn = (col: keyof typeof visibleUserColumns) => {
    setVisibleUserColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  // Pagination
  const pagedSheets = sortedSheets.slice((sheetPage - 1) * PAGE_SIZE, sheetPage * PAGE_SIZE);
  const totalSheetPages = Math.max(1, Math.ceil(sortedSheets.length / PAGE_SIZE));
  const pagedUsers = sortedUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
  const totalUserPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));

  // Reset pages on search change
  useEffect(() => { setSheetPage(1); setUserPage(1); }, [searchTerm]);
  useEffect(() => { setSheetPage(1); }, [contentFilter]);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const tableBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  const SortIcon = ({ colKey, type }: { colKey: string, type: 'sheet' | 'user' }) => {
    const config = type === 'sheet' ? sheetSortConfig : userSortConfig;
    if (config?.key !== colKey) return null;
    return config.direction === 'asc' ? <ArrowUp size={14} className="ml-1 text-green-500" /> : <ArrowDown size={14} className="ml-1 text-green-500" />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Admin Dashboard</h1>
      </div>

      <div className={`flex w-fit rounded-xl overflow-hidden border transition-colors p-1 ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-200 border-slate-300'}`}>
        <button 
          onClick={() => { setActiveTab('users'); setViewMode('list'); }}
          className={`px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'users' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <Users size={16} /> <span className="hidden sm:inline">User Management</span><span className="sm:hidden">Users</span>
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'content' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <Music size={16} /> <span className="hidden sm:inline">Content Moderation</span><span className="sm:hidden">Content</span>
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'requests' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <BookOpen size={16} /> <span className="hidden sm:inline">Sheet Requests</span><span className="sm:hidden">Requests</span>
        </button>
        <button
          onClick={() => setActiveTab('promos')}
          className={`px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'promos' ? (darkMode ? 'bg-slate-800 text-slate-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800')}`}
        >
          <Tag size={16} /> <span className="hidden sm:inline">Promo Codes</span><span className="sm:hidden">Promos</span>
        </button>
      </div>

      {/* Content filter pills — shown only on content tab */}
      {activeTab === 'content' && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'approved', 'restricted'] as const).map(f => (
            <button
              key={f}
              onClick={() => setContentFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize ${
                contentFilter === f
                  ? 'bg-green-500 text-white border-green-500'
                  : darkMode
                    ? 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {(activeTab === 'content' || activeTab === 'users') && <div className="space-y-6">
        <div className={`border rounded-2xl overflow-hidden transition-colors ${tableBg}`}>
          <div className={`p-4 border-b flex flex-col sm:flex-row justify-between items-center gap-4 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'users' ? "Filter users..." : "Filter sheets..."}
                className={`w-full border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-100 text-slate-800'}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" ref={columnMenuRef}>
                <button 
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-all ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-100' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'}`}
                >
                  <Settings2 size={16} />
                  Columns
                </button>

                {showColumnMenu && (
                  <div className={`absolute right-0 mt-2 w-48 border rounded-xl shadow-2xl py-2 z-[70] animate-in fade-in slide-in-from-top-2 duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    {activeTab === 'content' ? (
                      (Object.keys(visibleSheetColumns) as Array<keyof typeof visibleSheetColumns>).map((col) => (
                        <button
                          key={col as string}
                          onClick={() => toggleSheetColumn(col)}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span className="capitalize">{(col as string).replace(/([A-Z])/g, ' $1').trim()}</span>
                          {visibleSheetColumns[col] && <Check size={14} className="text-green-500" />}
                        </button>
                      ))
                    ) : (
                      (Object.keys(visibleUserColumns) as Array<keyof typeof visibleUserColumns>).map((col) => (
                        <button
                          key={col as string}
                          onClick={() => toggleUserColumn(col)}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          <span className="capitalize">{(col as string).replace(/([A-Z])/g, ' $1').trim()}</span>
                          {visibleUserColumns[col] && <Check size={14} className="text-green-500" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {activeTab === 'content' && (
                <div className={`flex border rounded-lg overflow-hidden shrink-0 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                  <button onClick={() => setViewMode('list')} className={`p-2 transition-colors ${viewMode === 'list' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}><List size={16} /></button>
                  <button onClick={() => setViewMode('grid')} className={`p-2 transition-colors ${viewMode === 'grid' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}><Grid size={16} /></button>
                </div>
              )}
            </div>
          </div>

          {activeTab === 'content' ? (
            viewMode === 'grid' ? (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {pagedSheets.map(sheet => (
                  <div key={sheet.id} className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${cardBg}`}>
                    <div 
                      className="aspect-[3/4] overflow-hidden relative cursor-pointer" 
                      onClick={() => onPreview(sheet)}
                    >
                      <img 
                        src={sheet.thumbnailUrl} 
                        alt={sheet.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                      
                      {/* Badge moved to top-left */}
                      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start group-hover:opacity-0 transition-opacity">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-lg ${sheet.isAdminRestricted ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                          {sheet.isAdminRestricted ? 'Restricted' : 'Approved'}
                        </div>
                      </div>

                      {/* Mobile Trigger Button moved to top-right */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMobileMenuId(activeMobileMenuId === sheet.id ? null : sheet.id);
                        }}
                        aria-label="More actions"
                        className="md:hidden absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
                      >
                        <MoreVertical size={16} />
                      </button>

                      <div className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col p-4 ${activeMobileMenuId === sheet.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {/* Centered actions to avoid overlap with top controls */}
                        <div className="flex-1 flex items-center justify-center gap-4 transform -translate-y-2 group-hover:translate-y-0 transition-transform delay-75">
                          <button
                            type="button"
                            onClick={(e) => toggleAdminRestriction(e, sheet)}
                            aria-label={sheet.isAdminRestricted ? 'Approve sheet' : 'Restrict sheet'}
                            className={`p-3 rounded-full backdrop-blur-md border border-white/20 text-white transition-all hover:scale-110 active:scale-90 ${sheet.isAdminRestricted ? 'bg-red-500/40 hover:bg-red-500' : 'bg-green-500/40 hover:bg-green-500'}`}
                            title={sheet.isAdminRestricted ? 'Approve' : 'Restrict'}
                          >
                            {sheet.isAdminRestricted ? <Unlock size={20}/> : <Lock size={20}/>}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSheet(e, sheet)}
                            aria-label="Delete sheet permanently"
                            className="p-3 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white hover:bg-red-500 transition-all hover:scale-110 active:scale-90"
                            title="Delete Permanently"
                          >
                            <Trash2 size={20}/>
                          </button>
                        </div>

                        <div className="flex shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = sheet.pdfUrl; a.download = `${sheet.title}.pdf`; a.click(); }}
                            aria-label={`Download ${sheet.title}`}
                            className="w-full py-2.5 bg-green-500 text-white text-sm font-bold rounded-xl transform translate-y-2 group-hover:translate-y-0 transition-transform shadow-lg active:scale-95 flex items-center justify-center gap-2 hover:bg-green-600"
                          >
                            <Download size={18} />
                            Download
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className={`font-bold truncate mb-1 ${textPrimary}`}>
                        {sheet.title}
                      </h3>
                      <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                        <span className="truncate">by {sheet.uploadedBy.split('@')[0]}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
                          <span className="flex items-center gap-1"><Download size={12} /> {sheet.downloads}</span>
                          <span className="flex items-center gap-1"><Heart size={12} /> {sheet.likesCount}</span>
                          <span className="flex items-center gap-1"><MessageSquare size={12} /> {sheet.commentsCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[700px] md:min-w-full">
                  <thead className={darkMode ? 'bg-slate-950/50' : 'bg-slate-50'}>
                    <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      {visibleSheetColumns.sheet && <th className="px-4 md:px-6 py-4">Sheet</th>}
                      {visibleSheetColumns.title && (
                        <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('title')}>
                          <div className="flex items-center">Title <SortIcon colKey="title" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.composer && (
                        <th className="hidden md:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('composer')}>
                          <div className="flex items-center">Composed by <SortIcon colKey="composer" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.uploader && (
                        <th className="hidden lg:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('uploadedBy')}>
                          <div className="flex items-center">Uploaded by <SortIcon colKey="uploadedBy" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.status && (
                        <th className="hidden lg:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('isAdminRestricted')}>
                          <div className="flex items-center">Status <SortIcon colKey="isAdminRestricted" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.uploadedAt && (
                        <th className="hidden xl:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('uploadedAt')}>
                          <div className="flex items-center">Date Uploaded <SortIcon colKey="uploadedAt" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.views && (
                        <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('views')}>
                          <div className="flex justify-center items-center">Views <SortIcon colKey="views" type="sheet" /></div>
                        </th>
                      )}
                      {visibleSheetColumns.downloads && (
                        <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSheetSort('downloads')}>
                          <div className="flex justify-center items-center">Downloads <SortIcon colKey="downloads" type="sheet" /></div>
                        </th>
                      )}
                      <th className="hidden md:table-cell px-6 py-4 text-center"><div className="flex justify-center"><Heart size={12} /></div></th>
                      <th className="hidden md:table-cell px-6 py-4 text-center"><div className="flex justify-center"><MessageSquare size={12} /></div></th>
                      <th className="px-4 md:px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {pagedSheets.map(sheet => (
                      <tr key={sheet.id} className={darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                        {visibleSheetColumns.sheet && (
                          <td className="px-4 md:px-6 py-4">
                            <button 
                              type="button"
                              onClick={() => onPreview(sheet)}
                              className="relative overflow-hidden rounded border border-slate-700 active:scale-95 transition-transform group/img"
                            >
                              <img src={sheet.thumbnailUrl} className="w-10 h-10 object-cover" alt="" />
                              <div className="absolute inset-0 bg-green-500/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye size={14} className="text-white" />
                              </div>
                            </button>
                          </td>
                        )}
                        {visibleSheetColumns.title && (
                          <td className={`px-4 md:px-6 py-4 text-sm font-medium cursor-pointer hover:text-green-500 transition-colors ${textPrimary}`} onClick={() => onPreview(sheet)}>
                            {sheet.title}
                          </td>
                        )}
                        {visibleSheetColumns.composer && <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500">{sheet.composer}</td>}
                        {visibleSheetColumns.uploader && <td className="hidden lg:table-cell px-6 py-4 text-sm text-slate-500">{sheet.uploadedBy.split('@')[0]}</td>}
                        {visibleSheetColumns.status && (
                          <td className="hidden lg:table-cell px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sheet.isAdminRestricted ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                              {sheet.isAdminRestricted ? 'Restricted' : 'Approved'}
                            </span>
                          </td>
                        )}
                        {visibleSheetColumns.uploadedAt && (
                          <td className="hidden xl:table-cell px-6 py-4 text-sm text-slate-500">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-slate-600" />
                              {sheet.uploadedAt}
                            </div>
                          </td>
                        )}
                        {visibleSheetColumns.views && <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.views}</td>}
                        {visibleSheetColumns.downloads && <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.downloads}</td>}
                        <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.likesCount}</td>
                        <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.commentsCount}</td>
                        <td className="px-4 md:px-6 py-4 text-right">
                          {/* Added text-white on mobile to admin content list actions as requested */}
                          <div className="flex items-center justify-end gap-1 max-md:text-white">
                            <button
                              type="button"
                              onClick={(e) => toggleAdminRestriction(e, sheet)}
                              aria-label={sheet.isAdminRestricted ? 'Approve sheet' : 'Restrict sheet'}
                              className={`p-2 transition-colors ${sheet.isAdminRestricted ? 'hover:text-green-500' : 'hover:text-red-500'}`}
                              title={sheet.isAdminRestricted ? 'Approve' : 'Restrict'}
                            >
                              {sheet.isAdminRestricted ? <Unlock size={16}/> : <Lock size={16}/>}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = sheet.pdfUrl; a.download = `${sheet.title}.pdf`; a.click(); }}
                              aria-label={`Download ${sheet.title}`}
                              className="p-2 hover:text-green-500 transition-colors"
                              title="Download"
                            >
                              <Download size={16}/>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSheet(e, sheet)}
                              aria-label="Delete sheet permanently"
                              className="p-2 hover:text-red-500 transition-colors"
                              title="Delete Permanently"
                            >
                              <Trash2 size={16}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'users' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[500px] md:min-w-full">
                <thead className={darkMode ? 'bg-slate-950/50' : 'bg-slate-50'}>
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    {visibleUserColumns.user && (
                      <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleUserSort('displayName')}>
                        <div className="flex items-center">User <SortIcon colKey="displayName" type="user" /></div>
                      </th>
                    )}
                    {visibleUserColumns.role && (
                      <th className="hidden sm:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleUserSort('role')}>
                        <div className="flex items-center">Role <SortIcon colKey="role" type="user" /></div>
                      </th>
                    )}
                    {visibleUserColumns.status && (
                      <th className="hidden md:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleUserSort('status')}>
                        <div className="flex items-center">Status <SortIcon colKey="status" type="user" /></div>
                      </th>
                    )}
                    {visibleUserColumns.createdAt && <th className="hidden lg:table-cell px-6 py-4">Email</th>}
                    <th className="px-4 md:px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {pagedUsers.map(user => (
                    <tr key={user.id} className={darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      {visibleUserColumns.user && (
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
                              {user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={`text-sm font-medium truncate ${textPrimary}`}>{user.displayName || user.email.split('@')[0]}</span>
                              <span className="text-[10px] text-slate-500 truncate">{user.email}</span>
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleUserColumns.role && (
                        <td className="hidden sm:table-cell px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                            {user.role}
                          </span>
                        </td>
                      )}
                      {visibleUserColumns.status && (
                        <td className="hidden md:table-cell px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${user.status === 'Active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                            {user.status}
                          </span>
                        </td>
                      )}
                      {visibleUserColumns.createdAt && (
                        <td className="hidden lg:table-cell px-6 py-4 text-sm text-slate-500">
                          {user.email}
                        </td>
                      )}
                      <td className="px-4 md:px-6 py-4 text-right">
                        {/* Added text-white on mobile to admin user list actions as requested */}
                        <div className="flex items-center justify-end gap-1 max-md:text-white">
                          <button
                            onClick={() => toggleUserRole(user)}
                            aria-label={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                            className="p-2 hover:text-purple-500 transition-colors"
                            title="Toggle Admin Role"
                          >
                            <Shield size={16}/>
                          </button>
                          <button
                            onClick={() => toggleUserStatus(user)}
                            aria-label={user.status === 'Active' ? 'Deactivate user' : 'Activate user'}
                            className={`p-2 transition-colors ${user.status === 'Active' ? 'hover:text-red-500' : 'hover:text-green-500'}`}
                            title={user.status === 'Active' ? "Deactivate User" : "Activate User"}
                          >
                            {user.status === 'Active' ? <Lock size={16}/> : <Unlock size={16}/>}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            aria-label="Delete user"
                            className="p-2 hover:text-red-500 transition-colors"
                            title="Delete User"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pagedUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        No users found. New signups will appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>}

      {/* Pagination footer */}
      {activeTab === 'content' && totalSheetPages > 1 && (
        <div className={`flex items-center justify-between text-sm ${textSecondary}`}>
          <span>Showing {Math.min((sheetPage - 1) * PAGE_SIZE + 1, sortedSheets.length)}–{Math.min(sheetPage * PAGE_SIZE, sortedSheets.length)} of {sortedSheets.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setSheetPage(p => Math.max(1, p - 1))} disabled={sheetPage === 1} className="p-1.5 rounded hover:text-green-500 transition-colors disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span>{sheetPage} / {totalSheetPages}</span>
            <button onClick={() => setSheetPage(p => Math.min(totalSheetPages, p + 1))} disabled={sheetPage === totalSheetPages} className="p-1.5 rounded hover:text-green-500 transition-colors disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
      {activeTab === 'users' && totalUserPages > 1 && (
        <div className={`flex items-center justify-between text-sm ${textSecondary}`}>
          <span>Showing {Math.min((userPage - 1) * PAGE_SIZE + 1, sortedUsers.length)}–{Math.min(userPage * PAGE_SIZE, sortedUsers.length)} of {sortedUsers.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} className="p-1.5 rounded hover:text-green-500 transition-colors disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span>{userPage} / {totalUserPages}</span>
            <button onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} disabled={userPage === totalUserPages} className="p-1.5 rounded hover:text-green-500 transition-colors disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* Requests management tab */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          {/* Status filter pills */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'open', 'in_progress', 'fulfilled', 'closed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRequestStatusFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors capitalize ${
                  requestStatusFilter === f
                    ? 'bg-amber-500 text-white border-amber-500'
                    : darkMode
                      ? 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                      : 'bg-transparent border-slate-200 text-slate-600 hover:border-slate-400'
                }`}
              >
                {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {requestsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`h-16 rounded-2xl border animate-pulse ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
              ))}
            </div>
          ) : (
            <div className={`border rounded-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <table className="w-full text-sm">
                <thead className={`text-xs uppercase tracking-wider ${darkMode ? 'bg-slate-950/50 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Title</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left font-medium">Composer</th>
                    <th className="hidden lg:table-cell px-4 py-3 text-left font-medium">Requested By</th>
                    <th className="px-4 py-3 text-center font-medium">Votes</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {adminRequests
                    .filter(r => requestStatusFilter === 'all' || r.status === requestStatusFilter)
                    .map(req => (
                      <tr key={req.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3">
                          <p className={`font-medium truncate max-w-[200px] ${textPrimary}`}>{req.title}</p>
                          {req.notes && <p className={`text-xs truncate max-w-[200px] ${textSecondary}`}>{req.notes}</p>}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-sm text-slate-500">{req.composer ?? '—'}</td>
                        <td className="hidden lg:table-cell px-4 py-3 text-sm text-slate-500">{req.requester_name ?? req.requester_email ?? 'Anonymous'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`flex items-center justify-center gap-1 text-sm font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                            <ThumbsUp size={13} /> {req.votes_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={req.status}
                            onChange={e => handleRequestStatusChange(req.id, e.target.value as SheetRequest['status'])}
                            className={`text-xs rounded-lg px-2 py-1 border cursor-pointer focus:outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="closed">Closed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  {adminRequests.filter(r => requestStatusFilter === 'all' || r.status === requestStatusFilter).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No requests found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Promo codes tab ────────────────────────────────────────────────── */}
      {activeTab === 'promos' && (
        <div className="space-y-6 max-w-2xl">

          {/* Header row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-amber-400" />
              <h2 className={`font-bold text-lg ${textPrimary}`}>Founding Member Promo Codes</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadPromos}
                disabled={promosLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                  ${darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <RefreshCw size={13} className={promosLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => { setShowPromoForm(!showPromoForm); setPromoMsg(null); setLastCreatedCode(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-green-400 transition-colors"
              >
                <Plus size={13} /> New Code
              </button>
            </div>
          </div>

          {/* Last created code banner */}
          {lastCreatedCode && (
            <div className={`p-4 rounded-xl border flex items-center gap-3 flex-wrap ${darkMode ? 'bg-green-950/30 border-green-800/50' : 'bg-green-50 border-green-200'}`}>
              <CheckCircle2 size={15} className="text-green-500 shrink-0" />
              <span className={`text-sm font-medium ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Created:</span>
              <code className={`font-mono font-bold flex-1 tracking-wider ${darkMode ? 'text-green-400' : 'text-green-800'}`}>{lastCreatedCode}</code>
              <button
                onClick={() => copyCode(lastCreatedCode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0
                  ${codeCopied ? 'bg-green-500 text-slate-950' : (darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50')}`}
              >
                <Copy size={12} />{codeCopied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => setLastCreatedCode(null)} className={`p-1 rounded-lg ${darkMode ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}>
                <X size={13} />
              </button>
            </div>
          )}

          {/* Create form */}
          {showPromoForm && (
            <div className={`p-4 rounded-xl border space-y-3 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Code *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={e => setPromoCodeInput(e.target.value.toUpperCase())}
                      placeholder="FOUNDING-XXXX-XXXX"
                      maxLength={32}
                      className={`flex-1 min-w-0 px-3 py-2 rounded-xl border text-sm font-mono outline-none transition-colors
                        ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-600 focus:border-green-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-green-500'}`}
                    />
                    <button
                      type="button"
                      onClick={generateCode}
                      title="Auto-generate"
                      className={`px-2.5 rounded-xl border text-xs font-bold shrink-0 transition-colors
                        ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      Gen
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Max uses</label>
                  <input
                    type="number" min={1} value={promoMaxUses}
                    onChange={e => setPromoMaxUses(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
                      ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-green-500' : 'bg-white border-slate-200 text-slate-900 focus:border-green-500'}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-medium block mb-1 ${textSecondary}`}>Expires (optional)</label>
                  <input
                    type="date" value={promoExpiry}
                    onChange={e => setPromoExpiry(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
                      ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-green-500' : 'bg-white border-slate-200 text-slate-900 focus:border-green-500'}`}
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={createPromo}
                  disabled={creatingPromo || !promoCodeInput.trim()}
                  className="px-4 py-2 bg-green-500 text-slate-950 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-green-400 transition-colors"
                >
                  {creatingPromo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create Code
                </button>
                <button
                  onClick={generateCode}
                  className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors
                    ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <RefreshCw size={14} /> Re-generate
                </button>
                <button
                  onClick={() => { setShowPromoForm(false); setPromoMsg(null); }}
                  className={`px-3 py-2 rounded-xl text-sm ${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Cancel
                </button>
              </div>
              {promoMsg && (
                <p className={`text-sm flex items-center gap-1.5 ${promoMsg.ok ? 'text-green-500' : 'text-red-400'}`}>
                  {promoMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {promoMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Code list */}
          {promosLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-green-500" />
            </div>
          ) : promoCodes.length === 0 ? (
            <p className={`text-sm py-4 ${textSecondary}`}>No promo codes yet. Create one above.</p>
          ) : (
            <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              {promoCodes.map((code, i) => (
                <div
                  key={code.id}
                  className={`flex items-center gap-3 px-4 py-3 flex-wrap ${i > 0 ? (darkMode ? 'border-t border-slate-800' : 'border-t border-slate-100') : ''}`}
                >
                  <code className={`font-mono text-sm font-bold flex-1 min-w-0 truncate ${code.is_active ? (darkMode ? 'text-green-400' : 'text-green-700') : (darkMode ? 'text-slate-600 line-through' : 'text-slate-400 line-through')}`}>
                    {code.code}
                  </code>
                  <span className={`text-xs shrink-0 ${textSecondary}`}>{code.used_count}/{code.max_uses} uses</span>
                  {code.expires_at && (
                    <span className={`text-xs hidden sm:inline shrink-0 ${textSecondary}`}>
                      exp. {new Date(code.expires_at).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${code.is_active ? 'bg-green-500/10 text-green-500' : (darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>
                    {code.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {code.is_active && (
                    <>
                      <button
                        onClick={() => copyCode(code.code)}
                        title="Copy code"
                        className={`p-1.5 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => deactivatePromo(code.id)}
                        title="Deactivate"
                        className={`p-1.5 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-500'}`}
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmation && (
        <AdminDeleteConfirmModal
          title={deleteConfirmation.title}
          darkMode={darkMode}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={executeDeletion}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      )}

      {/* Role change confirmation modal */}
      <Modal isOpen={!!roleChangeConfirmation} onClose={() => setRoleChangeConfirmation(null)} darkMode={darkMode} maxWidth="md">
        {roleChangeConfirmation && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="text-purple-500" size={32} />
            </div>
            <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>
              {roleChangeConfirmation.newRole === 'admin' ? 'Promote to Admin?' : 'Remove Admin Access?'}
            </h2>
            <p className={`mb-8 ${textSecondary}`}>
              {roleChangeConfirmation.newRole === 'admin'
                ? `Promote ${roleChangeConfirmation.user.displayName || roleChangeConfirmation.user.email} to Admin? They will have full access to all content and user management.`
                : `Remove admin access from ${roleChangeConfirmation.user.displayName || roleChangeConfirmation.user.email}?`}
            </p>
            <div className="flex gap-3">
              <button autoFocus onClick={() => setRoleChangeConfirmation(null)} className={`flex-1 py-3.5 font-bold rounded-xl border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>Cancel</button>
              <button onClick={executeRoleChange} className="flex-1 py-3.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-purple-500/20 active:scale-95 flex items-center justify-center gap-2"><Shield size={18} /> Confirm</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ── Delete confirmation modal for AdminDashboard ─────────────────────────────
interface AdminDeleteConfirmModalProps {
  title: string;
  darkMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  textPrimary: string;
  textSecondary: string;
}

const AdminDeleteConfirmModal: React.FC<AdminDeleteConfirmModalProps> = ({ title, darkMode, onCancel, onConfirm, textPrimary, textSecondary }) => {
  return (
    <Modal isOpen={true} onClose={onCancel} darkMode={darkMode} maxWidth="md">
      <div className="p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="text-red-500" size={32} />
        </div>
        <div className="text-center mb-8">
          <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Confirm Deletion</h2>
          <p className={`${textSecondary}`}>
            Are you sure you want to permanently delete <span className="font-bold text-red-500">{title}</span>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            autoFocus
            onClick={onCancel}
            className={`flex-1 py-3.5 font-bold rounded-xl border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

export default AdminDashboard;
