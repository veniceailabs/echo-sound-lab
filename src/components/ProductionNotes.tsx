/**
 * ProductionNotes â€Session notepad for the mix engineer
 *
 * A rich notepad that persists per-session to localStorage.
 * Supports:
 * - Free-text notes with markdown-like formatting (bold, bullet)
 * - Quick-insert snippets: loop markers, mix references, to-dos
 * - Tag system: mix, master, idea, issue, reference
 * - Export as plain text
 * - Multiple note pages ("pages")
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface ProductionNotesProps {
  onClose: () => void;
}

const STORAGE_KEY = 'esl_production_notes';
const ALL_TAGS = ['mix', 'master', 'idea', 'issue', 'reference', 'todo', 'vibe'];

const TAG_COLORS: Record<string, string> = {
  mix:       '#22d3ee',
  master:    '#a855f7',
  idea:      '#10b981',
  issue:     '#ef4444',
  reference: '#f59e0b',
  todo:      '#f97316',
  vibe:      '#ec4899',
};

const SNIPPETS = [
  { label: 'â†Reference', text: 'ðŸŽReference: [artist - track]\nLUFS: __ ÂPeak: __ ÂNotes: __\n' },
  { label: 'â†‘ Loop', text: 'ðŸ”Loop: bars __ to __\nBPM: __ ÂKey: __\n' },
  { label: 'âœTo-Do', text: 'â˜\nâ˜\nâ˜\n' },
  { label: 'âšIssue', text: 'âšIssue: [description]\nTrack: __ ÂTime: __:__\nFix: __\n' },
  { label: 'ðŸŽSettings', text: 'ðŸŽPlugin settings snapshot:\nEQ: __\nComp: threshold __ Âratio __ : 1\nReverb: __\n' },
];

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotes(notes: Note[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
}

function newNote(): Note {
  return {
    id: Date.now().toString(36),
    title: 'New note',
    body: '',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function timeAgo(ts: number): string {
  const delta = (Date.now() - ts) / 1000;
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export const ProductionNotes: React.FC<ProductionNotesProps> = ({ onClose }) => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const loaded = loadNotes();
    return loaded.length > 0 ? loaded : [newNote()];
  });
  const [selectedId, setSelectedId] = useState<string>(() => {
    const loaded = loadNotes();
    return loaded.length > 0 ? loaded[0].id : notes[0]?.id ?? '';
  });
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = notes.find(n => n.id === selectedId) ?? notes[0];

  const update = useCallback((id: string, changes: Partial<Note>) => {
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...changes, updatedAt: Date.now() } : n);
      saveNotes(updated);
      return updated;
    });
  }, []);

  const addNote = useCallback(() => {
    const note = newNote();
    setNotes(prev => {
      const updated = [note, ...prev];
      saveNotes(updated);
      return updated;
    });
    setSelectedId(note.id);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      saveNotes(updated);
      if (selectedId === id && updated.length > 0) setSelectedId(updated[0].id);
      return updated;
    });
  }, [selectedId]);

  const insertSnippet = useCallback((text: string) => {
    if (!textareaRef.current || !selected) return;
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = selected.body.slice(0, start) + text + selected.body.slice(end);
    update(selected.id, { body: newBody });
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    }, 0);
  }, [selected, update]);

  const toggleTag = useCallback((tag: string) => {
    if (!selected) return;
    const tags = selected.tags.includes(tag)
      ? selected.tags.filter(t => t !== tag)
      : [...selected.tags, tag];
    update(selected.id, { tags });
  }, [selected, update]);

  const exportText = useCallback(() => {
    if (!selected) return;
    const text = `${selected.title}\n${'='.repeat(selected.title.length)}\nTags: ${selected.tags.join(', ') || 'none'}\n\n${selected.body}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selected]);

  const filteredNotes = filterTag ? notes.filter(n => n.tags.includes(filterTag)) : notes;

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
        className="w-full max-w-3xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ height: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Production Notes</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Session notepad â€persisted locally</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportText} className="text-[9px] text-slate-600 hover:text-slate-400 border border-white/[0.06] px-2 py-1 rounded-lg hover:border-white/10 transition-all">
              â†Export
            </button>
            <button onClick={addNote} className="text-[9px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded-lg hover:border-cyan-500/40 transition-all">
              + New note
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar â€note list */}
          <div className="w-48 border-r border-white/[0.06] flex flex-col overflow-hidden">
            {/* Tag filter */}
            <div className="p-2 border-b border-white/[0.04] flex flex-wrap gap-1">
              <button
                onClick={() => setFilterTag(null)}
                className={`text-[7px] px-1.5 py-0.5 rounded border transition-all ${filterTag === null ? 'bg-white/10 text-white border-white/20' : 'text-slate-600 border-white/[0.04] hover:text-slate-400'}`}
              >
                All
              </button>
              {ALL_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`text-[7px] px-1.5 py-0.5 rounded border transition-all ${
                    filterTag === tag
                      ? 'border-opacity-40 text-white'
                      : 'text-slate-700 border-white/[0.04] hover:text-slate-400'
                  }`}
                  style={filterTag === tag ? { borderColor: TAG_COLORS[tag] + '60', background: TAG_COLORS[tag] + '20', color: TAG_COLORS[tag] } : {}}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Note list */}
            <div className="flex-1 overflow-y-auto">
              {filteredNotes.length === 0 && (
                <p className="text-[9px] text-slate-600 text-center p-4">No notes</p>
              )}
              {filteredNotes.map(note => (
                <button
                  key={note.id}
                  onClick={() => setSelectedId(note.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors ${
                    selectedId === note.id ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <p className="text-[9px] font-semibold text-slate-200 truncate">{note.title || 'Untitled'}</p>
                  <p className="text-[7px] text-slate-600 truncate mt-0.5">{note.body.slice(0, 40) || 'Empty'}</p>
                  <p className="text-[7px] text-slate-700 mt-0.5">{timeAgo(note.updatedAt)}</p>
                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {note.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[6px] px-1 rounded" style={{ background: TAG_COLORS[t] + '25', color: TAG_COLORS[t] }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main editor */}
          {selected ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Note title */}
              <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-2">
                <input
                  value={selected.title}
                  onChange={e => update(selected.id, { title: e.target.value })}
                  className="flex-1 bg-transparent text-[12px] font-bold text-white outline-none placeholder:text-slate-700"
                  placeholder="Note titleâ€¦"
                />
                <button
                  onClick={() => deleteNote(selected.id)}
                  className="text-[8px] text-slate-700 hover:text-red-400 transition-colors px-1"
                >
                  Delete
                </button>
              </div>

              {/* Tags */}
              <div className="px-4 py-1.5 border-b border-white/[0.04] flex flex-wrap gap-1">
                {ALL_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-[7px] px-1.5 py-0.5 rounded border transition-all ${
                      selected.tags.includes(tag)
                        ? ''
                        : 'text-slate-700 border-white/[0.04] hover:text-slate-500'
                    }`}
                    style={selected.tags.includes(tag) ? {
                      borderColor: TAG_COLORS[tag] + '50',
                      background: TAG_COLORS[tag] + '20',
                      color: TAG_COLORS[tag],
                    } : {}}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Snippets */}
              <div className="px-4 py-1.5 border-b border-white/[0.04] flex gap-1 flex-wrap">
                {SNIPPETS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => insertSnippet(s.text)}
                    className="text-[7px] text-slate-600 hover:text-slate-400 border border-white/[0.04] hover:border-white/[0.08] px-1.5 py-0.5 rounded transition-all"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={selected.body}
                onChange={e => update(selected.id, { body: e.target.value })}
                className="flex-1 bg-transparent text-[11px] text-slate-300 outline-none resize-none p-4 font-mono leading-relaxed placeholder:text-slate-700"
                placeholder="Start typing your session notesâ€¦&#10;&#10;Use the snippets above to quickly insert references, loop markers, to-dos, and plugin settings."
                spellCheck={false}
              />

              {/* Footer */}
              <div className="px-4 py-2 border-t border-white/[0.04] flex justify-between text-[7px] text-slate-700">
                <span>{selected.body.length} chars</span>
                <span>Last saved {timeAgo(selected.updatedAt)}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <button onClick={addNote} className="text-[10px] text-slate-600 hover:text-slate-400">
                + Create first note
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
