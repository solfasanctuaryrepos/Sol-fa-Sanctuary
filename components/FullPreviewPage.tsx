import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Share2, Eye, Calendar, User, FileText, Music as MusicIcon, X, ExternalLink, Menu, ChevronUp, Loader2, AlertTriangle, AlertCircle, Heart, FolderPlus, Trash2, MessageSquare, Send } from 'lucide-react';
import { MusicSheet, Comment, Collection } from '../types';
import { db } from '../supabase';
import { getPdfUrl } from '../utils/signedUrl';

interface FullPreviewPageProps {
  sheet: MusicSheet | null;
  darkMode: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
  isLoggedIn: boolean;
  onAuthRequired: () => void;
  currentUserId?: string;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  userFavorites?: string[];
  onFavoritesChange?: (favs: string[]) => void;
  onViewProfile?: (email: string) => void;
  sheets?: MusicSheet[];
  onPreview?: (sheet: MusicSheet) => void;
  onNavigateCollections?: () => void;
}

// ─── Module-level render queue ────────────────────────────────────────────────
let _activeRenders = 0;
const _MAX_CONCURRENT = 2;
const _queue: Array<() => void> = [];

const enqueueRender = (task: () => void) => {
  _queue.push(task);
  drainQueue();
};

const drainQueue = () => {
  while (_activeRenders < _MAX_CONCURRENT && _queue.length > 0) {
    _activeRenders++;
    _queue.shift()!();
  }
};

const releaseRender = () => {
  _activeRenders = Math.max(0, _activeRenders - 1);
  drainQueue();
};
// ─────────────────────────────────────────────────────────────────────────────

interface LazyPdfPageProps {
  index: number;
  pdfDoc: any;
  forceRender: boolean;
  darkMode: boolean;
  sheetTitle: string;
  isFirstPage: boolean;
}

