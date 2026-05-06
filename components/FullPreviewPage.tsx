import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Share2, Eye, Calendar, User, FileText, Music as MusicIcon, X, ExternalLink, Menu, ChevronUp, Loader2, AlertTriangle, AlertCircle, Heart, FolderPlus, Trash2, MessageSquare, Send, CornerDownRight, ChevronDown, ChevronRight, Lock, Zap, ChevronLeft, AlignJustify, Layers } from 'lucide-react';
import { MusicSheet, Comment, Collection } from '../types';
import { db } from '../supabase';
import { getPdfUrl } from '../utils/signedUrl';
import OfflineSaveButton from './OfflineSaveButton';
import { useEntitlementsContext } from '../contexts/EntitlementsContext';

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
  /** Offline viewing props */
  isAvailableOffline?: boolean;
  isSavingOffline?: boolean;
  offlineSaveProgress?: number;
  onSaveOffline?: () => void;
  onRemoveOffline?: () => void;
  /** Navigate to pricing page (for feature gates) */
  onOpenPricing?: () => void;
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
  eager?: boolean;
}

const LazyPdfPage: React.FC<LazyPdfPageProps> = ({
  index,
  pdfDoc,
  forceRender,
  darkMode,
  sheetTitle,
  isFirstPage,
  eager,
}) => {
  const [isIntersecting, setIsIntersecting] = useState(isFirstPage || !!eager);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasQueued = useRef(false);

  useEffect(() => {
    if (isFirstPage || forceRender || eager) return;
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
  }, [isFirstPage, forceRender, eager]);

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
    <div ref={containerRef} className="score-page w-full relative">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`${sheetTitle} - Page ${index}`}
          className="w-full h-auto rounded shadow-lg border border-slate-700/10 transition-opacity duration-500 ease-in opacity-100"
        />
      ) : (
        <div className={`min-h-[80px] flex flex-col items-center justify-center gap-3 no-print ${textSecondary}`}>
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
  onCountChange?: (n: number) => void;
}

// Map a raw DB comment row → Comment
const mapComment = (c: any, likedIds: Set<string>): Comment => ({
  id: c.id,
  sheetId: c.sheet_id,
  userId: c.user_id,
  userEmail: c.user_email,
  displayName: c.display_name,
  body: c.body,
  createdAt: c.created_at,
  parentId: c.parent_id ?? null,
  likesCount: c.likes_count ?? 0,
  likedByMe: likedIds.has(c.id),
});

