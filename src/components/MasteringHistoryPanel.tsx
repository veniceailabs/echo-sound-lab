/**
 * MasteringHistoryPanel â€Session log of all mastering runs
 *
 * Shows a timeline of every mastering run stored in localStorage:
 * platform, genre, settings, LUFS result, gain applied, processing chain.
 * Lets users add notes to each run. Supports clearing the history.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMasteringHistory,
  updateRunNote,
  clearHistory,
  formatRunSummary,
  MasteringRun,
} from '../services/masteringHistory';

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube: '#FF0000',
  tidal: '#00FFFF',
  soundcloud: '#FF5500',
  bandcamp: '#1da0c3',
  streaming: '#a855f7',
  club: '#f97316',
  broadcast: '#22d3ee',
};

function RunCard({ run, onNoteChange }: { key?: React.Key; run: MasteringRun; onNoteChange: (id: string, note: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState(run.note ?? '');

  const accentColor = PLATFORM_COLORS[run.platform] ?? '#22d3ee';

  const timeAgo = (ts: number) => {
    const delta = (Date.now() - ts) / 1000;
    if (delta < 60) return 'just now';
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  };

  const saveNote = useCallback(() => {
    onNoteChange(run.id, noteText);
    setEditing(false);
  }, [run.id, noteText, onNoteChange]);

  return (
    <motion.div
      layout
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
    >
      {/* Card header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Colored accent dot */}
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-200 truncate">
            {formatRunSummary(run)}
          </p>
          <p className="text-[8px] text-slate-600 mt-0.5">
            {run.platform} Â{run.genre} Âintensity {(run.intensity * 100).toFixed(0)}%
            {run.transparent ? ' Âtransparent' : ''}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-[8px] text-slate-600">{timeAgo(run.timestamp)}</p>
          {run.appliedLUFS && (
            <p className="text-[9px] font-mono text-cyan-400">{run.appliedLUFS.toFixed(1)} LUFS</p>
          )}
        </div>

        <span className="text-slate-700 text-xs ml-1">{expanded ? 'â–²' : 'â–¼'}</span>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2">
                {run.gainApplied != null && (
                  <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">Gain</p>
                    <p className={`text-[11px] font-mono font-bold ${run.gainApplied > 0 ? 'text-cyan-300' : 'text-red-300'}`}>
                      {run.gainApplied > 0 ? '+' : ''}{run.gainApplied.toFixed(1)} dB
                    </p>
                  </div>
                )}
                {run.durationSeconds != null && (
                  <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">Duration</p>
                    <p className="text-[11px] font-mono font-bold text-slate-300">
                      {Math.floor(run.durationSeconds / 60)}:{String(Math.floor(run.durationSeconds % 60)).padStart(2, '0')}
                    </p>
                  </div>
                )}
                {run.detectedGenre && (
                  <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">AI Genre</p>
                    <p className="text-[9px] font-semibold text-purple-300 capitalize">{run.detectedGenre}</p>
                  </div>
                )}
              </div>

              {/* Processing chain */}
              {run.processingChain && run.processingChain.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[7px] text-slate-600 uppercase tracking-widest">Processing chain</p>
                  <div className="flex flex-wrap gap-1">
                    {run.processingChain.map((step, i) => (
                      <span key={i} className="text-[8px] px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Note editor */}
              <div className="space-y-1.5">
                <p className="text-[7px] text-slate-600 uppercase tracking-widest">Note</p>
                {editing ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditing(false); }}
                      className="flex-1 bg-slate-800/60 border border-white/[0.08] text-slate-300 text-[10px] rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500/40"
                      placeholder="Add a note about this sessionâ€¦"
                    />
                    <button onClick={saveNote} className="text-[9px] text-cyan-400 hover:text-cyan-300 px-2">Save</button>
                    <button onClick={() => setEditing(false)} className="text-[9px] text-slate-600 hover:text-slate-400 px-2">âœ•</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full text-left text-[9px] rounded-lg border border-dashed border-white/[0.06] px-2.5 py-1.5 text-slate-600 hover:text-slate-400 hover:border-white/10 transition-colors"
                  >
                    {run.note ?? '+ Add noteâ€¦'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface MasteringHistoryPanelProps {
  onClose: () => void;
}

export const MasteringHistoryPanel: React.FC<MasteringHistoryPanelProps> = ({ onClose }) => {
  const [history, setHistory] = useState<MasteringRun[]>(() => getMasteringHistory());
  const [confirmClear, setConfirmClear] = useState(false);

  const handleNoteChange = useCallback((id: string, note: string) => {
    updateRunNote(id, note);
    setHistory(getMasteringHistory());
  }, []);

  const handleClear = useCallback(() => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearHistory();
    setHistory([]);
    setConfirmClear(false);
  }, [confirmClear]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Mastering History</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {history.length} run{history.length !== 1 ? 's' : ''} stored Âlast 20 sessions
            </p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className={`text-[9px] px-2 py-1 rounded border transition-all ${
                  confirmClear
                    ? 'text-red-300 border-red-500/30 bg-red-500/10'
                    : 'text-slate-600 border-white/[0.06] hover:text-slate-400'
                }`}
              >
                {confirmClear ? 'Confirm clear' : 'Clear'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
            >
              âœ•
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {history.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-slate-600 text-2xl">ðŸ“‹</p>
              <p className="text-[11px] text-slate-500">No mastering runs yet.</p>
              <p className="text-[9px] text-slate-700">
                Run the AI master engine â€your sessions will appear here automatically.
              </p>
            </div>
          ) : (
            history.map(run => (
              <RunCard key={run.id} run={run} onNoteChange={handleNoteChange} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
