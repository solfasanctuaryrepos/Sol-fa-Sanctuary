
import { Search, Trash2, ChevronDown, Music, List, Grid, X, ArrowUp, ArrowDown, Lock, Unlock, Globe, Eye, Download, Check, Settings2, Calendar, Users, Shield, User as UserIcon, AlertTriangle, MoreVertical, ChevronLeft, ChevronRight, Heart, MessageSquare } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { AdminTab, MusicSheet, User } from '../types';
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
      const tableName = type === 'sheet' ? 'sheets' : 'profiles';
      const { error } = await db.from(tableName).delete().eq('id', id);
      if (error) throw error;
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

      <div className="space-y-6">
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
          ) : (
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
          )}
        </div>
      </div>

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
