import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { db, auth } from '../supabase';
import { SheetRequest } from '../types';
import Modal from './Modal';

interface SimilarResult {
  id: string;
  title: string;
  composer: string | null;
  similarity_score: number;
  kind: 'sheet' | 'request';
  votes_count?: number;
  status?: string;
}

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  currentUserId: string | null;
  userDisplayName?: string;
  userEmail?: string;
  /** Pre-fill title (e.g. from upload modal duplicate warning) */
  prefillTitle?: string;
  prefillComposer?: string;
  onRequestSubmitted?: (req: SheetRequest) => void;
  onViewSheet?: (sheetId: string) => void;
  onViewRequest?: (reqId: string) => void;
}

function useDebounce<T>(value: T, ms: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedValue(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return debouncedValue;
}

const RequestModal: React.FC<RequestModalProps> = ({
  isOpen, onClose, darkMode, currentUserId, userDisplayName, userEmail,
  prefillTitle = '', prefillComposer = '',
  onRequestSubmitted, onViewSheet, onViewRequest,
}) => {
  const [title, setTitle] = useState(prefillTitle);
  const [composer, setComposer] = useState(prefillComposer);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [similar, setSimilar] = useState<SimilarResult[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const debouncedTitle = useDebounce(title, 500);
  const debouncedComposer = useDebounce(composer, 500);

  // Pre-fill when modal opens with props
  useEffect(() => {
    if (isOpen) {
      setTitle(prefillTitle);
      setComposer(prefillComposer);
      setNotes('');
      setSimilar([]);
    }
  }, [isOpen, prefillTitle, prefillComposer]);

  // Duplicate detection: query both sheets and open requests via RPC
  useEffect(() => {
    if (!debouncedTitle || debouncedTitle.length < 3) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setCheckingDupes(true);
      try {
        const [sheetsRes, reqsRes] = await Promise.all([
          db.rpc('find_similar_sheets', {
            p_title: debouncedTitle,
            p_composer: debouncedComposer || null,
            p_threshold: 0.25,
          }),
          db.rpc('find_similar_requests', {
            p_title: debouncedTitle,
            p_composer: debouncedComposer || null,
            p_threshold: 0.25,
          }),
        ]);

        if (cancelled) return;
        const results: SimilarResult[] = [];
        if (sheetsRes.data) {
          for (const s of sheetsRes.data) {
            results.push({ ...s, kind: 'sheet' });
          }
        }
        if (reqsRes.data) {
          for (const r of reqsRes.data) {
            results.push({ ...r, kind: 'request' });
          }
        }
        results.sort((a, b) => b.similarity_score - a.similarity_score);
        setSimilar(results.slice(0, 5));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setCheckingDupes(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedTitle, debouncedComposer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      const user = currentUserId ? (await auth.getUser()).data.user : null;
      const { data, error } = await db
        .from('sheet_requests')
        .insert({
          title: title.trim(),
          composer: composer.trim() || null,
          notes: notes.trim() || null,
          requested_by: currentUserId ?? null,
          requester_name: userDisplayName ?? null,
          requester_email: userEmail ?? null,
          status: 'open',
          votes_count: 0,
        })
        .select()
        .single();

      if (error) throw error;
      onRequestSubmitted?.(data as SheetRequest);
      onClose();
      setTitle('');
      setComposer('');
      setNotes('');
      setSimilar([]);
    } catch (err: any) {
      alert('Failed to submit request: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputCls = `w-full rounded-lg px-4 py-2.5 border focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`;

  const hasDupes = similar.length > 0;
  const existingSheets = similar.filter(s => s.kind === 'sheet');
  const existingReqs = similar.filter(s => s.kind === 'request');

  return (
    <Modal isOpen={isOpen} onClose={onClose} darkMode={darkMode} maxWidth="lg" loading={isSubmitting}>
      {/* Header */}
      <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center">
            <BookOpen className="text-amber-500" size={20} />
          </div>
          <div>
            <h2 className={`text-xl font-bold ${textPrimary}`}>Request a Sheet</h2>
            <p className={`text-sm ${textSecondary}`}>Can't find what you need? Ask the community.</p>
          </div>
        </div>
        <button onClick={onClose} disabled={isSubmitting} className="text-slate-400 hover:text-green-500 transition-colors disabled:opacity-50">
          <X size={20} />
        </button>
      </div>

      <form className="p-6 space-y-5" onSubmit={handleSubmit}>
        {/* Title */}
        <div className="space-y-1.5">
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Song / Piece Title <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Behold Our God"
              className={inputCls}
            />
            {checkingDupes && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={14} />
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="space-y-1.5">
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Composer / Arranger</label>
          <input
            type="text"
            value={composer}
            onChange={e => setComposer(e.target.value)}
            placeholder="e.g. Peter Kwo (optional)"
            className={inputCls}
          />
        </div>

        {/* Duplicate warning */}
        {hasDupes && (
          <div className={`rounded-xl border p-4 space-y-3 ${darkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <p className={`text-sm font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                Similar items already exist
              </p>
            </div>

            {existingSheets.length > 0 && (
              <div className="space-y-1.5">
                <p className={`text-xs font-medium uppercase tracking-wide ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Already in the library</p>
                {existingSheets.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onViewSheet?.(s.id); onClose(); }}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${darkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-50 border border-slate-200'}`}
                  >
                    <span>
                      <span className={`font-medium ${textPrimary}`}>{s.title}</span>
                      {s.composer && <span className={` ml-2 ${textSecondary}`}>— {s.composer}</span>}
                    </span>
                    <ChevronRight size={14} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {existingReqs.length > 0 && (
              <div className="space-y-1.5">
                <p className={`text-xs font-medium uppercase tracking-wide ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Already requested</p>
                {existingReqs.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { onViewRequest?.(r.id); onClose(); }}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${darkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-50 border border-slate-200'}`}
                  >
                    <span>
                      <span className={`font-medium ${textPrimary}`}>{r.title}</span>
                      {r.composer && <span className={` ml-2 ${textSecondary}`}>— {r.composer}</span>}
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                        {r.votes_count ?? 0} votes · {r.status}
                      </span>
                    </span>
                    <ChevronRight size={14} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              You can still submit a new request if none of these match.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Additional notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Any extra context — e.g. SATB version, specific key, arrangement details…"
            className={`${inputCls} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <><Loader2 className="animate-spin" size={18} /> Submitting…</> : 'Submit Request'}
        </button>

        {!currentUserId && (
          <p className={`text-xs text-center ${textSecondary}`}>
            You are submitting anonymously. Sign in to track your request and vote.
          </p>
        )}
      </form>
    </Modal>
  );
};

export default RequestModal;
