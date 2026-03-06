import React, { useEffect, useMemo, useState } from 'react';

type TimelineSection = {
  id: string;
  label: string;
  start: number;
  end: number;
};

interface ProjectTimelineViewProps {
  trackKey: string;
  durationSeconds: number;
  onSeek?: (seconds: number) => void;
}

const STORAGE_PREFIX = 'echo.projectTimeline.v1:';

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildDefaultTimeline(duration: number): TimelineSection[] {
  const safeDuration = Math.max(8, duration);
  const cuts = [0, 0.12, 0.4, 0.62, 0.82, 1].map((ratio) => Number((safeDuration * ratio).toFixed(2)));
  const labels = ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Outro'];
  return labels.map((label, index) => ({
    id: `section-${index + 1}`,
    label,
    start: cuts[index],
    end: cuts[index + 1],
  }));
}

function normalizeSections(sections: TimelineSection[], durationSeconds: number): TimelineSection[] {
  if (!sections.length) return buildDefaultTimeline(durationSeconds);
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  const normalized: TimelineSection[] = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const section = sorted[i];
    const span = Math.max(2, section.end - section.start);
    const end = i === sorted.length - 1
      ? Math.max(cursor + 2, durationSeconds)
      : clamp(cursor + span, cursor + 2, durationSeconds - (sorted.length - i - 1) * 2);
    normalized.push({
      ...section,
      start: Number(cursor.toFixed(2)),
      end: Number(end.toFixed(2)),
    });
    cursor = end;
  }
  const last = normalized[normalized.length - 1];
  if (last) {
    last.end = Number(Math.max(last.start + 2, durationSeconds).toFixed(2));
  }
  return normalized;
}

export const ProjectTimelineView: React.FC<ProjectTimelineViewProps> = ({
  trackKey,
  durationSeconds,
  onSeek,
}) => {
  const storageKey = `${STORAGE_PREFIX}${trackKey || 'untitled'}`;
  const [sections, setSections] = useState<TimelineSection[]>(() => buildDefaultTimeline(durationSeconds));

  useEffect(() => {
    if (!trackKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setSections(buildDefaultTimeline(durationSeconds));
        return;
      }
      const parsed = JSON.parse(raw) as TimelineSection[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setSections(buildDefaultTimeline(durationSeconds));
        return;
      }
      setSections(normalizeSections(parsed, durationSeconds));
    } catch {
      setSections(buildDefaultTimeline(durationSeconds));
    }
  }, [storageKey, trackKey, durationSeconds]);

  useEffect(() => {
    if (!trackKey || sections.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizeSections(sections, durationSeconds)));
    } catch {
      // ignore storage failures
    }
  }, [sections, storageKey, trackKey, durationSeconds]);

  const totalMinutes = useMemo(() => (durationSeconds / 60).toFixed(2), [durationSeconds]);

  const swap = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const next = [...sections];
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;
    setSections(normalizeSections(next, durationSeconds));
  };

  const duplicate = (index: number) => {
    const target = sections[index];
    if (!target) return;
    const clone: TimelineSection = {
      ...target,
      id: `${target.id}-copy-${Date.now()}`,
      label: `${target.label} Alt`,
    };
    const next = [...sections];
    next.splice(index + 1, 0, clone);
    setSections(normalizeSections(next, durationSeconds));
  };

  const remove = (index: number) => {
    if (sections.length <= 1) return;
    const next = sections.filter((_, i) => i !== index);
    setSections(normalizeSections(next, durationSeconds));
  };

  const retime = (index: number, nextEnd: number) => {
    const safeEnd = clamp(nextEnd, sections[index].start + 2, durationSeconds);
    const next = [...sections];
    next[index] = { ...next[index], end: Number(safeEnd.toFixed(2)) };
    if (index + 1 < next.length) {
      next[index + 1] = { ...next[index + 1], start: Number(safeEnd.toFixed(2)) };
    }
    setSections(normalizeSections(next, durationSeconds));
  };

  const addSection = () => {
    const next = [...sections, {
      id: `section-${Date.now()}`,
      label: `New Section ${sections.length + 1}`,
      start: 0,
      end: 0,
    }];
    setSections(normalizeSections(next, durationSeconds));
  };

  return (
    <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Project Timeline</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">GarageBand-simple arrangement edits</h3>
          <p className="mt-1 text-xs text-slate-400">Track length: {totalMinutes} min · Tap any section to jump playback.</p>
        </div>
        <button
          type="button"
          onClick={addSection}
          className="rounded-lg border border-orange-400/35 bg-orange-500/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200 transition-colors hover:bg-orange-500/20"
        >
          Add Section
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {sections.map((section, index) => (
          <div key={section.id} className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <button
                type="button"
                onClick={() => onSeek?.(section.start)}
                className="text-left"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Section {index + 1}</p>
                <p className="text-sm font-semibold text-slate-200">{section.label}</p>
                <p className="text-xs text-slate-400">{formatTime(section.start)} {'->'} {formatTime(section.end)}</p>
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => swap(index, -1)}
                  disabled={index === 0}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => swap(index, 1)}
                  disabled={index === sections.length - 1}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 disabled:opacity-40"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => duplicate(index)}
                  className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={sections.length <= 1}
                  className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="mt-2">
              <label className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Section End</label>
              <input
                type="range"
                min={Math.floor(section.start + 2)}
                max={Math.max(Math.floor(durationSeconds), Math.floor(section.start + 3))}
                value={Math.floor(section.end)}
                onChange={(event) => retime(index, Number(event.target.value))}
                className="mt-1 w-full accent-orange-400"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectTimelineView;
