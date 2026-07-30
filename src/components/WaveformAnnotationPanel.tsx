/**
 * WaveformAnnotationPanel â€Add and manage timestamped markers
 *
 * Lets engineers/producers mark key moments in the track:
 * - Verse/Chorus/Bridge/Drop section markers
 * - "Fix this" issue markers
 * - Cue points for DJ use
 * - Custom labeled bookmarks
 *
 * Markers persist to localStorage. Click a marker to seek.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMarkers,
  addMarker,
  updateMarker,
  deleteMarker,
  clearMarkers,
  formatTime,
  WaveformMarker,
  MarkerColor,
} from '../services/waveformAnnotations';

interface WaveformAnnotationPanelProps {
  duration: number;
  currentTime: number;
  onSeek?: (time: number) => void;
  onClose: () => void;
}

const MARKER_COLORS: Array<{ value: MarkerColor; bg: string; text: string; border: string }> = [
  { value: 'cyan',    bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    border: 'border-cyan-500/25' },
  { value: 'amber',   bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  { value: 'red',     bg: 'bg-red-500/15',     text: 'text-red-300',     border: 'border-red-500/25' },
  { value: 'emerald', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  { value: 'purple',  bg: 'bg-purple-500/15',  text: 'text-purple-300',  border: 'border-purple-500/25' },
  { value: 'orange',  bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/25' },
];

const QUICK_LABELS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Drop', 'Break', 'Outro', 'âšFix', 'ðŸŽCue', 'â­Best take', 'ðŸ”Loop start'];

const COLOR_HEX: Record<MarkerColor, string> = {
  cyan:    '#22d3ee',
  amber:   '#f59e0b',
  red:     '#ef4444',
  emerald: '#10b981',
  purple:  '#a855f7',
  orange:  '#f97316',
};

function MarkerRow({
  marker, onSeek, onDelete, onUpdate,
}: {
  marker: WaveformMarker;
  onSeek?: (t: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, changes: Partial<WaveformMarker>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [labelText, setLabelText] = useState(marker.label);
  const colorInfo = MARKER_COLORS.find(c => c.value === marker.color) ?? MARKER_COLORS[0];

  const saveEdit = useCallback(() => {
    onUpdate(marker.id, { label: labelText });
    setEditing(false);
  }, [marker.id, labelText, onUpdate]);

  return (
    <div className={`rounded-xl border ${colorInfo.border} ${colorInfo.bg} px-3 py-2.5 flex items-center gap-3`}>
      {/* Color dot */}
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_HEX[marker.color] }} />

      {/* Time */}
      <button
        onClick={() => onSeek?.(marker.time)}
        className="text-[9px] font-mono text-slate-400 hover:text-white transition-colors flex-shrink-0 w-16"
      >
        {formatTime(marker.time)}
      </button>

      {/* Label */}
      {editing ? (
        <input
          autoFocus
          value={labelText}
          onChange={e => setLabelText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
          className="flex-1 bg-transparent text-[10px] text-white outline-none border-b border-white/20"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={`flex-1 text-left text-[10px] font-semibold ${colorInfo.text} hover:opacity-80 transition-opacity`}
        >
          {marker.label}
        </button>
      )}

      {/* Color picker */}
      <div className="flex gap-1">
        {MARKER_COLORS.map(c => (
          <button
            key={c.value}
            onClick={() => onUpdate(marker.id, { color: c.value })}
            className="w-2.5 h-2.5 rounded-full transition-transform hover:scale-125"
            style={{ background: COLOR_HEX[c.value], outline: marker.color === c.value ? `2px solid ${COLOR_HEX[c.value]}` : 'none', outlineOffset: 1 }}
          />
        ))}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(marker.id)}
        className="text-slate-700 hover:text-red-400 text-xs transition-colors"
      >
        âœ•
      </button>
    </div>
  );
}

