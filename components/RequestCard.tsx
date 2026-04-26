import React, { useState } from 'react';
import { ThumbsUp, MessageSquare, Upload, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { SheetRequest } from '../types';
import { db } from '../supabase';
import RequestComments from './RequestComments';

interface RequestCardProps {
  request: SheetRequest;
  darkMode: boolean;
  currentUserId: string | null;
  onAuthRequired?: () => void;
  onFulfill?: (req: SheetRequest) => void;
  onVoteChange?: (id: string, newCount: number, voted: boolean) => void;
}

const STATUS_STYLES: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  open:        { label: 'Open',        icon: <Clock size={12} />,         cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  in_progress: { label: 'In Progress', icon: <Clock size={12} />,         cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  fulfilled:   { label: 'Fulfilled',   icon: <CheckCircle2 size={12} />,  cls: 'bg-green-500/10 text-green-500 border-green-500/20' },
  closed:      { label: 'Closed',      icon: <XCircle size={12} />,       cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

const RequestCard: React.FC<RequestCardProps> = ({
  request, darkMode, currentUserId, onAuthRequired, onFulfill, onVoteChange,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [localVoted, setLocalVoted] = useState(request.voted_by_me ?? false);
  const [localCount, setLocalCount] = useState(request.votes_count);
  const [voting, setVoting] = useState(false);

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) { onAuthRequired?.(); return; }
    if (voting) return;
    setVoting(true);
    // Optimistic
    const newVoted = !localVoted;
    const newCount = localCount + (newVoted ? 1 : -1);
    setLocalVoted(newVoted);
    setLocalCount(newCount);
    try {
      const { data, error } = await db.rpc('toggle_request_vote', { p_request_id: request.id });
      if (error) throw error;
      setLocalCount(data.votes_count);
      setLocalVoted(data.voted);
      onVoteChange?.(request.id, data.votes_count, data.voted);
    } catch {
      // rollback
      setLocalVoted(localVoted);
      setLocalCount(localCount);
    } finally {
      setVoting(false);
    }
  };

  const status = STATUS_STYLES[request.status] ?? STATUS_STYLES.open;
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';

  const isOpen = request.status === 'open' || request.status === 'in_progress';

  return (
    <div className={`border rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${cardBg}`}>
      <div className="p-4 space-y-3">
        {/* Top row: status + title */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-base leading-snug truncate ${textPrimary}`}>{request.title}</h3>
            {request.composer && (
              <p className={`text-sm truncate ${textSecondary}`}>{request.composer}</p>
            )}
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${status.cls}`}>
            {status.icon}{status.label}
          </span>
        </div>

        {/* Notes preview */}
        {request.notes && (
          <p className={`text-sm line-clamp-2 ${textSecondary}`}>{request.notes}</p>
        )}

        {/* Meta */}
        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          Requested {request.requester_name ? `by ${request.requester_name}` : 'anonymously'} ·{' '}
          {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-1">
          {/* Vote */}
          <button
            onClick={handleVote}
            disabled={voting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
              localVoted
                ? 'bg-green-500 border-green-500 text-white'
                : darkMode
                  ? 'border-slate-700 text-slate-400 hover:border-green-500 hover:text-green-400'
                  : 'border-slate-200 text-slate-600 hover:border-green-500 hover:text-green-600'
            }`}
          >
            <ThumbsUp size={13} className={localVoted ? 'fill-white' : ''} />
            {localCount}
          </button>

          {/* Comments toggle */}
          <button
            onClick={() => setExpanded(x => !x)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
              darkMode
                ? 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800'
            }`}
          >
            <MessageSquare size={13} />
            {request.comments_count ?? 0}
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* Fulfill button — only for open/in_progress */}
          {isOpen && onFulfill && (
            <button
              onClick={() => onFulfill(request)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                darkMode
                  ? 'border-green-500/40 text-green-400 hover:bg-green-500 hover:text-white hover:border-green-500'
                  : 'border-green-400 text-green-600 hover:bg-green-500 hover:text-white hover:border-green-500'
              }`}
            >
              <Upload size={13} /> Fulfill
            </button>
          )}
        </div>
      </div>

      {/* Expanded comments */}
      {expanded && (
        <div className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <RequestComments
            requestId={request.id}
            darkMode={darkMode}
            currentUserId={currentUserId}
            onAuthRequired={onAuthRequired}
          />
        </div>
      )}
    </div>
  );
};

export default RequestCard;
