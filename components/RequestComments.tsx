import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Link2, ExternalLink } from 'lucide-react';
import { db, auth } from '../supabase';
import { RequestComment } from '../types';

interface RequestCommentsProps {
  requestId: string;
  darkMode: boolean;
  currentUserId: string | null;
  onAuthRequired?: () => void;
}

const RequestComments: React.FC<RequestCommentsProps> = ({
  requestId, darkMode, currentUserId, onAuthRequired,
}) => {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sheetQuery, setSheetQuery] = useState('');
  const [sheetResults, setSheetResults] = useState<{ id: string; title: string; composer: string }[]>([]);
  const [linkedSheetId, setLinkedSheetId] = useState<string | null>(null);
  const [linkedSheetTitle, setLinkedSheetTitle] = useState<string | null>(null);
  const [showSheetSearch, setShowSheetSearch] = useState(false);
  const sheetSearchRef = useRef<HTMLDivElement>(null);

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  // Fetch comments
  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from('request_comments')
        .select('*, linked_sheet:sheet_id(id, title, composer)')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setComments((data ?? []).map((c: any) => ({
        ...c,
        linked_sheet: c.linked_sheet ?? null,
      })) as RequestComment[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();

    // Realtime subscription
    const channel = db
      .channel(`request_comments:${requestId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'request_comments',
        filter: `request_id=eq.${requestId}`,
      }, () => fetchComments())
      .subscribe();

    return () => { db.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // Sheet search for link insertion
  useEffect(() => {
    if (!sheetQuery || sheetQuery.length < 2) { setSheetResults([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('sheets')
        .select('id, title, composer')
        .ilike('title', `%${sheetQuery}%`)
        .limit(6);
      if (!cancelled) setSheetResults(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [sheetQuery]);

  // Close sheet search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sheetSearchRef.current && !sheetSearchRef.current.contains(e.target as Node)) {
        setShowSheetSearch(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    if (!currentUserId) { onAuthRequired?.(); return; }
    setSubmitting(true);
    try {
      const user = await auth.getUser();
      const displayName = user.data.user?.user_metadata?.display_name
        || user.data.user?.email?.split('@')[0]
        || 'Anonymous';

      const { error } = await db.from('request_comments').insert({
        request_id: requestId,
        user_id: currentUserId,
        display_name: displayName,
        body: body.trim(),
        sheet_id: linkedSheetId ?? null,
      });
      if (error) throw error;
      setBody('');
      setLinkedSheetId(null);
      setLinkedSheetTitle(null);
    } catch (err: any) {
      alert('Could not post comment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectSheet = (sheet: { id: string; title: string; composer: string }) => {
    setLinkedSheetId(sheet.id);
    setLinkedSheetTitle(sheet.title);
    setShowSheetSearch(false);
    setSheetQuery('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-slate-400" size={20} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Comment list */}
      {comments.length === 0 ? (
        <p className={`text-sm text-center py-2 ${textSecondary}`}>No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className={`flex gap-2.5`}>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {c.display_name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${textPrimary}`}>{c.display_name}</span>
                  <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className={`text-sm break-words ${textSecondary}`}>{c.body}</p>
                {/* Linked sheet chip */}
                {c.linked_sheet && (
                  <a
                    href={`/?sheet=${c.linked_sheet.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                      darkMode
                        ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
                        : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    <Link2 size={11} />
                    {c.linked_sheet.title}
                    <ExternalLink size={10} className="opacity-60" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compose */}
      {currentUserId ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Linked sheet chip */}
          {linkedSheetTitle && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border w-fit ${
              darkMode ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              <Link2 size={11} />
              {linkedSheetTitle}
              <button type="button" onClick={() => { setLinkedSheetId(null); setLinkedSheetTitle(null); }} className="ml-1 hover:opacity-70">×</button>
            </div>
          )}

          <div className="flex gap-2 items-start">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Leave a comment or paste a sheet link…"
              rows={2}
              className={`flex-1 rounded-lg px-3 py-2 border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            />
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="p-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            </button>
          </div>

          {/* Link a sheet */}
          <div className="relative" ref={sheetSearchRef}>
            <button
              type="button"
              onClick={() => setShowSheetSearch(x => !x)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                darkMode
                  ? 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                  : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-400'
              }`}
            >
              <Link2 size={12} /> Link an existing sheet
            </button>

            {showSheetSearch && (
              <div className={`absolute bottom-full mb-1 left-0 w-72 rounded-xl border shadow-xl z-20 overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="p-2">
                  <input
                    autoFocus
                    type="text"
                    value={sheetQuery}
                    onChange={e => setSheetQuery(e.target.value)}
                    placeholder="Search sheets…"
                    className={`w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
                  />
                </div>
                {sheetResults.length > 0 && (
                  <div className="border-t divide-y max-h-48 overflow-y-auto">
                    {sheetResults.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectSheet(s)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-800 divide-slate-800 border-slate-800' : 'text-slate-700 hover:bg-slate-50 divide-slate-100 border-slate-100'}`}
                      >
                        <span className="font-medium">{s.title}</span>
                        {s.composer && <span className={`ml-1 text-xs ${textSecondary}`}>— {s.composer}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {sheetQuery.length >= 2 && sheetResults.length === 0 && (
                  <p className={`p-3 text-xs ${textSecondary}`}>No sheets found</p>
                )}
              </div>
            )}
          </div>
        </form>
      ) : (
        <button
          onClick={onAuthRequired}
          className={`w-full py-2 text-sm rounded-lg border transition-colors ${darkMode ? 'border-slate-800 text-slate-500 hover:text-slate-300' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}
        >
          Sign in to comment
        </button>
      )}
    </div>
  );
};

export default RequestComments;