export const WaveformAnnotationPanel: React.FC<WaveformAnnotationPanelProps> = ({
  duration, currentTime, onSeek, onClose,
}) => {
  const [markers, setMarkers] = useState<WaveformMarker[]>(() => getMarkers());
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<MarkerColor>('cyan');
  const [confirmClear, setConfirmClear] = useState(false);

  const addAtCurrent = useCallback((label: string, color: MarkerColor = newColor) => {
    const m = addMarker({ time: currentTime, label: label || 'Marker', color });
    setMarkers(getMarkers());
    setNewLabel('');
  }, [currentTime, newColor]);

  const handleDelete = useCallback((id: string) => {
    deleteMarker(id);
    setMarkers(getMarkers());
  }, []);

  const handleUpdate = useCallback((id: string, changes: Partial<WaveformMarker>) => {
    updateMarker(id, changes);
    setMarkers(getMarkers());
  }, []);

  const handleClear = useCallback(() => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearMarkers();
    setMarkers([]);
    setConfirmClear(false);
  }, [confirmClear]);

  const exportCueSheet = useCallback(() => {
    const lines = markers.map(m => `${formatTime(m.time)}\t${m.label}`).join('\n');
    const blob = new Blob([`# Cue sheet â€Echo Sound Lab\n\n${lines}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cue_sheet.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [markers]);

  // Progress of current time marker
  const progress = duration > 0 ? currentTime / duration : 0;

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
            <h2 className="text-sm font-bold text-white">Waveform Markers</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Bookmark key moments â€sections, cues, issues Âclick to seek
            </p>
          </div>
          <div className="flex items-center gap-2">
            {markers.length > 0 && (
              <>
                <button onClick={exportCueSheet} className="text-[9px] text-slate-600 hover:text-slate-400 border border-white/[0.06] px-2 py-1 rounded-lg hover:border-white/10 transition-all">
                  â†Cue sheet
                </button>
                <button onClick={handleClear} className={`text-[9px] border px-2 py-1 rounded-lg transition-all ${confirmClear ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                  {confirmClear ? 'Confirm' : 'Clear all'}
                </button>
              </>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Current playback position */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-slate-600 uppercase tracking-widest">Current position</p>
              <p className="text-[10px] font-mono text-cyan-400">{formatTime(currentTime)}</p>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400/40 rounded-full" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          {/* Quick add */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Add marker at current position</p>

            {/* Quick labels */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_LABELS.map(label => (
                <button
                  key={label}
                  onClick={() => addAtCurrent(label)}
                  className="text-[8px] px-2 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom label */}
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAtCurrent(newLabel); }}
                placeholder="Custom labelâ€¦"
                className="flex-1 bg-slate-800/60 border border-white/[0.08] text-slate-300 text-[10px] rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500/40"
              />
              {/* Color picker */}
              <div className="flex gap-1 items-center">
                {MARKER_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setNewColor(c.value)}
                    className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: COLOR_HEX[c.value],
                      outline: newColor === c.value ? `2px solid ${COLOR_HEX[c.value]}` : 'none',
                      outlineOffset: 1,
                    }}
                  />
                ))}
              </div>
              <button
                onClick={() => addAtCurrent(newLabel)}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 text-[9px] font-semibold hover:bg-cyan-500/30 transition-all"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Marker list */}
          {markers.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="text-slate-600 text-2xl">ðŸŽ¯</p>
              <p className="text-[10px] text-slate-600">No markers yet.</p>
              <p className="text-[9px] text-slate-700">Play the track, pause at a key moment, and tap a quick label above.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">{markers.length} marker{markers.length !== 1 ? 's' : ''}</p>
                <p className="text-[8px] text-slate-700">Click time to seek Âclick label to edit</p>
              </div>
              <AnimatePresence>
                {markers.map(m => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <MarkerRow
                      marker={m}
                      onSeek={onSeek}
                      onDelete={handleDelete}
                      onUpdate={handleUpdate}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
