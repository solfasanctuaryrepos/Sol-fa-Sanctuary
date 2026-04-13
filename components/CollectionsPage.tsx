import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, X, Globe, Lock, Trash2, Copy, Check, ChevronLeft, AlertTriangle, Loader2, FolderOpen } from 'lucide-react';
import { Collection, MusicSheet } from '../types';
import { db } from '../supabase';

interface CollectionsPageProps {
  darkMode: boolean;
  currentUserId: string;
  currentUserEmail: string;
  onPreview: (sheet: MusicSheet) => void;
}

const CollectionsPage: React.FC<CollectionsPageProps> = ({
  darkMode,
  currentUserId,
  currentUserEmail,
  onPreview,
}) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [collectionSheets, setCollectionSheets] = useState<MusicSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [removingSheetId, setRemovingSheetId] = useState<string | null>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900';

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from('collections')
      .select('*')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });

    if (data) {
      // Fetch sheet counts
      const ids = data.map((c: any) => c.id);
      let countMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: csData } = await db
          .from('collection_sheets')
          .select('collection_id')
          .in('collection_id', ids);
        (csData || []).forEach((row: any) => {
          countMap[row.collection_id] = (countMap[row.collection_id] || 0) + 1;
        });
      }

      setCollections(data.map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        userEmail: c.user_email,
        name: c.name,
        description: c.description,
        isPublic: c.is_public,
        createdAt: c.created_at,
        sheetCount: countMap[c.id] || 0,
      })));
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);

    const { data, error } = await db
      .from('collections')
      .insert({
        user_id: currentUserId,
        user_email: currentUserEmail,
        name: newName.trim(),
        description: newDescription.trim() || null,
        is_public: newIsPublic,
      })
      .select()
      .single();

    if (error) {
      setCreateError('Failed to create collection. Please try again.');
    } else {
      const newCol: Collection = {
        id: data.id,
        userId: data.user_id,
        userEmail: data.user_email,
        name: data.name,
        description: data.description,
        isPublic: data.is_public,
        createdAt: data.created_at,
        sheetCount: 0,
      };
      setCollections(prev => [newCol, ...prev]);
      setNewName('');
      setNewDescription('');
      setNewIsPublic(false);
      setShowNewForm(false);
    }
    setCreating(false);
  };

  const handleDeleteCollection = async (id: string) => {
    setDeleteConfirmId(null);
    setCollections(prev => prev.filter(c => c.id !== id));
    if (activeCollection?.id === id) setActiveCollection(null);
    await db.from('collection_sheets').delete().eq('collection_id', id);
    await db.from('collections').delete().eq('id', id);
  };

  const openCollection = async (col: Collection) => {
    setActiveCollection(col);
    setLoadingSheets(true);
    const { data: cs } = await db
      .from('collection_sheets')
      .select('sheet_id')
      .eq('collection_id', col.id)
      .order('added_at', { ascending: false });

    if (cs && cs.length > 0) {
      const sheetIds = cs.map((r: any) => r.sheet_id);
      const { data: sheetsData } = await db
        .from('sheets')
        .select('*')
        .in('id', sheetIds);

      setCollectionSheets((sheetsData || []).map((s: any) => ({
        ...s,
        uploadedAt: s.uploaded_at ? new Date(s.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        fileSize: s.file_size,
        isPublic: s.is_public,
        isAdminRestricted: s.is_admin_restricted,
        thumbnailUrl: s.thumbnail_url,
        pdfUrl: s.pdf_url,
        uploadedBy: s.uploaded_by,
      })));
    } else {
      setCollectionSheets([]);
    }
    setLoadingSheets(false);
  };

  const handleRemoveSheet = async (sheetId: string) => {
    if (!activeCollection) return;
    setRemovingSheetId(sheetId);
    setCollectionSheets(prev => prev.filter(s => s.id !== sheetId));
    await db.from('collection_sheets')
      .delete()
      .eq('collection_id', activeCollection.id)
      .eq('sheet_id', sheetId);
    setCollections(prev => prev.map(c =>
      c.id === activeCollection.id
        ? { ...c, sheetCount: Math.max(0, (c.sheetCount ?? 1) - 1) }
        : c
    ));
    setRemovingSheetId(null);
  };

  const handleShare = (col: Collection) => {
    const url = `${window.location.origin}${window.location.pathname}?collection=${col.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(col.id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  // Detail view
  if (activeCollection) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setActiveCollection(null); setCollectionSheets([]); }}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className={`text-2xl font-serif font-bold ${textPrimary}`}>{activeCollection.name}</h1>
            {activeCollection.description && (
              <p className={`text-sm mt-1 ${textSecondary}`}>{activeCollection.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${activeCollection.isPublic ? 'bg-green-500/10 text-green-500 border-green-500/20' : darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {activeCollection.isPublic ? <Globe size={10} /> : <Lock size={10} />}
              {activeCollection.isPublic ? 'Public' : 'Private'}
            </span>
            <button
              onClick={() => handleShare(activeCollection)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              {copiedId === activeCollection.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiedId === activeCollection.id ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>

        {loadingSheets ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-green-500" />
          </div>
        ) : collectionSheets.length === 0 ? (
          <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">This collection is empty.</p>
            <p className="text-xs mt-1">Add sheets from the preview page using the folder icon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {collectionSheets.map(s => (
              <div key={s.id} className={`border rounded-2xl overflow-hidden group transition-all ${cardBg}`}>
                <div
                  className="aspect-[3/4] overflow-hidden relative cursor-pointer"
                  onClick={() => onPreview(s)}
                >
                  <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-white text-slate-900 px-3 py-1.5 rounded-xl font-bold text-xs">Preview</div>
                  </div>
                </div>
                <div className="p-3">
                  <p className={`text-xs font-bold truncate ${textPrimary}`}>{s.title}</p>
                  <p className={`text-[10px] truncate mt-0.5 ${textSecondary}`}>{s.composer}</p>
                  <button
                    onClick={() => handleRemoveSheet(s.id)}
                    disabled={removingSheetId === s.id}
                    className="mt-2 w-full flex items-center justify-center gap-1 py-1 text-[10px] text-red-500 hover:text-red-400 transition-colors font-bold"
                  >
                    <X size={10} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4">
          {deleteConfirmId === activeCollection.id ? (
            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${darkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <p className={`text-sm flex-1 ${textSecondary}`}>Delete this collection permanently?</p>
              <button onClick={() => handleDeleteCollection(activeCollection.id)} className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirmId(null)} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirmId(activeCollection.id)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 transition-colors font-medium"
            >
              <Trash2 size={16} /> Delete Collection
            </button>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>My Collections</h1>
          <p className={textSecondary}>Organise your favourite sheets into collections.</p>
        </div>
        <button
          onClick={() => setShowNewForm(prev => !prev)}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-green-500/10 active:scale-95"
        >
          <Plus size={18} />
          New Collection
        </button>
      </div>

      {/* New collection inline form */}
      {showNewForm && (
        <div className={`rounded-2xl border p-6 space-y-4 animate-in slide-in-from-top-2 duration-200 ${cardBg}`}>
          <h2 className={`font-bold text-lg ${textPrimary}`}>New Collection</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className={`text-sm font-medium block mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Name *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Sunday Service — April 2026"
                className={`w-full rounded-xl px-4 py-2.5 border focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm ${inputBg}`}
              />
            </div>
            <div>
              <label className={`text-sm font-medium block mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Description</label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Optional description…"
                rows={2}
                className={`w-full rounded-xl px-4 py-2.5 border focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm resize-none ${inputBg}`}
              />
            </div>
            <div className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div>
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Make Public</p>
                <p className="text-xs text-slate-500">Anyone with the link can view this collection.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={newIsPublic} onChange={e => setNewIsPublic(e.target.checked)} />
                <div className="w-11 h-6 bg-slate-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowNewForm(false); setCreateError(null); }}
                className={`flex-1 py-2.5 rounded-xl border font-bold text-sm transition-all ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-green-500" />
        </div>
      ) : collections.length === 0 ? (
        <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">You haven't created any collections yet.</p>
          <p className="text-xs mt-1">Tap "New Collection" above to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {collections.map(col => (
            <div
              key={col.id}
              className={`border rounded-2xl overflow-hidden transition-all group cursor-pointer ${cardBg} hover:border-green-500/50`}
              onClick={() => openCollection(col)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <BookOpen size={20} className="text-green-500" />
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${col.isPublic ? 'bg-green-500/10 text-green-500 border-green-500/20' : darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {col.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                    {col.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
                <h3 className={`font-bold text-lg leading-tight mb-1 group-hover:text-green-500 transition-colors ${textPrimary}`}>
                  {col.name}
                </h3>
                {col.description && (
                  <p className={`text-xs line-clamp-2 mb-3 ${textSecondary}`}>{col.description}</p>
                )}
                <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                  <span>{col.sheetCount ?? 0} sheet{col.sheetCount !== 1 ? 's' : ''}</span>
                  <span>{new Date(col.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
              <div className={`px-5 py-3 border-t flex items-center gap-2 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleShare(col)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {copiedId === col.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copiedId === col.id ? 'Copied!' : 'Share link'}
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setDeleteConfirmId(col.id)}
                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                  title="Delete collection"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {deleteConfirmId === col.id && (
                <div
                  className={`px-5 py-3 border-t flex items-center gap-3 animate-in slide-in-from-top-1 duration-150 ${darkMode ? 'border-red-500/20 bg-red-500/5' : 'border-red-100 bg-red-50'}`}
                  onClick={e => e.stopPropagation()}
                >
                  <p className={`text-xs flex-1 ${textSecondary}`}>Delete permanently?</p>
                  <button onClick={() => handleDeleteCollection(col.id)} className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors">Delete</button>
                  <button onClick={() => setDeleteConfirmId(null)} className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;
