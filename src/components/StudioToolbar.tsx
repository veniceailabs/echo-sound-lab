/**
 * StudioToolbar — Grouped, collapsible tool launcher for AlbumStudio
 *
 * Six category drawers, each with an SVG icon pill.
 * No emoji, no unicode symbols — all icons are inline SVG.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── SVG icon set ──────────────────────────────────────────────────────────────

const Icons: Record<string, React.FC<{ className?: string }>> = {
  // Create — musical note (beamed eighth notes)
  create: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 3v7.268A2 2 0 1 0 7 12V5.5l5-1V11a2 2 0 1 0 1-1.732V3.5a.5.5 0 0 0-.629-.485L6.629 4.515A.5.5 0 0 0 6 5v-.5Z" />
    </svg>
  ),
  // Analyze — bar chart
  analyze: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="8" width="3" height="7" rx=".5" />
      <rect x="6" y="5" width="3" height="10" rx=".5" />
      <rect x="11" y="2" width="3" height="13" rx=".5" />
    </svg>
  ),
  // Master — lightning bolt
  master: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.5 1 3 9h5l-1.5 6L14 7H9L9.5 1Z" />
    </svg>
  ),
  // Repair — wrench
  repair: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 13.5a1 1 0 0 0 1.414 0l6.3-6.3a4 4 0 1 0-1.414-1.414l-6.3 6.3a1 1 0 0 0 0 1.414ZM11 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
    </svg>
  ),
  // Export — arrow down into tray
  export: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1v8.793l2.646-2.647a.5.5 0 1 1 .708.708l-3.5 3.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L7.5 9.793V1a.5.5 0 0 1 1 0Z" />
      <path d="M2 13a1 1 0 0 0 1 1h10a1 1 0 0 0 0-2H3a1 1 0 0 0-1 1Z" />
    </svg>
  ),
  // Session — gear / settings
  session: ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" />
      <path d="M9.796 1.343a.5.5 0 0 0-.968 0l-.33 1.182a1.5 1.5 0 0 1-1.97.948l-1.12-.52a.5.5 0 0 0-.684.685l.52 1.12a1.5 1.5 0 0 1-.948 1.97l-1.182.33a.5.5 0 0 0 0 .968l1.182.33a1.5 1.5 0 0 1 .948 1.97l-.52 1.12a.5.5 0 0 0 .685.684l1.12-.52a1.5 1.5 0 0 1 1.97.948l.33 1.182a.5.5 0 0 0 .968 0l.33-1.182a1.5 1.5 0 0 1 1.97-.948l1.12.52a.5.5 0 0 0 .684-.685l-.52-1.12a1.5 1.5 0 0 1 .948-1.97l1.182-.33a.5.5 0 0 0 0-.968l-1.182-.33a1.5 1.5 0 0 1-.948-1.97l.52-1.12a.5.5 0 0 0-.685-.684l-1.12.52a1.5 1.5 0 0 1-1.97-.948l-.33-1.182Z" />
    </svg>
  ),
  // Chevron down (for pill toggle)
  chevron: ({ className }) => (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 6,8 10,4" />
    </svg>
  ),
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolDef {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  title?: string;
}

export interface CategoryDef {
  id: string;
  label: string;
  icon: keyof typeof Icons;
  accent: string;
  tools: ToolDef[];
}

interface Props { categories: CategoryDef[] }

// ── Style maps ────────────────────────────────────────────────────────────────

const ACCENT: Record<string, { pill: string; dot: string; drawer: string }> = {
  orange:  { pill: 'text-orange-400 border-orange-500/30 bg-orange-500/10',   dot: 'bg-orange-400',  drawer: 'border-orange-500/15' },
  cyan:    { pill: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',         dot: 'bg-cyan-400',    drawer: 'border-cyan-500/15'   },
  purple:  { pill: 'text-purple-400 border-purple-500/30 bg-purple-500/10',   dot: 'bg-purple-400',  drawer: 'border-purple-500/15' },
  emerald: { pill: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',dot: 'bg-emerald-400', drawer: 'border-emerald-500/15'},
  amber:   { pill: 'text-amber-400 border-amber-500/30 bg-amber-500/10',      dot: 'bg-amber-400',   drawer: 'border-amber-500/15'  },
  rose:    { pill: 'text-rose-400 border-rose-500/30 bg-rose-500/10',         dot: 'bg-rose-400',    drawer: 'border-rose-500/15'   },
};

const TOOL_ACTIVE: Record<string, string> = {
  orange:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  cyan:    'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  purple:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  amber:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  rose:    'bg-rose-500/20 text-rose-300 border-rose-500/30',
  violet:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  blue:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  red:     'bg-red-500/20 text-red-300 border-red-500/30',
  pink:    'bg-pink-500/20 text-pink-300 border-pink-500/30',
  teal:    'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

// ── CategoryPill ──────────────────────────────────────────────────────────────

function CategoryPill({ cat, open, onToggle, key }: { cat: CategoryDef; open: boolean; onToggle: () => void; key?: React.Key }) {
  const ac = ACCENT[cat.accent] ?? ACCENT.cyan;
  const activeCount = cat.tools.filter(t => t.active).length;
  const Icon = Icons[cat.icon] ?? Icons.session;
  const Chev = Icons.chevron;

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all select-none ${
        open
          ? ac.pill
          : 'text-slate-500 border-white/[0.06] bg-white/[0.02] hover:text-slate-300 hover:border-white/10'
      }`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span>{cat.label}</span>
      {activeCount > 0 && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ac.dot}`} />
      )}
      <Chev className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${open ? '-rotate-180' : ''}`} />
    </button>
  );
}

// ── StudioToolbar ─────────────────────────────────────────────────────────────

export function StudioToolbar({ categories }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen(o => o === id ? null : id);

  return (
    <div className="border-b border-white/[0.06] bg-slate-900/60">
      {/* Pill row */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap">
        {categories.map(cat => (
          <CategoryPill key={cat.id} cat={cat} open={open === cat.id} onToggle={() => toggle(cat.id)} />
        ))}
      </div>

      {/* Sliding drawer */}
      <AnimatePresence initial={false}>
        {open && (() => {
          const cat = categories.find(c => c.id === open);
          if (!cat) return null;
          const ac = ACCENT[cat.accent] ?? ACCENT.cyan;
          return (
            <motion.div
              key={open}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeInOut' }}
              className={`overflow-hidden border-t ${ac.drawer}`}
            >
              <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                {cat.tools.map(tool => {
                  const colorKey = tool.color ?? cat.accent;
                  return (
                    <button
                      key={tool.label}
                      onClick={tool.onClick}
                      title={tool.title}
                      className={`px-2.5 py-1 rounded-lg border text-[9px] font-semibold uppercase tracking-wider transition-all ${
                        tool.active
                          ? (TOOL_ACTIVE[colorKey] ?? TOOL_ACTIVE.cyan)
                          : 'bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/10'
                      }`}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