// ── Single comment + replies sub-component ──
interface CommentCardProps {
  comment: Comment;
  isReply?: boolean;
  darkMode: boolean;
  currentUserId?: string;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  isAdmin?: boolean;
  onLike: (id: string) => void;
  onReply: (parentId: string, body: string) => Promise<void>;
  onDelete: (id: string) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  liking: string | null;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment, isReply, darkMode, currentUserId, currentUserDisplayName,
  isAdmin, onLike, onReply, onDelete, confirmDeleteId, setConfirmDeleteId, liking,
}) => {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const replyBg = darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200';

  const name = comment.displayName || comment.userEmail.split('@')[0];
  const initials = name.slice(0, 2).toUpperCase();
  const isOwn = currentUserId && comment.userId === currentUserId;
  const canDel = isOwn || isAdmin;
  const replies = comment.replies ?? [];

  const submitReply = async () => {
    if (!replyBody.trim() || posting) return;
    setPosting(true);
    await onReply(comment.id, replyBody.trim());
    setReplyBody('');
    setShowReplyBox(false);
    setShowReplies(true);
    setPosting(false);
  };

  return (
    <div className={`flex gap-3 p-4 rounded-2xl border transition-all ${isReply ? replyBg : cardBg} ${comment.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
      {/* Avatar */}
      <div className={`shrink-0 flex items-center justify-center text-xs font-bold rounded-full border ${isReply ? 'w-7 h-7 text-[10px]' : 'w-9 h-9'} bg-green-500/10 border-green-500/20 text-green-500`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + time */}
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className={`text-sm font-bold ${textPrimary}`}>{name}</span>
          <span className={`text-xs ${textSecondary}`}>{timeAgo(comment.createdAt)}</span>
        </div>

        {/* Body */}
        <p className={`text-sm leading-relaxed break-words ${textSecondary}`}>{comment.body}</p>

        {/* Action row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {/* Like */}
          <button
            onClick={() => onLike(comment.id)}
            disabled={!currentUserId || !!liking}
            title={currentUserId ? (comment.likedByMe ? 'Unlike' : 'Like') : 'Sign in to like'}
            className={`flex items-center gap-1 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 ${comment.likedByMe ? 'text-rose-500' : darkMode ? 'text-slate-500 hover:text-rose-400' : 'text-slate-400 hover:text-rose-500'}`}
          >
            <Heart size={13} className={comment.likedByMe ? 'fill-current' : ''} />
            {comment.likesCount > 0 && <span>{comment.likesCount}</span>}
          </button>

          {/* Reply — only on top-level */}
          {!isReply && currentUserId && (
            <button
              onClick={() => { setShowReplyBox(v => !v); setTimeout(() => replyRef.current?.focus(), 50); }}
              className={`flex items-center gap-1 text-xs font-semibold transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <CornerDownRight size={13} />
              Reply
            </button>
          )}

          {/* Delete */}
          {canDel && !comment.id.startsWith('temp-') && (
            confirmDeleteId === comment.id ? (
              <span className="flex items-center gap-1.5 text-xs">
                <span className={textSecondary}>Delete?</span>
                <button onClick={() => onDelete(comment.id)} className="px-1.5 py-0.5 text-[11px] bg-red-500 text-white rounded font-bold hover:bg-red-600 transition-colors">Yes</button>
                <button onClick={() => setConfirmDeleteId(null)} className={`px-1.5 py-0.5 text-[11px] rounded font-bold transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteId(comment.id)} className={`flex items-center gap-1 text-xs transition-colors ${darkMode ? 'text-slate-600 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}>
                <Trash2 size={12} /> Delete
              </button>
            )
          )}
        </div>

        {/* Reply input box */}
        {showReplyBox && (
          <div className={`mt-3 rounded-xl border p-3 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
            <textarea
              ref={replyRef}
              value={replyBody}
              onChange={e => setReplyBody(e.target.value.slice(0, 500))}
              placeholder={`Reply to ${name}…`}
              rows={2}
              className={`w-full bg-transparent resize-none text-sm focus:outline-none ${textPrimary} placeholder:text-slate-500`}
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${replyBody.length > 450 ? 'text-amber-500' : textSecondary}`}>{replyBody.length}/500</span>
              <div className="flex gap-2">
                <button onClick={() => { setShowReplyBox(false); setReplyBody(''); }} className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Cancel</button>
                <button
                  onClick={submitReply}
                  disabled={!replyBody.trim() || posting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition-all active:scale-95"
                >
                  {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowReplies(v => !v)}
              className={`flex items-center gap-1 text-xs font-semibold mb-2 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {showReplies ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </button>
            {showReplies && (
              <div className="space-y-2 pl-1 border-l-2 border-green-500/20 ml-1">
                {replies.map(reply => (
                  <CommentCard
                    key={reply.id}
                    comment={reply}
                    isReply
                    darkMode={darkMode}
                    currentUserId={currentUserId}
                    currentUserDisplayName={currentUserDisplayName}
                    isAdmin={isAdmin}
                    onLike={onLike}
                    onReply={onReply}
                    onDelete={onDelete}
                    confirmDeleteId={confirmDeleteId}
                    setConfirmDeleteId={setConfirmDeleteId}
                    liking={liking}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const CommentsSection: React.FC<CommentsSectionProps> = ({
  sheetId,
  currentUserId,
  currentUserEmail,
  currentUserDisplayName,
  isAdmin,
  darkMode,
  onCountChange,
}) => {
  const [flat, setFlat] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [liking, setLiking] = useState<string | null>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';

  // Build tree from flat list
  const tree = React.useMemo<Comment[]>(() => {
    const topLevel = flat.filter(c => !c.parentId);
    return topLevel.map(c => ({
      ...c,
      replies: flat.filter(r => r.parentId === c.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
  }, [flat]);

  // Total count for badge (top-level + replies)
  const totalCount = flat.filter(c => !c.id.startsWith('temp-')).length;
  useEffect(() => { onCountChange?.(totalCount); }, [totalCount, onCountChange]);

  // Fetch all comments + my likes
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [commentsRes, likesRes] = await Promise.all([
        db.from('comments').select('*').eq('sheet_id', sheetId).order('created_at', { ascending: true }),
        currentUserId
          ? db.from('comment_likes').select('comment_id').eq('user_id', currentUserId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const likedIds = new Set<string>((likesRes.data || []).map((l: any) => l.comment_id));
      if (!commentsRes.error && commentsRes.data) {
        setFlat(commentsRes.data.map((c: any) => mapComment(c, likedIds)));
      }
      setLoading(false);
    };
    fetchAll();
  }, [sheetId, currentUserId]);

  // Realtime — comments table
  useEffect(() => {
    const ch = db
      .channel(`comments:sheet:${sheetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `sheet_id=eq.${sheetId}` }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const c = payload.new;
          const mapped: Comment = mapComment(c, new Set<string>());
          setFlat(prev => {
            if (prev.some(x => x.id === mapped.id)) return prev;
            return [...prev, mapped];
          });
        } else if (payload.eventType === 'DELETE') {
          setFlat(prev => prev.filter(c => c.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          const c = payload.new;
          setFlat(prev => prev.map(x => x.id === c.id ? { ...x, likesCount: c.likes_count ?? x.likesCount } : x));
        }
      })
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [sheetId]);

  // Post top-level comment
  const handlePost = async () => {
    if (!body.trim() || !currentUserId || !currentUserEmail) return;
    setPosting(true);
    setPostError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId, sheetId, userId: currentUserId, userEmail: currentUserEmail,
      displayName: currentUserDisplayName ?? null, body: body.trim(),
      createdAt: new Date().toISOString(), parentId: null, likesCount: 0, likedByMe: false,
    };
    setFlat(prev => [...prev, optimistic]);
    const saved = body.trim();
    setBody('');
    try {
      const { data, error } = await db
        .from('comments')
        .insert({ sheet_id: sheetId, user_id: currentUserId, user_email: currentUserEmail, display_name: currentUserDisplayName ?? null, body: saved })
        .select().single();
      if (error) throw error;
      setFlat(prev => prev.map(c => c.id === tempId ? mapComment(data, new Set<string>()) : c));
      // Increment denormalized count
      await db.rpc('increment_sheet_counter', { p_sheet_id: sheetId, p_field: 'comments' });
    } catch {
      setFlat(prev => prev.filter(c => c.id !== tempId));
      setPostError('Failed to post comment. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  // Post reply
  const handleReply = async (parentId: string, replyBody: string) => {
    if (!currentUserId || !currentUserEmail) return;
    const tempId = `temp-reply-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId, sheetId, userId: currentUserId, userEmail: currentUserEmail,
      displayName: currentUserDisplayName ?? null, body: replyBody,
      createdAt: new Date().toISOString(), parentId, likesCount: 0, likedByMe: false,
    };
    setFlat(prev => [...prev, optimistic]);
    try {
      const { data, error } = await db
        .from('comments')
        .insert({ sheet_id: sheetId, user_id: currentUserId, user_email: currentUserEmail, display_name: currentUserDisplayName ?? null, body: replyBody, parent_id: parentId })
        .select().single();
      if (error) throw error;
      setFlat(prev => prev.map(c => c.id === tempId ? mapComment(data, new Set<string>()) : c));
      await db.rpc('increment_sheet_counter', { p_sheet_id: sheetId, p_field: 'comments' });
    } catch {
      setFlat(prev => prev.filter(c => c.id !== tempId));
    }
  };

  // Toggle like
  const handleLike = async (commentId: string) => {
    if (!currentUserId) return;
    setLiking(commentId);
    const prev = flat.find(c => c.id === commentId);
    if (!prev) { setLiking(null); return; }
    // Optimistic
    setFlat(fs => fs.map(c => c.id === commentId
      ? { ...c, likedByMe: !c.likedByMe, likesCount: c.likedByMe ? Math.max(0, c.likesCount - 1) : c.likesCount + 1 }
      : c));
    try {
      await db.rpc('toggle_comment_like', { p_comment_id: commentId, p_user_id: currentUserId });
    } catch {
      // Rollback
      setFlat(fs => fs.map(c => c.id === commentId ? prev : c));
    } finally {
      setLiking(null);
    }
  };

  // Delete comment (cascades replies via DB)
  const handleDelete = async (commentId: string) => {
    setConfirmDeleteId(null);
    const removed = flat.filter(c => c.id === commentId || c.parentId === commentId);
    setFlat(prev => prev.filter(c => c.id !== commentId && c.parentId !== commentId));
    try {
      await db.from('comments').delete().eq('id', commentId);
      // Decrement count for deleted comment + its replies
      for (let i = 0; i < removed.length; i++) {
        await db.rpc('increment_sheet_counter', { p_sheet_id: sheetId, p_field: 'comments_dec' });
      }
    } catch {
      // silently ignore — realtime will reconcile
    }
  };

  return (
    <div className="mt-8 mb-4 no-print" id="comments-section">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare size={20} className="text-green-500" />
        <h2 className={`text-lg font-serif font-bold ${textPrimary}`}>Comments</h2>
        {!loading && (
          <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs font-bold rounded-full border border-green-500/20">
            {totalCount}
          </span>
        )}
      </div>

      {/* Loading skeletons */}
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
      ) : tree.length === 0 ? (
        <div className={`py-10 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Be the first to comment on this sheet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              darkMode={darkMode}
              currentUserId={currentUserId}
              currentUserDisplayName={currentUserDisplayName}
              isAdmin={isAdmin}
              onLike={handleLike}
              onReply={handleReply}
              onDelete={handleDelete}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
              liking={liking}
            />
          ))}
        </div>
      )}

      {/* New top-level comment box */}
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
          <p className={`text-sm ${textSecondary}`}>Sign in to join the discussion</p>
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

// Clipboard fallback for non-secure (HTTP) contexts
function fallbackCopy(text: string, onDone?: () => void) {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    onDone?.();
  } catch {
    // Last resort: open prompt so user can copy manually
    window.prompt('Copy this link:', text);
  }
}

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
  isAvailableOffline = false,
  isSavingOffline = false,
  offlineSaveProgress = 0,
  onSaveOffline,
  onRemoveOffline,
  onOpenPricing,
}) => {
  const ent = useEntitlementsContext();
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
  const [localLikesCount, setLocalLikesCount] = useState(sheet?.likesCount ?? 0);
  const [isFavorited, setIsFavorited] = useState(false);
  // Download gate — monthly download count for free users
  const [monthlyDownloads, setMonthlyDownloads] = useState<number | null>(null);
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [localCommentsCount, setLocalCommentsCount] = useState(sheet?.commentsCount ?? 0);
  const collectionDropRef = useRef<HTMLDivElement>(null);
  const commentsSectionRef = useRef<HTMLDivElement>(null);

  // View mode: 'flow' (default desktop) | 'single' (default mobile)
  const [viewMode, setViewMode] = useState<'flow' | 'single'>(() => {
    try { return (localStorage.getItem('sheetViewMode') as 'flow' | 'single') ?? (window.innerWidth < 768 ? 'single' : 'flow'); }
    catch { return 'flow'; }
  });
  const [currentPage, setCurrentPage] = useState(1);
  const touchStartX = useRef<number>(0);

  const scrollToComments = () => {
    commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    setLocalViews(sheet?.views ?? 0);
    setLocalDownloads(sheet?.downloads ?? 0);
    setLocalLikesCount(sheet?.likesCount ?? 0);
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

  // Persist view mode
  useEffect(() => {
    try { localStorage.setItem('sheetViewMode', viewMode); } catch {}
  }, [viewMode]);

  // Reset to page 1 when sheet changes
  useEffect(() => { setCurrentPage(1); }, [sheet?.id]);

  // Keyboard navigation in single mode
  useEffect(() => {
    if (viewMode !== 'single') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(p + 1, numPages || 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(p - 1, 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, numPages]);

  // Blob URL created from the fetched PDF — revoked on sheet change / unmount.
  const blobUrlRef = useRef<string | null>(null);
  // Download progress (0–100) while fetching the PDF blob.
  const [fetchProgress, setFetchProgress] = useState(0);

  useEffect(() => {
    if (!sheet) return;

    setPdfDoc(null);
    setNumPages(0);
    setIsInitialLoading(true);
    setPdfError(null);
    setFetchProgress(0);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    let cancelled = false;
    let activeLoadingTask: any = null;

    // Backoff delays in ms — 3 attempts total (initial + 2 retries).
    const BACKOFF = [500, 1500, 4000];
    const PER_ATTEMPT_TIMEOUT_MS = 30000;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const isRetryableError = (err: any): boolean => {
      if (!err) return false;
      if (err?.name === 'AbortError') return false;
      const name = err?.name ?? '';
      // Permanent PDF.js errors — don't retry.
      if (name === 'MissingPDFException' || name === 'InvalidPDFException' || name === 'PasswordException') return false;
      const msg = String(err?.message ?? err);
      if (/HTTP 4\d\d/.test(msg)) return false;        // 4xx permanent
      if (/HTTP 5\d\d/.test(msg)) return true;         // 5xx transient
      if (/network|fetch|timeout|connection|aborted|destroyed/i.test(msg)) return true;
      if (name === 'UnexpectedResponseException') return true;
      return true; // default: retry
    };

    const isRangeRelatedError = (err: any): boolean => {
      const msg = String(err?.message ?? err ?? '');
      return err?.name === 'UnexpectedResponseException' || /range|partial content|206/i.test(msg);
    };

    const setupWorker = (pdfjsLib: any) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
    };

    // Phase 2 — native Range loading. PDF.js fetches xref/trailer first, renders page 1
    // ASAP, then streams more ranges as pages are requested by LazyPdfPage.
    const loadViaRange = async (pdfUrl: string): Promise<any> => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF.js not loaded');
      setupWorker(pdfjsLib);

      const loadingTask = pdfjsLib.getDocument({
        url:             pdfUrl,
        rangeChunkSize:  65536,
        disableRange:    false,
        disableStream:   false,
        withCredentials: false,
      });
      activeLoadingTask = loadingTask;

      loadingTask.onProgress = (p: { loaded: number; total: number }) => {
        if (cancelled) return;
        if (p.total > 0) {
          setFetchProgress(Math.min(99, Math.round((p.loaded / p.total) * 95)));
        }
      };

      const timeoutId = setTimeout(() => { try { loadingTask.destroy(); } catch {} }, PER_ATTEMPT_TIMEOUT_MS);
      try {
        return await loadingTask.promise;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Phase 3 — full-blob fallback (offline mode, or when Range is blocked).
    // The service worker intercepts this fetch and serves from the offline cache.
    const loadViaBlob = async (pdfUrl: string): Promise<any> => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF.js not loaded');
      setupWorker(pdfjsLib);

      const response = await fetch(pdfUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching PDF`);
      if (cancelled) throw new Error('cancelled');

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      let blob: Blob;

      if (contentLength > 0 && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) { reader.cancel(); throw new Error('cancelled'); }
          chunks.push(value);
          received += value.length;
          setFetchProgress(Math.min(99, Math.round((received / contentLength) * 90)));
        }
        blob = new Blob(chunks, { type: 'application/pdf' });
      } else {
        blob = await response.blob();
      }

      if (cancelled) throw new Error('cancelled');

      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      const loadingTask = pdfjsLib.getDocument({ url: blobUrl });
      activeLoadingTask = loadingTask;

      const timeoutId = setTimeout(() => { try { loadingTask.destroy(); } catch {} }, PER_ATTEMPT_TIMEOUT_MS);
      try {
        return await loadingTask.promise;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const loadPdf = async () => {
      try {
        const pdfUrl = await getPdfUrl(sheet);
        if (cancelled) return;
        setResolvedPdfUrl(pdfUrl);

        // Offline → blob path only (SW serves from cache).
        const startOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        let useBlob = startOffline;
        let lastErr: any = null;

        for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
          if (cancelled) return;
          try {
            const pdf = useBlob ? await loadViaBlob(pdfUrl) : await loadViaRange(pdfUrl);
            if (cancelled) return;
            setFetchProgress(100);
            setPdfDoc(pdf);
            setNumPages(pdf.numPages);
            return;
          } catch (err: any) {
            if (cancelled) return;
            lastErr = err;
            console.warn(`PDF load attempt ${attempt + 1}/${BACKOFF.length} failed (${useBlob ? 'blob' : 'range'}):`, err);

            // First Range failure → switch to blob fallback for the next attempt
            // (no backoff — try the alternate path immediately).
            if (!useBlob && isRangeRelatedError(err)) {
              useBlob = true;
              continue;
            }
            if (!isRetryableError(err)) break;
            if (attempt < BACKOFF.length - 1) {
              await sleep(BACKOFF[attempt]);
            }
          }
        }

        throw lastErr ?? new Error('Failed to load PDF');
      } catch (error) {
        if (cancelled) return;
        console.error('PDF load error:', error);
        setPdfError('Failed to load PDF. Please try again.');
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    };

    loadPdf();
    return () => {
      cancelled = true;
      if (activeLoadingTask) {
        try { activeLoadingTask.destroy(); } catch {}
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
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

  // ── Fetch monthly download count for free-tier gate ───────────────────────────
  useEffect(() => {
    if (!currentUserId || !ent.loaded || ent.canDownloadUnlimited || !ent.billingActive) return;
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    db.from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .eq('type', 'downloads')
      .gte('created_at', startOfMonth.toISOString())
      .then(({ count }) => setMonthlyDownloads(count ?? 0));
  }, [currentUserId, ent.loaded, ent.canDownloadUnlimited, ent.billingActive]);

  const toggleFavorite = async () => {
    if (!isLoggedIn) { onAuthRequired(); return; }
    if (!sheet || !currentUserId || favLoading) return;
    setFavLoading(true);
    const wasF = isFavorited;
    setIsFavorited(!wasF);
    setLocalLikesCount(n => wasF ? Math.max(0, n - 1) : n + 1);
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
      setLocalLikesCount(n => wasF ? n + 1 : Math.max(0, n - 1));
      onFavoritesChange?.(userFavorites);
    } finally {
      setFavLoading(false);
    }
  };

  const handleProtectedAction = (action: () => void) => {
    isLoggedIn ? action() : onAuthRequired();
  };

  // Offline save with entitlement gate
  const handleOfflineSave = () => {
    if (!isLoggedIn) { onAuthRequired(); return; }
    if (ent.billingActive && !ent.hasOfflineAccess) {
      onOpenPricing?.();
      return;
    }
    onSaveOffline?.();
  };

  const handleOpenNewTab = () => handleProtectedAction(() => {
    window.open(`${window.location.origin}${window.location.pathname}?sheet=${sheet?.id}`, '_blank');
  });

  const handleDownload = () => handleProtectedAction(async () => {
    // ── Download gate: free-tier monthly limit ─────────────────────────────────
    if (ent.billingActive && !ent.canDownloadUnlimited) {
      const count = monthlyDownloads ?? 0;
      if (count >= ent.monthlyDownloadLimit) {
        setShowDownloadGate(true);
        return;
      }
      // Optimistically increment local count so double-clicking doesn't bypass
      setMonthlyDownloads(n => (n ?? 0) + 1);
    }

    trackInteraction('downloads');
    const base = resolvedPdfUrl || sheet?.pdfUrl || '';
    if (!base) return;

    const filename = `${sheet?.title ?? 'sheet'} - ${sheet?.composer ?? ''}.pdf`.replace(/[\\/:*?"<>|]/g, '_').trim();

    try {
      // Fetch as blob so we can set our own filename regardless of CORS/cross-origin rules.
      // a.download is silently ignored for cross-origin URLs — blob URL is always same-origin.
      const resp = await fetch(base);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      // Fallback: open in new tab — browser will use server filename
      window.open(base, '_blank');
    }
  });

  const handleShare = async () => {
    const url = window.location.href;
    const title = sheet?.title ?? 'Sol-fa Sanctuary';
    const text = `"${title}" by ${sheet?.composer ?? ''} — Sol-fa Sanctuary`;
    const done = () => { setCopiedToast(true); setTimeout(() => setCopiedToast(false), 2500); };

    // Web Share API — shows native share sheet (WhatsApp, Facebook, copy link, etc.)
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return; // native share handled everything
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // user dismissed — do nothing
        // Other error: fall through to clipboard
      }
    }

    // Clipboard fallback
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else {
      fallbackCopy(url, done);
    }
  };

  const handleAddToCollection = () => {
    if (!isLoggedIn) { onAuthRequired(); return; }
    setShowCollectionDropdown(prev => !prev);
  };

  const toggleViewMode = () => setViewMode(m => m === 'flow' ? 'single' : 'flow');

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (viewMode !== 'single') return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) {
      if (delta > 0) setCurrentPage(p => Math.min(p + 1, numPages || 1));
      else setCurrentPage(p => Math.max(p - 1, 1));
    }
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

          {/* Views + Downloads + Comments — always visible, compact */}
          <div className={`flex items-center gap-3 shrink-0 border-l pl-3 md:pl-4 ${darkMode ? 'border-slate-700/50' : 'border-slate-300/60'}`}>
            <div className="flex items-center gap-1"><Eye size={14} className="text-blue-400" /><span className={`text-xs font-bold tabular-nums ${textPrimary}`}>{localViews}</span></div>
            <div className="flex items-center gap-1"><Download size={14} className="text-green-500" /><span className={`text-xs font-bold tabular-nums ${textPrimary}`}>{localDownloads}</span></div>
            <button
              onClick={scrollToComments}
              title="View comments"
              className={`flex items-center gap-1 transition-colors ${darkMode ? 'text-slate-400 hover:text-green-400' : 'text-slate-500 hover:text-green-600'}`}
            >
              <MessageSquare size={14} /><span className={`text-xs font-bold tabular-nums ${textPrimary}`}>{localCommentsCount}</span>
            </button>
          </div>

          {/* Metadata chips — hidden below md, inline above */}
          <div className={`hidden md:flex items-center gap-3 lg:gap-5 shrink-0 border-l pl-4 lg:pl-6 ${darkMode ? 'border-slate-700/50' : 'border-slate-300/60'}`}>
            <div className="flex items-center gap-1.5"><MusicIcon size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.type}</span></div>
            <div className="flex items-center gap-1.5"><FileText size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold whitespace-nowrap ${textPrimary}`}>{sheet.fileSize}</span></div>
            <div className="flex items-center gap-1.5 min-w-0"><Calendar size={13} className="text-slate-500 shrink-0" /><span className={`text-[11px] font-semibold max-w-[72px] truncate ${textPrimary}`}>{sheet.uploadedAt}</span></div>
            <div className="flex items-center gap-1.5 min-w-0"><User size={13} className="text-slate-500 shrink-0" />
              {onViewProfile
                ? <button onClick={() => onViewProfile(sheet.uploadedBy)} className={`text-[11px] font-semibold max-w-[72px] truncate hover:text-green-500 transition-colors ${textPrimary}`} title={sheet.uploadedBy.split('@')[0]}>{sheet.uploadedBy.split('@')[0]}</button>
                : <span className={`text-[11px] font-semibold max-w-[72px] truncate ${textPrimary}`}>{sheet.uploadedBy.split('@')[0]}</span>}
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
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-colors ${isFavorited ? 'border-rose-500/50 text-rose-500 bg-rose-500/10' : darkMode ? 'border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:text-rose-500 hover:bg-slate-50 shadow-sm'}`}
              title={isFavorited ? 'Remove favourite' : 'Add to favourites'}>
              <Heart size={17} className={isFavorited ? 'fill-current' : ''} />
              <span className="text-xs font-semibold">{localLikesCount}</span>
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

          {/* View mode toggle */}
          {numPages > 0 && (
            <button
              onClick={toggleViewMode}
              title={viewMode === 'flow' ? 'Switch to single-page view' : 'Switch to flow view'}
              className={`p-2 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {viewMode === 'flow' ? <Layers size={20} /> : <AlignJustify size={20} />}
            </button>
          )}

          {/* Mobile menu toggle (below md) */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden p-2 rounded-lg transition-colors shrink-0 ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
            {isMobileMenuOpen ? <ChevronUp size={22} /> : <Menu size={22} />}
          </button>

          {/* Offline save — desktop only (in mobile it goes in the drawer) */}
          {onSaveOffline && (
            <div className="hidden md:block shrink-0">
              <OfflineSaveButton
                isSaved={isAvailableOffline}
                isSaving={isSavingOffline}
                isRemoving={false}
                progress={offlineSaveProgress}
                onSave={handleOfflineSave}
                onRemove={onRemoveOffline ?? (() => {})}
                darkMode={darkMode}
                variant="full"
              />
            </div>
          )}

          {/* Download — gated for free users when billing active */}
          {ent.billingActive && !ent.canDownloadUnlimited && (monthlyDownloads ?? 0) >= ent.monthlyDownloadLimit ? (
            <button onClick={() => setShowDownloadGate(true)} aria-label="Download limit reached"
              className="shrink-0 px-3 md:px-5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-500 font-bold rounded-xl flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap cursor-pointer">
              <Lock size={15} /><span className="hidden sm:inline">Limit reached</span><span className="sm:hidden">Limit</span>
            </button>
          ) : (
            <button onClick={handleDownload} aria-label="Download PDF"
              className="shrink-0 px-3 md:px-5 py-2 bg-green-500 hover:bg-green-600 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-green-500/10 flex items-center gap-1.5 active:scale-95 text-xs md:text-sm whitespace-nowrap">
              <Download size={16} /><span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span>
            </button>
          )}
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
                className={`px-2 py-2.5 rounded-xl border flex-1 flex items-center justify-center gap-1.5 transition-colors ${isFavorited ? 'border-rose-500/50 text-rose-500 bg-rose-500/10' : darkMode ? 'border-slate-800 text-slate-400 hover:text-rose-400' : 'border-slate-200 text-slate-500 hover:text-rose-500'}`}>
                <Heart size={18} className={isFavorited ? 'fill-current' : ''} />
                <span className="text-xs font-semibold">{localLikesCount}</span>
              </button>
              {/* Offline save in mobile drawer */}
              {onSaveOffline && (
                <OfflineSaveButton
                  isSaved={isAvailableOffline}
                  isSaving={isSavingOffline}
                  isRemoving={false}
                  progress={offlineSaveProgress}
                  onSave={handleOfflineSave}
                  onRemove={onRemoveOffline ?? (() => {})}
                  darkMode={darkMode}
                  variant="icon"
                  className="flex-1 h-[42px] rounded-xl"
                />
              )}
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
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 no-print px-8">
                <Loader2 className="animate-spin text-green-500" size={48} />
                {fetchProgress > 0 && fetchProgress < 100 ? (
                  <div className="w-full max-w-xs space-y-2">
                    <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                        style={{ width: `${fetchProgress}%` }}
                      />
                    </div>
                    <p className={`text-xs text-center font-medium ${textSecondary}`}>
                      {fetchProgress < 90 ? `Downloading… ${fetchProgress}%` : 'Rendering score…'}
                    </p>
                  </div>
                ) : (
                  <p className={`text-sm font-medium animate-pulse ${textSecondary}`}>Opening the score…</p>
                )}
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
            ) : viewMode === 'single' ? (
              /* ── Single-page view ─────────────────────────────────── */
              <div
                className="relative select-none"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {numPages > 0 ? (
                  <>
                    {/* Render current ± 1 pages; hide non-active with CSS */}
                    <div className="p-2 md:p-4">
                      {Array.from({ length: numPages }).map((_, i) => (
                        <div key={i} className={currentPage === i + 1 ? 'block' : 'hidden'}>
                          <LazyPdfPage
                            index={i + 1}
                            pdfDoc={pdfDoc}
                            forceRender={isPrinting}
                            darkMode={darkMode}
                            sheetTitle={sheet.title}
                            isFirstPage={i === 0}
                            eager={Math.abs(currentPage - (i + 1)) <= 1}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Navigation bar */}
                    <div className={`flex items-center justify-between px-4 py-3 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage <= 1}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        <ChevronLeft size={16} /> Prev
                      </button>

                      {/* Page indicator */}
                      <span className={`text-sm font-bold tabular-nums ${textPrimary}`}>
                        {currentPage} <span className={`font-normal ${textSecondary}`}>/ {numPages}</span>
                      </span>

                      <button
                        onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))}
                        disabled={currentPage >= numPages}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-20 text-center no-print">
                    <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
                    <p className={textSecondary}>Harmony disrupted. Unable to display score.</p>
                  </div>
                )}
              </div>
            ) : (
              /* ── Flow view (continuous scroll) ───────────────────── */
              <div className="flex flex-col gap-2 sm:gap-4 p-2 md:p-4 bg-slate-200/5">
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
          <div ref={commentsSectionRef}>
            <CommentsSection
              sheetId={sheet.id}
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              currentUserDisplayName={currentUserDisplayName}
              isAdmin={false}
              darkMode={darkMode}
              onCountChange={setLocalCommentsCount}
            />
          </div>

          <div className="mt-8 md:mt-12 mb-12 text-center max-w-2xl mx-auto space-y-4 no-print">
            <div className="w-12 h-1 bg-green-500 mx-auto rounded-full"></div>
            <p className={`text-base md:text-lg italic font-serif ${textSecondary}`}>"This sheet music is provided for educational and devotional purposes. May your performance bring joy and sanctuary to all who listen."</p>
          </div>
        </div>
      </main>

      {/* ── Download gate modal ─────────────────────────────────────────────── */}
      {showDownloadGate && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={() => setShowDownloadGate(false)}>
          <div
            className={`relative rounded-2xl border p-6 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-200
              ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowDownloadGate(false)} className={`absolute top-3 right-3 p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}>
              <X size={16} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/10">
                <Lock size={22} className="text-amber-500" />
              </div>
              <div>
                <h3 className={`font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Monthly limit reached</h3>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Free plan · {ent.monthlyDownloadLimit} downloads/month
                </p>
              </div>
            </div>

            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              You've used all {ent.monthlyDownloadLimit} downloads this month. Upgrade to Maestro for unlimited downloads and offline access.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowDownloadGate(false); onOpenPricing?.(); }}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Zap size={15} /> See plans
              </button>
              <button
                onClick={() => setShowDownloadGate(false)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FullPreviewPage;
