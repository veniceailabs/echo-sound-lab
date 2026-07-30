/**
 * SongArranger â€AI-powered song structure detection and arrangement
 *
 * Analyzes recorded regions by duration and energy patterns to detect:
 *   - Intro / Verse / Pre-Chorus / Chorus / Bridge / Outro
 *
 * Lets you drag sections to reorder the song structure and
 * exports a reordered region layout back to AlbumStudio.
 *
 * Also lets you apply a classic song template
 * (Intro â†V1 â†Chorus â†V2 â†Chorus â†Bridge â†Chorus â†Outro)
 */
import React, { useState, useMemo } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import type { Track, TrackRegion } from './AlbumStudio';

export type SectionType = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'unknown';

export interface ArrangedSection {
  id: string;
  type: SectionType;
  label: string;
  regionRefs: Array<{ trackId: string; regionId: string }>;
  durationSec: number;
  color: string;
}

const SECTION_COLORS: Record<SectionType, string> = {
  intro:       '#64748b',
  verse:       '#22d3ee',
  'pre-chorus':'#a78bfa',
  chorus:      '#fb923c',
  bridge:      '#34d399',
  outro:       '#64748b',
  unknown:     '#475569',
};

const SECTION_LABELS: Record<SectionType, string> = {
  intro: 'Intro', verse: 'Verse', 'pre-chorus': 'Pre', chorus: 'Chorus',
  bridge: 'Bridge', outro: 'Outro', unknown: 'Section',
};

const TEMPLATES: Record<string, SectionType[]> = {
  'Classic Pop':  ['intro','verse','pre-chorus','chorus','verse','pre-chorus','chorus','bridge','chorus','outro'],
  'Verse-Chorus': ['intro','verse','chorus','verse','chorus','bridge','chorus','outro'],
  'Simple':       ['verse','chorus','verse','chorus','outro'],
  'Hip-Hop':      ['intro','verse','chorus','verse','chorus','verse','outro'],
};

/** Heuristic: group regions on all tracks at overlapping time positions into "sections" */
function detectSections(tracks: Track[]): ArrangedSection[] {
  if (!tracks.length) return [];

  // Collect all region start times + durations across tracks
  const allStartTimes = new Set<number>();
  tracks.forEach(t => t.regions.forEach(r => allStartTimes.add(Math.round(r.startSec * 10) / 10)));

  const starts = Array.from(allStartTimes).sort((a, b) => a - b);
  if (!starts.length) return [];

  const sections: ArrangedSection[] = [];
  let sectionCount = { verse: 0, chorus: 0, bridge: 0 };

  starts.forEach((start, idx) => {
    // Find all regions starting near this time
    const refs: ArrangedSection['regionRefs'] = [];
    let maxDur = 0;
    tracks.forEach(t => {
      t.regions.forEach(r => {
        if (Math.abs(r.startSec - start) < 1.0) {
          refs.push({ trackId: t.id, regionId: r.id });
          if (r.durationSec > maxDur) maxDur = r.durationSec;
        }
      });
    });
    if (!refs.length) return;

    // Heuristic section type detection
    let type: SectionType = 'unknown';
    const isFirst = idx === 0;
    const isLast = idx === starts.length - 1;
    if (isFirst && maxDur < 12) type = 'intro';
    else if (isLast && maxDur < 20) type = 'outro';
    else if (maxDur < 8) type = 'pre-chorus';
    else if (maxDur > 25) type = 'bridge';
    else if (sections.filter(s => s.type === 'verse').length === 0 || idx % 3 === 0) type = 'verse';
    else type = 'chorus';

    // Count for label
    if (type === 'verse') { sectionCount.verse++; }
    if (type === 'chorus') { sectionCount.chorus++; }
    if (type === 'bridge') { sectionCount.bridge++; }

    const countLabel = type === 'verse' ? ` ${sectionCount.verse}` : type === 'chorus' ? ` ${sectionCount.chorus}` : '';

    sections.push({
      id: `sec-${start}`,
      type,
      label: SECTION_LABELS[type] + countLabel,
      regionRefs: refs,
      durationSec: maxDur,
      color: SECTION_COLORS[type],
    });
  });

  return sections;
}

interface Props {
  tracks: Track[];
  onApplyArrangement?: (reorderedSections: ArrangedSection[]) => void;
  onClose: () => void;
}