const LazyPdfPage: React.FC<LazyPdfPageProps> = ({
  index,
  pdfDoc,
  forceRender,
  darkMode,
  sheetTitle,
  isFirstPage,
}) => {
  const [isIntersecting, setIsIntersecting] = useState(isFirstPage);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasQueued = useRef(false);

  useEffect(() => {
    if (isFirstPage || forceRender) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '200px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isFirstPage, forceRender]);

  useEffect(() => {
    if (!pdfDoc || (!isIntersecting && !forceRender)) return;
    if (hasQueued.current) return;
    hasQueued.current = true;

    let cancelled = false;

    const doRender = async () => {
      try {
        const page = await pdfDoc.getPage(index);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        canvas.toBlob(
          (blob) => {
            if (blob && !cancelled) setImgUrl(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        console.error(`Page ${index} render error:`, err);
      } finally {
        releaseRender();
      }
    };

    enqueueRender(doRender);

    return () => {
      cancelled = true;
      hasQueued.current = false;
    };
  }, [pdfDoc, isIntersecting, forceRender, index]);

  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  const textSecondary = darkMode ? 'text-slate-500' : 'text-slate-400';

  return (
    <div ref={containerRef} className="score-page min-h-[500px] w-full flex items-center justify-center relative">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`${sheetTitle} - Page ${index}`}
          className="w-full h-auto rounded shadow-lg border border-slate-700/10 transition-opacity duration-500 ease-in opacity-100"
        />
      ) : (
        <div className={`flex flex-col items-center gap-3 no-print ${textSecondary}`}>
          <Loader2 className="animate-spin opacity-20" size={32} />
          <p className="text-xs font-serif italic">Preparing Page {index}…</p>
        </div>
      )}
    </div>
  );
};

// ─── timeAgo helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// ─── CommentsSection ──────────────────────────────────────────────────────────
interface CommentsSectionProps {
  sheetId: string;
  currentUserId?: string;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  isAdmin?: boolean;
  darkMode: boolean;
}

const CommentsSection: React.FC<CommentsSectionProps> = ({
  sheetId,
  currentUserId,
  currentUserEmail,
  currentUserDisplayName,
  isAdmin,
  darkMode,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';

  // Fetch comments on mount
  useEffect(() => {
    const fetchComments = async () => {
      setLoading(true);
      const { data, error } = await db
        .from('comments')
        .select('*')
        .eq('sheet_id', sheetId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        setComments(data.map((c: any) => ({
          id: c.id,
          sheetId: c.sheet_id,
          userId: c.user_id,
          userEmail: c.user_email,
          displayName: c.display_name,
          body: c.body,
          createdAt: c.created_at,
        })));
      }
      setLoading(false);
    };
    fetchComments();
  }, [sheetId]);

  // Realtime subscription
  useEffect(() => {
    const channel = db
      .channel('comments:' + sheetId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `sheet_id=eq.${sheetId}` },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const c = payload.new;
            const mapped: Comment = {
              id: c.id,
              sheetId: c.sheet_id,
              userId: c.user_id,
              userEmail: c.user_email,
              displayName: c.display_name,
              body: c.body,
              createdAt: c.created_at,
            };
            setComments(prev => {
              // Avoid dupes (optimistic entry already present)
              if (prev.some(x => x.id === mapped.id)) return prev;
              return [...prev, mapped];
            });
          } else if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [sheetId]);

  const handlePost = async () => {
    if (!body.trim() || !currentUserId || !currentUserEmail) return;
    setPosting(true);
    setPostError(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      sheetId,
      userId: currentUserId,
      userEmail: currentUserEmail,
      displayName: currentUserDisplayName ?? null,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments(prev => [...prev, optimistic]);
    const submittedBody = body.trim();
    setBody('');

    try {
      const { data, error } = await db
        .from('comments')
        .insert({
          sheet_id: sheetId,
          user_id: currentUserId,
          user_email: currentUserEmail,
          display_name: currentUserDisplayName ?? null,
          body: submittedBody,
        })
        .select()
        .single();

      if (error) throw error;
      const real: Comment = {
        id: data.id,
        sheetId: data.sheet_id,
        userId: data.user_id,
        userEmail: data.user_email,
        displayName: data.display_name,
        body: data.body,
        createdAt: data.created_at,
      };
      setComments(prev => prev.map(c => c.id === tempId ? real : c));
    } catch {
      setComments(prev => prev.filter(c => c.id !== tempId));
      setPostError('Failed to post comment. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setConfirmDeleteId(null);
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await db.from('comments').delete().eq('id', commentId);
    } catch {
      // silently ignore — realtime will reconcile
    }
  };

  const getInitials = (comment: Comment) => {
    const name = comment.displayName || comment.userEmail.split('@')[0];
    return name.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (comment: Comment) => {
    return comment.displayName || comment.userEmail.split('@')[0];
  };

  const isOwnComment = (comment: Comment) => currentUserId && comment.userId === currentUserId;
  const canDelete = (comment: Comment) => isOwnComment(comment) || isAdmin;

  return (
    <div className="mt-8 mb-4 no-print">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare size={20} className="text-green-500" />
        <h2 className={`text-lg font-serif font-bold ${textPrimary}`}>Comments</h2>
        {!loading && (
          <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs font-bold rounded-full border border-green-500/20">
            {comments.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className={`flex gap-3 p-4 rounded-2xl border animate-pulse ${cardBg}`}>
              <div className="w-9 h-9 rounded-full bg-slate-700/30 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-slate-700/30 rounded" />
                <div className="h-3 w-full bg-slate-700/20 rounded" />
                <div className="h-3 w-3/4 bg-slate-700/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className={`py-10 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Be the first to comment on this sheet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <div key={comment.id} className={`flex gap-3 p-4 rounded-2xl border transition-all ${cardBg} ${comment.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 text-xs font-bold shrink-0">
                {getInitials(comment)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span className={`text-sm font-bold ${textPrimary}`}>{getDisplayName(comment)}</span>
                  <span className={`text-xs ${textSecondary}`}>{timeAgo(comment.createdAt)}</span>
                </div>
                <p className={`text-sm leading-relaxed break-words ${textSecondary}`}>{comment.body}</p>
                {confirmDeleteId === comment.id ? (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${textSecondary}`}>Really delete?</span>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className={`px-2 py-0.5 text-xs rounded-lg font-bold transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      No
                    </button>
                  </div>
                ) : canDelete(comment) && !comment.id.startsWith('temp-') ? (
                  <button
                    onClick={() => setConfirmDeleteId(comment.id)}
                    className={`mt-1 flex items-center gap-1 text-xs transition-colors ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {currentUserId ? (
        <div className="mt-4">
          <div className={`rounded-2xl border p-4 ${cardBg}`}>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 500))}
              placeholder="Add a comment…"
              rows={3}
              className={`w-full bg-transparent resize-none text-sm focus:outline-none ${textPrimary} placeholder:text-slate-500`}
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${body.length > 450 ? 'text-amber-500' : textSecondary}`}>
                {body.length}/500
              </span>
              <button
                onClick={handlePost}
                disabled={!body.trim() || posting}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-sm font-bold rounded-xl transition-all active:scale-95"
              >
                {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Post
              </button>
            </div>
          </div>
          {postError && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} /> {postError}
            </p>
          )}
        </div>
      ) : (
        <div className={`mt-4 py-4 text-center rounded-2xl border ${cardBg}`}>
          <p className={`text-sm ${textSecondary}`}>
            Sign in to join the discussion
          </p>
        </div>
      )}
    </div>
  );
};

// ─── AddToCollectionDropdown ──────────────────────────────────────────────────
interface AddToCollectionDropdownProps {
  sheetId: string;
  currentUserId: string;
  darkMode: boolean;
  onClose: () => void;
  onNavigateCollections?: () => void;
}

const AddToCollectionDropdown: React.FC<AddToCollectionDropdownProps> = ({
  sheetId,
  currentUserId,
  darkMode,
  onClose,
  onNavigateCollections,
}) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const dropBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl';

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data: cols } = await db
        .from('collections')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false });

      const collectionList: Collection[] = (cols || []).map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        userEmail: c.user_email,
        name: c.name,
        description: c.description,
        isPublic: c.is_public,
        createdAt: c.created_at,
      }));
      setCollections(collectionList);

      if (collectionList.length > 0) {
        const ids = collectionList.map(c => c.id);
        const { data: members } = await db
          .from('collection_sheets')
          .select('collection_id')
          .eq('sheet_id', sheetId)
          .in('collection_id', ids);
        setMemberIds(new Set((members || []).map((m: any) => m.collection_id)));
      }
      setLoading(false);
    };
    fetch();
  }, [sheetId, currentUserId]);

  const toggle = async (collectionId: string) => {
    setToggling(collectionId);
    const isMember = memberIds.has(collectionId);
    if (isMember) {
      const newSet = new Set(memberIds);
      newSet.delete(collectionId);
      setMemberIds(newSet);
      await db.from('collection_sheets').delete()
        .eq('collection_id', collectionId)
        .eq('sheet_id', sheetId);
    } else {
      const newSet = new Set(memberIds);
      newSet.add(collectionId);
      setMemberIds(newSet);
      await db.from('collection_sheets').insert({ collection_id: collectionId, sheet_id: sheetId });
    }
    setToggling(null);
  };

  return (
    <div className={`absolute right-0 top-12 w-64 rounded-2xl border overflow-hidden z-[120] animate-in fade-in slide-in-from-top-2 duration-200 ${dropBg}`}>
      <div className={`px-4 py-3 border-b text-xs font-bold uppercase tracking-wider ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
        Add to Collection
      </div>
      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-green-500" />
        </div>
      ) : collections.length === 0 ? (
        <div className="p-4 text-center">
          <p className={`text-sm mb-3 ${textSecondary}`}>No collections yet.</p>
          <button
            onClick={() => { onClose(); onNavigateCollections?.(); }}
            className="text-xs text-green-500 font-bold hover:text-green-400 transition-colors"
          >
            Create your first collection
          </button>
        </div>
      ) : (
        <div className="py-1 max-h-52 overflow-y-auto">
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => toggle(col.id)}
              disabled={toggling === col.id}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${memberIds.has(col.id) ? 'bg-green-500 border-green-500' : darkMode ? 'border-slate-600' : 'border-slate-300'}`}>
                {memberIds.has(col.id) && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`truncate ${textPrimary}`}>{col.name}</span>
            </button>
          ))}
          <div className={`border-t mt-1 pt-1 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <button
              onClick={() => { onClose(); onNavigateCollections?.(); }}
              className="w-full px-4 py-2 text-xs text-green-500 font-bold hover:text-green-400 transition-colors text-left"
            >
              + Create new collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── RelatedSheets ────────────────────────────────────────────────────────────
interface RelatedSheetsProps {
  sheet: MusicSheet;
  sheets: MusicSheet[];
  darkMode: boolean;
  onPreview: (sheet: MusicSheet) => void;
}

const RelatedSheets: React.FC<RelatedSheetsProps> = ({ sheet, sheets, darkMode, onPreview }) => {
  const byComposer = sheets
    .filter(s => s.composer === sheet.composer && s.id !== sheet.id)
    .slice(0, 4);
  const byType = sheets
    .filter(s => s.type === sheet.type && s.id !== sheet.id && s.composer !== sheet.composer)
    .slice(0, 4);

  if (byComposer.length === 0 && byType.length === 0) return null;

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800 hover:border-green-500/50' : 'bg-white border-slate-200 hover:border-green-500/50 shadow-sm';

  const SheetCard = ({ s }: { s: MusicSheet }) => (
    <button
      onClick={() => onPreview(s)}
      className={`flex-1 min-w-[130px] max-w-[180px] border rounded-xl overflow-hidden text-left transition-all active:scale-95 group ${cardBg}`}
    >
      <div className="aspect-[3/4] overflow-hidden">
        <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </div>
      <div className="p-2">
        <p className={`text-xs font-bold truncate ${textPrimary}`}>{s.title}</p>
        <p className={`text-[10px] truncate ${textSecondary}`}>{s.composer}</p>
      </div>
    </button>
  );

  return (
    <div className="mt-6 mb-6 no-print space-y-6">
      {byComposer.length > 0 && (
        <div>
          <h2 className={`text-lg font-serif font-bold mb-3 ${textPrimary}`}>More by {sheet.composer}</h2>
          <div className="flex gap-3 flex-wrap">
            {byComposer.map(s => <SheetCard key={s.id} s={s} />)}
          </div>
        </div>
      )}
      {byType.length > 0 && (
        <div>
          <h2 className={`text-lg font-serif font-bold mb-3 ${textPrimary}`}>More {sheet.type}</h2>
          <div className="flex gap-3 flex-wrap">
            {byType.map(s => <SheetCard key={s.id} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main FullPreviewPage ─────────────────────────────────────────────────────
const FullPreviewPage: React.FC<FullPreviewPageProps> = ({
  sheet,
  darkMode,
  onThemeToggle,
  onClose,
  isLoggedIn,
  onAuthRequired,
  currentUserId,
  currentUserEmail,
  currentUserDisplayName,
  userFavorites = [],
  onFavoritesChange,
  onViewProfile,
  sheets = [],
  onPreview,
  onNavigateCollections,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoadKey, setPdfLoadKey] = useState(0);
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState(sheet?.pdfUrl ?? '');
  const [copiedToast, setCopiedToast] = useState(false);
  const [localViews, setLocalViews] = useState(sheet?.views ?? 0);
  const [localDownloads, setLocalDownloads] = useState(sheet?.downloads ?? 0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const collectionDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalViews(sheet?.views ?? 0);
    setLocalDownloads(sheet?.downloads ?? 0);
  }, [sheet?.id]);

  useEffect(() => {
    if (sheet?.id) setIsFavorited(userFavorites.includes(sheet.id));
  }, [sheet?.id, userFavorites]);

  // Close collection dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (collectionDropRef.current && !collectionDropRef.current.contains(e.target as Node)) {
        setShowCollectionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!sheet) return;

    setPdfDoc(null);
    setNumPages(0);
    setIsInitialLoading(true);
    setPdfError(null);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const loadPdf = async () => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setPdfError('Failed to load PDF. Please try again.');
          setIsInitialLoading(false);
        }
      }, 15000);

      try {
        // Resolve signed URL for private sheets
        const pdfUrl = await getPdfUrl(sheet);
        if (cancelled) return;
        setResolvedPdfUrl(pdfUrl);

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF.js not loaded');

        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          rangeChunkSize: 65536,
          disableAutoFetch: false,
          disableStream: false,
        });

        const pdf = await loadingTask.promise;
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        if (cancelled) return;
        if (timeoutId) clearTimeout(timeoutId);
        console.error('PDF load error:', error);
        setPdfError('Failed to load PDF. Please try again.');
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    };

    loadPdf();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sheet?.id, sheet?.pdfUrl, pdfLoadKey]);

  const trackInteraction = useCallback(async (type: 'views' | 'downloads') => {
    if (!sheet) return;

    // Views: deduplicated per browser (one view per sheet per browser lifetime).
    // Downloads: no dedup — every click counts as a new download event.
    const storageKey = `solfa_${type}_${sheet.id}`;
    if (type === 'views' && localStorage.getItem(storageKey)) return;

    if (type === 'views') setLocalViews(v => v + 1);
    else setLocalDownloads(d => d + 1);

    if (type === 'views') localStorage.setItem(storageKey, '1');

    try {
      const { data: { session } } = await db.auth.getSession();
      const user = session?.user ?? null;

      // Admin and uploader views/downloads don't count
      if (user?.email === 'solfasanctuary@gmail.com' || user?.email === sheet.uploadedBy) {
        if (type === 'views') { setLocalViews(v => v - 1); localStorage.removeItem(storageKey); }
        else setLocalDownloads(d => d - 1);
        return;
      }

      if (user) {
        // For views: composite key prevents DB duplicates for logged-in users.
        // For downloads: always insert a new row (total events).
        const interactionId = type === 'views'
          ? `${user.id}_${sheet.id}_views`
          : `${user.id}_${sheet.id}_download_${Date.now()}`;

        const { error: insertError } = await db.from('interactions').insert({
          id: interactionId,
          user_id: user.id,
          sheet_id: sheet.id,
          type,
        });

        if (insertError && type === 'views') {
          // View already recorded in DB — roll back optimistic increment
          setLocalViews(v => v - 1);
          return;
        }
        if (insertError && type === 'downloads') {
          // DB write failed — still fire the counter RPC (best-effort)
        }
      }

      await db.rpc('increment_sheet_counter', {
        p_sheet_id: sheet.id,
        p_field: type,
      });
    } catch {
      // silently ignore network errors
    }
  }, [sheet]);

  useEffect(() => {
    if (sheet) {
      const timer = setTimeout(() => trackInteraction('views'), 1500);
      return () => clearTimeout(timer);
    }
  }, [sheet?.id]);

  const toggleFavorite = async () => {
    if (!isLoggedIn) { onAuthRequired(); return; }
    if (!sheet || !currentUserId || favLoading) return;
    setFavLoading(true);
    const wasF = isFavorited;
    setIsFavorited(!wasF);
    const newFavs = wasF
      ? userFavorites.filter(id => id !== sheet.id)
      : [...userFavorites, sheet.id];
    onFavoritesChange?.(newFavs);
    try {
      if (wasF) {
        await db.from('favorites').delete().eq('user_id', currentUserId).eq('sheet_id', sheet.id);
      } else {
        await db.from('favorites').insert({ user_id: currentUserId, sheet_id: sheet.id });
      }
    } catch {
      setIsFavorited(wasF);
      onFavoritesChange?.(userFavorites);
    } finally {
      setFavLoading(false);
    }
  };

  const handleProtectedAction = (action: () => void) => {
    isLoggedIn ? action() : onAuthRequired();
  };

  const handleOpenNewTab = () => handleProtectedAction(() => {
    window.open(`${window.location.origin}${window.location.pathname}?sheet=${sheet?.id}`, '_blank');
  });

  const handleDownload = () => handleProtectedAction(() => {
    trackInteraction('downloads');
    // Append ?download=true so Supabase Storage sets Content-Disposition: attachment,
    // forcing a real OS Save dialog even for cross-origin URLs.
    const base = resolvedPdfUrl || sheet?.pdfUrl || '';
    const url = base ? (base.includes('?') ? `${base}&download=true` : `${base}?download=true`) : '';
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet?.title ?? 'sheet'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    }).catch(() => {});
  };

  const handleAddToCollection = () => {
    if (!isLoggedIn) { onAuthRequired(); return; }
    setShowCollectionDropdown(prev => !prev);
  };

  if (!sheet) return null;

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const headerBg = darkMode
    ? 'bg-slate-900/95 border-slate-800'
    : 'bg-white/95 border-slate-200 shadow-sm';

  return (
    <div className={`fixed inset-0 flex flex-col h-screen overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* "Link copied!" toast */}
      {copiedToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-2.5 bg-green-500 text-slate-950 font-bold rounded-xl shadow-xl shadow-green-500/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          Link copied!
        </div>
      )}

      <header className={`shrink-0 z-[100] border-b backdrop-blur-xl transition-all ${headerBg} no-print`}>
        {/* ── Single-row bar (all breakpoints) ── */}
        <div className="max-w-[1920px] mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center gap-2 md:gap-3">

          {/* Close */}
          <button onClick={onClose} aria-label="Back to Sanctuary"
            className={`p-2 rounded-lg transition-colors shrink-0 ${darkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'}`}
            title="Back to Sanctuary"><X size={20} /></button>

          {/* Title + Composer — truncates, takes remaining space */}
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className={`text-sm sm:text-base md:text-lg font-serif font-bold leading-tight truncate ${textPrimary}`}>{sheet.title}</h1>
            <p className="text-green-500 font-medium text-[11px] truncate">{sheet.composer}</p>
          </div>

          {/* Views + Downloads — always visible, compact */}
          <div className={`flex items-center gap-3 shrink-0 border-l pl-3 md:pl-4 ${darkMode ? 'border-slate-700/50' : 'border-slate-300/60'}`}>
            <div className="flex items-center gap-1"><Eye size={14} className="text-blue-400" /><span className={`text-xs font-bold tabular-nums ${textPrimary}`}>{localViews}</span></div>
            <div className="flex items-center gap-1"><Download size={14} className="text-green-500" /><span className={`text-xs font-bold tabular-nums ${textPrimary}`}>{localDownloads}</span></div>
          </div>

          {/* Metadata chips — hidden below md, inline above */}
          <div className={`hidden md:flex items-center gap-3 lg:gap-5 shrink-0 border-l pl-4 lg:pl-6 ${darkMode ? 'border-slate-700/50' : 'border-slate-300/60'}`}>
            <div className="flex items-center gap-1.5"><MusicIcon size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.type}</span></div>
            <div className="flex items-center gap-1.5"><FileText size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.fileSize}</span></div>
            <div className="hidden xl:flex items-center gap-1.5"><Calendar size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.uploadedAt}</span></div>
            <div className="hidden xl:flex items-center gap-1.5"><User size={13} className="text-slate-500 shrink-0" />
              {onViewProfile
                ? <button onClick={() => onViewProfile(sheet.uploadedBy)} className={`text-[11px] font-semibold whitespace-nowrap hover:text-green-500 transition-colors ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</button>
                : <span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</span>}
            </div>
          </div>

          {/* Action buttons — hidden below md */}
          <div className={`hidden md:flex items-center gap-1.5 lg:gap-2 shrink-0 border-l pl-3 md:pl-4 ${darkMode ? 'border-slate-700/50' : 'border-slate-300/60'}`}>
            <button onClick={handleOpenNewTab} aria-label="Open in new tab"
              className={`p-2 rounded-xl border transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`}
              title="Open in new tab"><ExternalLink size={17} /></button>
            <button onClick={handleShare} aria-label="Share sheet"
              className={`p-2 rounded-xl border transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`}
              title="Share"><Share2 size={17} /></button>
            <button onClick={toggleFavorite}
              aria-label={isFavorited ? 'Remove from favourites' : 'Add to favourites'}
              disabled={favLoading}
              className={`p-2 rounded-xl border transition-colors ${isFavorited ? 'border-rose-500/50 text-rose-500 bg-rose-500/10' : darkMode ? 'border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-rose-500 hover:bg-slate-50 shadow-sm'}`}
              title={isFavorited ? 'Remove favourite' : 'Add to favourites'}>
              <Heart size={17} className={isFavorited ? 'fill-current' : ''} />
            </button>
            <div className="relative shrink-0" ref={collectionDropRef}>
              <button onClick={handleAddToCollection} aria-label="Add to collection"
                className={`p-2 rounded-xl border transition-colors ${showCollectionDropdown ? (darkMode ? 'border-green-500/50 text-green-500 bg-green-500/10' : 'border-green-500/50 text-green-600 bg-green-500/10') : darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm'}`}
                title="Add to collection"><FolderPlus size={17} /></button>
              {showCollectionDropdown && currentUserId && (
                <AddToCollectionDropdown
                  sheetId={sheet.id}
                  currentUserId={currentUserId}
                  darkMode={darkMode}
                  onClose={() => setShowCollectionDropdown(false)}
                  onNavigateCollections={onNavigateCollections}
                />
              )}
            </div>
          </div>

          {/* Mobile menu toggle (below md) */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden p-2 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
            {isMobileMenuOpen ? <ChevronUp size={22} /> : <Menu size={22} />}
          </button>

          {/* Download — always visible */}
          <button onClick={handleDownload} aria-label="Download PDF"
            className="shrink-0 px-3 md:px-5 py-2 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-green-500/10 flex items-center gap-1.5 active:scale-95 text-xs md:text-sm whitespace-nowrap">
            <Download size={16} /><span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span>
          </button>
        </div>

        {/* ── Mobile drawer (below md) — metadata + actions ── */}
        {isMobileMenuOpen && (
          <div className={`md:hidden border-t px-3 py-3 animate-in slide-in-from-top-1 duration-200 ${darkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}>
            {/* Metadata row */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
              <div className="flex items-center gap-1.5"><MusicIcon size={13} className="text-slate-500" /><span className={`text-xs font-semibold ${textPrimary}`}>{sheet.type}</span></div>
              <div className="flex items-center gap-1.5"><FileText size={13} className="text-slate-500" /><span className={`text-xs font-semibold ${textPrimary}`}>{sheet.fileSize}</span></div>
              <div className="flex items-center gap-1.5"><Calendar size={13} className="text-slate-500" /><span className={`text-xs font-semibold ${textPrimary}`}>{sheet.uploadedAt}</span></div>
              <div className="flex items-center gap-1.5"><User size={13} className="text-slate-500" />
                {onViewProfile
                  ? <button onClick={() => { onViewProfile(sheet.uploadedBy); setIsMobileMenuOpen(false); }} className={`text-xs font-semibold hover:text-green-500 transition-colors ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</button>
                  : <span className={`text-xs font-semibold ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</span>}
              </div>
            </div>
            {/* Action buttons row */}
            <div className="flex items-center gap-2">
              <button onClick={handleOpenNewTab}
                className={`p-2.5 rounded-xl border flex-1 flex justify-center transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`}>
                <ExternalLink size={18} /></button>
              <button onClick={handleShare}
                className={`p-2.5 rounded-xl border flex-1 flex justify-center transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`}>
                <Share2 size={18} /></button>
              <button onClick={toggleFavorite} disabled={favLoading}
                className={`p-2.5 rounded-xl border flex-1 flex justify-center transition-colors ${isFavorited ? 'border-rose-500/50 text-rose-500 bg-rose-500/10' : darkMode ? 'border-slate-800 text-slate-400 hover:text-rose-400' : 'border-slate-200 text-slate-500 hover:text-rose-500'}`}>
                <Heart size={18} className={isFavorited ? 'fill-current' : ''} /></button>
              <div className="relative flex-1" ref={collectionDropRef}>
                <button onClick={handleAddToCollection}
                  className={`w-full p-2.5 rounded-xl border flex justify-center transition-colors ${showCollectionDropdown ? (darkMode ? 'border-green-500/50 text-green-500 bg-green-500/10' : 'border-green-500/50 text-green-600 bg-green-500/10') : darkMode ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`}>
                  <FolderPlus size={18} /></button>
                {showCollectionDropdown && currentUserId && (
                  <AddToCollectionDropdown
                    sheetId={sheet.id}
                    currentUserId={currentUserId}
                    darkMode={darkMode}
                    onClose={() => setShowCollectionDropdown(false)}
                    onNavigateCollections={onNavigateCollections}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto w-full px-4 md:px-8 flex flex-col items-center pt-2 md:pt-4 [will-change:transform]">
        <div className="hidden print-header"><p className="font-bold text-xl">{sheet.title}</p><p className="text-slate-500 text-sm">Sanctuary: {window.location.hostname}</p></div>
        <div className="w-full max-w-[800px] animate-in fade-in zoom-in-95 duration-700">
          <div className={`w-full min-h-[400px] rounded-2xl border-2 md:border-4 overflow-hidden shadow-2xl transition-colors relative score-page-container ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-white bg-white'}`}>
            {isInitialLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 no-print">
                <Loader2 className="animate-spin text-green-500" size={48} />
                <p className={`text-sm font-medium animate-pulse ${textSecondary}`}>Opening the score…</p>
              </div>
            ) : pdfError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 no-print">
                <AlertCircle className="text-red-500" size={48} />
                <p className={`text-sm font-medium ${textSecondary}`}>{pdfError}</p>
                <button
                  onClick={() => { setPdfError(null); setIsInitialLoading(true); setPdfLoadKey(k => k + 1); }}
                  className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all active:scale-95"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 p-2 md:p-4 bg-slate-200/5">
                {numPages > 0 ? (
                  Array.from({ length: numPages }).map((_, i) => (
                    <LazyPdfPage
                      key={i}
                      index={i + 1}
                      pdfDoc={pdfDoc}
                      forceRender={isPrinting}
                      darkMode={darkMode}
                      sheetTitle={sheet.title}
                      isFirstPage={i === 0}
                    />
                  ))
                ) : (
                  <div className="py-20 text-center no-print">
                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
                    <p className={textSecondary}>Harmony disrupted. Unable to display score.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Related Sheets */}
          {sheets.length > 0 && onPreview && (
            <RelatedSheets sheet={sheet} sheets={sheets} darkMode={darkMode} onPreview={onPreview} />
          )}

          {/* Comments */}
          <CommentsSection
            sheetId={sheet.id}
            currentUserId={currentUserId}
            currentUserEmail={currentUserEmail}
            currentUserDisplayName={currentUserDisplayName}
            isAdmin={false}
            darkMode={darkMode}
          />

          <div className="mt-8 md:mt-12 mb-12 text-center max-w-2xl mx-auto space-y-4 no-print">
            <div className="w-12 h-1 bg-green-500 mx-auto rounded-full"></div>
            <p className={`text-base md:text-lg italic font-serif ${textSecondary}`}>"This sheet music is provided for educational and devotional purposes. May your performance bring joy and sanctuary to all who listen."</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FullPreviewPage;
