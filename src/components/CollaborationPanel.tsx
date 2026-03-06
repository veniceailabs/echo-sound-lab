import React, { useEffect, useMemo, useState } from 'react';
import { RevisionEntry } from '../types';

type CollaborationComment = {
  id: string;
  author: string;
  message: string;
  createdAt: number;
};

interface CollaborationPanelProps {
  trackName: string;
  revisionLog: RevisionEntry[];
}

const COMMENT_KEY_PREFIX = 'echo.collab.comments.v1:';
const SHARE_KEY = 'echo.collab.shares.v1';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDelta(before: number, after: number, unit = ''): string {
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}${unit}`;
}

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({ trackName, revisionLog }) => {
  const commentKey = `${COMMENT_KEY_PREFIX}${trackName || 'untitled'}`;
  const [author, setAuthor] = useState('Producer');
  const [message, setMessage] = useState('');
  const [comments, setComments] = useState<CollaborationComment[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  useEffect(() => {
    if (!trackName) return;
    try {
      const raw = window.localStorage.getItem(commentKey);
      const parsed = raw ? (JSON.parse(raw) as CollaborationComment[]) : [];
      setComments(Array.isArray(parsed) ? parsed : []);
    } catch {
      setComments([]);
    }
  }, [commentKey, trackName]);

  useEffect(() => {
    if (!trackName) return;
    try {
      window.localStorage.setItem(commentKey, JSON.stringify(comments.slice(0, 50)));
    } catch {
      // ignore storage failures
    }
  }, [comments, commentKey, trackName]);

  useEffect(() => {
    if (!revisionLog.length) return;
    setCompareA((current) => current || revisionLog[Math.max(revisionLog.length - 1, 0)]?.id || '');
    setCompareB((current) => current || revisionLog[Math.max(revisionLog.length - 2, 0)]?.id || '');
  }, [revisionLog]);

  const comparePair = useMemo(() => {
    const a = revisionLog.find((entry) => entry.id === compareA);
    const b = revisionLog.find((entry) => entry.id === compareB);
    if (!a || !b) return null;
    return { a, b };
  }, [compareA, compareB, revisionLog]);

  const createShareLink = async () => {
    const id = `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      id,
      trackName,
      createdAt: Date.now(),
      revisionCount: revisionLog.length,
      lastRevision: revisionLog[revisionLog.length - 1]?.summary || 'No revision summary yet',
    };
    try {
      const raw = window.localStorage.getItem(SHARE_KEY);
      const shares = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      shares[id] = payload;
      window.localStorage.setItem(SHARE_KEY, JSON.stringify(shares));
    } catch {
      // ignore, link still generated
    }
    const url = new URL(window.location.href);
    url.searchParams.set('share', id);
    const link = url.toString();
    setShareLink(link);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // clipboard fallback omitted intentionally
    }
  };

  const addComment = () => {
    if (!message.trim()) return;
    const entry: CollaborationComment = {
      id: `c-${Date.now()}`,
      author: author.trim() || 'Producer',
      message: message.trim(),
      createdAt: Date.now(),
    };
    setComments((prev) => [entry, ...prev]);
    setMessage('');
  };

  return (
    <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Collaboration</p>
      <h3 className="mt-1 text-base font-semibold text-slate-100">Share projects, leave notes, compare revisions</h3>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Share Project</p>
          <p className="mt-1 text-xs text-slate-400">Generate a link snapshot for collaborators.</p>
          <button
            type="button"
            onClick={() => void createShareLink()}
            className="mt-3 w-full rounded-lg border border-orange-400/35 bg-orange-500/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200 transition-colors hover:bg-orange-500/20"
          >
            Create Share Link
          </button>
          {shareLink && (
            <p className="mt-2 break-all rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-300">{shareLink}</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-3 xl:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Session Comments</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Your name"
              className="rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400/50"
            />
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add a mix note (e.g. lift chorus vocal 1dB)"
              className="rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400/50"
            />
            <button
              type="button"
              onClick={addComment}
              className="rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              Add
            </button>
          </div>
          <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
            {comments.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-500">No comments yet.</p>
            ) : comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-white/10 bg-slate-900/55 px-3 py-2">
                <p className="text-xs text-slate-300"><span className="font-semibold">{comment.author}</span> · {formatTime(comment.createdAt)}</p>
                <p className="mt-1 text-sm text-slate-200">{comment.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/45 p-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Revision Compare</p>
        {revisionLog.length < 2 ? (
          <p className="mt-2 text-xs text-slate-500">Need at least 2 revisions to compare.</p>
        ) : (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                value={compareA}
                onChange={(event) => setCompareA(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
              >
                {revisionLog.map((entry) => (
                  <option key={entry.id} value={entry.id}>{new Date(entry.timestamp).toLocaleTimeString()} · {entry.summary}</option>
                ))}
              </select>
              <select
                value={compareB}
                onChange={(event) => setCompareB(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
              >
                {revisionLog.map((entry) => (
                  <option key={entry.id} value={entry.id}>{new Date(entry.timestamp).toLocaleTimeString()} · {entry.summary}</option>
                ))}
              </select>
            </div>
            {comparePair && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-900/55 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">LUFS Delta</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {formatDelta(comparePair.b.afterMetrics.lufs?.integrated ?? 0, comparePair.a.afterMetrics.lufs?.integrated ?? 0, ' LUFS')}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/55 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Peak Delta</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {formatDelta(comparePair.b.afterMetrics.peak ?? 0, comparePair.a.afterMetrics.peak ?? 0, ' dB')}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/55 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Actions</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {comparePair.a.appliedActions.length} vs {comparePair.b.appliedActions.length}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CollaborationPanel;