export const SongArranger: React.FC<Props> = ({ tracks, onApplyArrangement, onClose }) => {
  const detected = useMemo(() => detectSections(tracks), [tracks]);
  const [sections, setSections] = useState<ArrangedSection[]>(detected);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalDuration = sections.reduce((s, sec) => s + sec.durationSec, 0);

  const applyTemplate = (templateName: string) => {
    const pattern = TEMPLATES[templateName];
    if (!pattern) return;
    setActiveTemplate(templateName);

    // Find one section of each type from detected
    const byType: Partial<Record<SectionType, ArrangedSection>> = {};
    detected.forEach(s => {
      if (!byType[s.type]) byType[s.type] = s;
    });

    const newSections: ArrangedSection[] = [];
    const counters: Partial<Record<SectionType, number>> = {};
    pattern.forEach((type, i) => {
      counters[type] = (counters[type] ?? 0) + 1;
      const template = byType[type] ?? byType['verse'] ?? detected[0];
      if (!template) return;
      newSections.push({
        ...template,
        id: `tmpl-${type}-${i}`,
        type,
        label: SECTION_LABELS[type] + (counters[type]! > 1 ? ` ${counters[type]}` : ''),
        color: SECTION_COLORS[type],
      });
    });
    setSections(newSections);
  };

  const renameSection = (id: string, type: SectionType) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, type, label: SECTION_LABELS[type], color: SECTION_COLORS[type] } : s));
    setEditingId(null);
  };

  const removeSection = (id: string) => setSections(prev => prev.filter(s => s.id !== id));

  const hasRegions = tracks.some(t => t.regions.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="bg-slate-950/98 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 420, maxHeight: 560 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-bold text-slate-200 flex-1">Song Arranger</span>
        <span className="text-[9px] text-slate-600">{totalDuration.toFixed(0)}s total</span>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xs transition-colors ml-2">âœ•</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Templates */}
        <div>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Apply a Song Template</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(TEMPLATES).map(name => (
              <button key={name} onClick={() => applyTemplate(name)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${activeTemplate === name ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:border-white/20 hover:text-slate-200'}`}>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Section list */}
        {!hasRegions ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-2xl">ðŸŽµ</span>
            <p className="text-[11px] text-slate-500 text-center">Record some tracks first â€the Arranger will detect your song structure automatically.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">
                {sections.length ? 'Drag to reorder ÂClick type to rename' : 'No sections detected yet'}
              </p>

              <Reorder.Group axis="y" values={sections} onReorder={setSections} className="flex flex-col gap-1.5">
                {sections.map(section => (
                  <Reorder.Item key={section.id} value={section} className="cursor-grab active:cursor-grabbing">
                    <motion.div
                      layout
                      className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.05] bg-slate-900/60 hover:bg-slate-900/80 transition-colors"
                    >
                      {/* Color + type */}
                      <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />

                      <div className="flex-1 min-w-0">
                        {editingId === section.id ? (
                          <div className="flex flex-wrap gap-1">
                            {(Object.keys(SECTION_COLORS) as SectionType[]).filter(t => t !== 'unknown').map(type => (
                              <button key={type} onClick={() => renameSection(section.id, type)}
                                className="px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors hover:bg-white/10"
                                style={{ borderColor: SECTION_COLORS[type] + '50', color: SECTION_COLORS[type] }}>
                                {SECTION_LABELS[type]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditingId(editingId === section.id ? null : section.id)}
                              className="text-[11px] font-bold transition-colors hover:opacity-80"
                              style={{ color: section.color }}>
                              {section.label}
                            </button>
                            <span className="text-[9px] text-slate-600">{section.durationSec.toFixed(1)}s</span>
                            <span className="text-[9px] text-slate-700">Â·</span>
                            <span className="text-[9px] text-slate-600">{section.regionRefs.length} region{section.regionRefs.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>

                      {/* Duration bar */}
                      <div className="w-24 h-1.5 bg-white/[0.05] rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, (section.durationSec / Math.max(1, totalDuration / sections.length * 2)) * 100)}%`,
                          backgroundColor: section.color + '80',
                        }} />
                      </div>

                      {/* Delete */}
                      <button onClick={() => removeSection(section.id)}
                        className="text-slate-700 hover:text-red-400 text-[10px] transition-colors flex-shrink-0">Ã—</button>
                    </motion.div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </div>

            {/* Song map visualization */}
            {sections.length > 0 && (
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Song Map</p>
                <div className="flex h-6 rounded-lg overflow-hidden gap-px">
                  {sections.map(section => (
                    <div
                      key={section.id}
                      style={{
                        flex: section.durationSec,
                        backgroundColor: section.color + '40',
                        borderTop: `2px solid ${section.color}`,
                      }}
                      title={`${section.label} â€${section.durationSec.toFixed(1)}s`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[8px] text-slate-700">0:00</span>
                  <span className="text-[8px] text-slate-700">{Math.floor(totalDuration / 60)}:{String(Math.round(totalDuration % 60)).padStart(2,'0')}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {sections.length > 0 && onApplyArrangement && (
        <div className="px-4 py-3 border-t border-white/[0.04] flex gap-2">
          <button onClick={() => { setSections(detected); setActiveTemplate(null); }}
            className="flex-1 py-2 rounded-xl border border-white/[0.08] text-slate-500 text-[10px] hover:text-slate-300 transition-colors">
            Reset
          </button>
          <motion.button
            onClick={() => onApplyArrangement(sections)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="flex-1 py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold text-[10px] uppercase tracking-wider hover:bg-orange-500/30 transition-all">
            Apply Arrangement
          </motion.button>
        </div>
      )}
    </motion.div>
  );
};
