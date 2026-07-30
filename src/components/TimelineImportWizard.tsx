import React, { useEffect, useMemo, useState } from 'react';
import type { ReplayState } from '../services/deterministicReplayService';
import type {
  TimelineImportMode,
  TimelineImportSummary,
  TimelineTrackMapping,
  TimelineTrackMappingSuggestion,
} from '../services/timelineImportMergeService';
import {
  buildTimelineTrackMappingSuggestions,
  readTimelineTempoMetadata,
  summarizeTimelineState,
} from '../services/timelineImportMergeService';
import {
  buildTimelineReconformPlan,
  type TimelineReconformStrategy,
} from '../services/timelineReconformService';

export interface TimelineImportWizardOptions {
  mode: TimelineImportMode;
  trackNamePrefix: string;
  importMarkers: boolean;
  importGroups: boolean;
  importCompLanes: boolean;
  importTempo: boolean;
  conformToCurrentTempo: boolean;
  importAutomation: boolean;
  mergeAutomationIntoExisting: boolean;
  reconformStrategy: TimelineReconformStrategy;
  anchorMarkerId: string | null;
  manualOffsetSeconds: number | null;
  trackMappings: TimelineTrackMapping[];
}

interface TimelineImportWizardProps {
  isOpen: boolean;
  fileName: string;
  importedState: ReplayState | null;
  currentState: ReplayState;
  compareState: ReplayState | null;
  onClose: () => void;
  onConfirm: (options: TimelineImportWizardOptions) => void;
}

function SummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: TimelineImportSummary;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-300">
        <span>Tracks {summary.tracks}</span>
        <span>Regions {summary.regions}</span>
        <span>Markers {summary.markers}</span>
        <span>Groups {summary.groups}</span>
        <span>Comp {summary.compLanes}</span>
        <span>Auto {summary.automation}</span>
      </div>
    </div>
  );
}

function TimelineImportWizardComponent({
  isOpen,
  fileName,
  importedState,
  currentState,
  compareState,
  onClose,
  onConfirm,
}: TimelineImportWizardProps) {
  const [mode, setMode] = useState<TimelineImportMode>('merge');
  const [trackNamePrefix, setTrackNamePrefix] = useState('Imported');
  const [importMarkers, setImportMarkers] = useState(true);
  const [importGroups, setImportGroups] = useState(true);
  const [importCompLanes, setImportCompLanes] = useState(true);
  const [importTempo, setImportTempo] = useState(true);
  const [conformToCurrentTempo, setConformToCurrentTempo] = useState(true);
  const [importAutomation, setImportAutomation] = useState(true);
  const [mergeAutomationIntoExisting, setMergeAutomationIntoExisting] = useState(true);
  const [reconformStrategy, setReconformStrategy] = useState<TimelineReconformStrategy>('current-end');
  const [anchorMarkerId, setAnchorMarkerId] = useState<string | null>(null);
  const [manualOffsetSeconds, setManualOffsetSeconds] = useState<number | null>(0);
  const [trackMappingLookup, setTrackMappingLookup] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    setMode('merge');
    setTrackNamePrefix('Imported');
    setImportMarkers(true);
    setImportGroups(true);
    setImportCompLanes(true);
    setImportTempo(true);
    setConformToCurrentTempo(true);
    setImportAutomation(true);
    setMergeAutomationIntoExisting(true);
    const sharedPreview = buildTimelineReconformPlan({
      currentState,
      importedState: importedState || currentState,
      compareState,
      options: {
        strategy: 'shared-marker',
        anchorMarkerId: currentState.markers?.[0]?.id || null,
        manualOffsetSeconds: 0,
        importTempo: true,
        conformToCurrentTempo: true,
      },
    });
    setReconformStrategy(sharedPreview.matchedMarkers.length > 0 ? 'shared-marker' : compareState ? 'compare-hotspot' : 'current-end');
    setAnchorMarkerId(currentState.markers?.[0]?.id || null);
    setManualOffsetSeconds(0);
  }, [isOpen, importedState?.sessionId]);

  const importedTempo = useMemo(() => readTimelineTempoMetadata(importedState?.metadata || null), [importedState]);
  const trackMappingSuggestions = useMemo<TimelineTrackMappingSuggestion[]>(
    () => buildTimelineTrackMappingSuggestions(currentState.tracks, importedState?.tracks || []),
    [currentState.tracks, importedState]
  );
  const reconformPlan = useMemo(
    () => (importedState
      ? buildTimelineReconformPlan({
          currentState,
          importedState,
          compareState,
          options: {
            strategy: reconformStrategy,
            anchorMarkerId,
            manualOffsetSeconds,
            importTempo,
            conformToCurrentTempo,
          },
        })
      : null),
    [anchorMarkerId, compareState, conformToCurrentTempo, currentState, importedState, importTempo, manualOffsetSeconds, reconformStrategy]
  );

  useEffect(() => {
    if (!isOpen || !importedState) return;
    const nextLookup: Record<string, string | null> = {};
    for (const suggestion of trackMappingSuggestions) {
      nextLookup[suggestion.importedTrackId] = suggestion.targetTrackId;
    }
    setTrackMappingLookup(nextLookup);
  }, [importedState, isOpen, trackMappingSuggestions]);

  if (!isOpen || !importedState) return null;

  const importedSummary = summarizeTimelineState(importedState);
  const currentSummary = summarizeTimelineState(currentState);
  const tempoSummary = importedTempo.bpm || importedTempo.timeSignature
    ? `${importedTempo.bpm ? `${importedTempo.bpm.toFixed(1)} BPM` : 'Tempo unknown'}${importedTempo.timeSignature ? ` · ${importedTempo.timeSignature}` : ''}`
    : null;
  const trackRows = trackMappingSuggestions.map((suggestion) => ({
    ...suggestion,
    targetTrackId: trackMappingLookup[suggestion.importedTrackId] ?? suggestion.targetTrackId,
  }));
  const reconformStrategyOptions = [
    { key: 'current-end', label: 'Align to current end', notes: 'Append the imported session after the current timeline.' },
    { key: 'shared-marker', label: 'Align shared markers', notes: 'Use matching cue labels to anchor the merge.' },
    { key: 'selected-marker', label: 'Align selected marker', notes: 'Anchor the import to a marker you choose.' },
    { key: 'compare-hotspot', label: 'Align compare hotspot', notes: 'Anchor on the strongest branch diff region.' },
    { key: 'manual', label: 'Manual offset', notes: 'Enter the exact offset yourself.' },
  ] as const;

  const mergeOptions = [
    {
      key: 'markers',
      value: importMarkers,
      label: 'Import Markers',
      onToggle: () => setImportMarkers((prev) => !prev),
    },
    {
      key: 'groups',
      value: importGroups,
      label: 'Import Groups',
      onToggle: () => setImportGroups((prev) => !prev),
    },
    {
      key: 'compLanes',
      value: importCompLanes,
      label: 'Import Comp Lanes',
      onToggle: () => setImportCompLanes((prev) => !prev),
    },
    {
      key: 'tempo',
      value: importTempo,
      label: 'Import Tempo',
      onToggle: () => setImportTempo((prev) => !prev),
    },
    {
      key: 'automation',
      value: importAutomation,
      label: 'Import Automation',
      onToggle: () => setImportAutomation((prev) => !prev),
    },
  ];
  const currentMarkers = [...(currentState.markers || [])].sort((left, right) => left.timeSec - right.timeSec);
  const activeReconformPlan = reconformPlan || {
    anchor: { type: 'fallback' as const, label: 'Unavailable', timeSec: 0 },
    offsetSeconds: 0,
    tempoRatio: 1,
    matchedMarkers: [],
    warnings: [],
    recommendations: [],
    currentTempoBpm: null,
    importedTempoBpm: null,
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-200/80">External Session Import</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-100">{fileName}</h3>
            <p className="mt-1 text-sm text-slate-400">
              Review the incoming session, choose merge or replace, then map how imported material is staged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-200 hover:bg-white/[0.08]"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <SummaryCard title="Current Session" summary={currentSummary} />
          <div className="space-y-3">
            <SummaryCard title="Imported Session" summary={importedSummary} />
            {tempoSummary && (
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-[11px] text-cyan-50">
                <p className="uppercase tracking-[0.18em] text-cyan-100/80">Detected Tempo</p>
                <p className="mt-1 text-sm font-semibold">{tempoSummary}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Import Mode</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(['merge', 'replace'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setMode(candidate)}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    mode === candidate
                      ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                      : 'border-white/10 bg-slate-900/70 text-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{candidate === 'merge' ? 'Merge into current timeline' : 'Replace current timeline'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {candidate === 'merge'
                      ? 'Imported material is remapped and appended without destroying the current session.'
                      : 'Current timeline is replaced with the imported session state.'}
                  </p>
                </button>
              ))}
            </div>

            {mode === 'merge' && (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-slate-500">Track Prefix</span>
                  <input
                    type="text"
                    value={trackNamePrefix}
                    onChange={(event) => setTrackNamePrefix(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    placeholder="Imported"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {mergeOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={option.onToggle}
                      className={`rounded-xl border px-3 py-3 text-left ${
                        option.value
                          ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                          : 'border-white/10 bg-slate-900/70 text-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {option.value ? 'Enabled' : 'Disabled'}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setConformToCurrentTempo((prev) => !prev)}
                    className={`rounded-xl border px-3 py-3 text-left ${
                      conformToCurrentTempo
                        ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-slate-900/70 text-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">Conform To Current Tempo</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {conformToCurrentTempo ? 'Scale imported timing into the current session tempo.' : 'Keep imported timing unchanged.'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeAutomationIntoExisting((prev) => !prev)}
                    className={`rounded-xl border px-3 py-3 text-left ${
                      mergeAutomationIntoExisting
                        ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-slate-900/70 text-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">Merge Automation Into Existing Lanes</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {mergeAutomationIntoExisting ? 'Enabled' : 'Disabled'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportAutomation((prev) => !prev)}
                    className={`rounded-xl border px-3 py-3 text-left ${
                      importAutomation
                        ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-slate-900/70 text-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold">Import Automation</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {importAutomation ? 'Enabled' : 'Disabled'}
                    </p>
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reconform Strategy</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Choose how ESL aligns the imported session before merge.
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {activeReconformPlan.matchedMarkers.length} marker match{activeReconformPlan.matchedMarkers.length === 1 ? '' : 'es'}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {reconformStrategyOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setReconformStrategy(option.key)}
                        className={`rounded-xl border px-3 py-3 text-left ${
                          reconformStrategy === option.key
                            ? 'border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-100'
                            : 'border-white/10 bg-slate-900/70 text-slate-300'
                        }`}
                      >
                        <p className="text-sm font-semibold">{option.label}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{option.notes}</p>
                      </button>
                    ))}
                  </div>
                  {reconformStrategy === 'selected-marker' && currentMarkers.length > 0 && (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-slate-500">Anchor Marker</span>
                      <select
                        value={anchorMarkerId || ''}
                        onChange={(event) => setAnchorMarkerId(event.target.value || null)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="">Select marker</option>
                        {currentMarkers.map((marker) => (
                          <option key={marker.id} value={marker.id}>
                            {marker.label} @ {marker.timeSec.toFixed(2)}s
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {reconformStrategy === 'manual' && (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-slate-500">Manual Offset Seconds</span>
                      <input
                        type="number"
                        step="0.001"
                        value={manualOffsetSeconds ?? 0}
                        onChange={(event) => setManualOffsetSeconds(Number(event.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-[11px] text-slate-300">
                      <p className="uppercase tracking-[0.18em] text-slate-500">Reconform Anchor</p>
                      <p className="mt-1 text-sm text-slate-100">{activeReconformPlan.anchor.label}</p>
                      <p className="mt-1 text-slate-400">Offset {activeReconformPlan.offsetSeconds.toFixed(3)} sec</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-[11px] text-slate-300">
                      <p className="uppercase tracking-[0.18em] text-slate-500">Tempo Ratio</p>
                      <p className="mt-1 text-sm text-slate-100">{activeReconformPlan.tempoRatio.toFixed(4)}x</p>
                      <p className="mt-1 text-slate-400">
                        {activeReconformPlan.currentTempoBpm && activeReconformPlan.importedTempoBpm
                          ? `${activeReconformPlan.importedTempoBpm.toFixed(1)} BPM -> ${activeReconformPlan.currentTempoBpm.toFixed(1)} BPM`
                          : 'Tempo data unavailable or not being conformed'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    {activeReconformPlan.matchedMarkers.length > 0 ? (
                      activeReconformPlan.matchedMarkers.slice(0, 3).map((match) => (
                        <p key={`${match.currentMarkerId}-${match.importedMarkerId}`}>
                          Match {match.label}: offset {match.offsetSeconds.toFixed(3)} sec, confidence {(match.confidence * 100).toFixed(0)}%
                        </p>
                      ))
                    ) : (
                      <p>No shared markers were found for automatic reconform.</p>
                    )}
                    {activeReconformPlan.warnings.map((warning) => (
                      <p key={warning} className="text-amber-200/80">{warning}</p>
                    ))}
                    {activeReconformPlan.recommendations.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Track Mapping</p>
                      <p className="mt-1 text-xs text-slate-400">Choose where each imported track lands. Leave it on "Create new track" to keep it separate.</p>
                    </div>
                    <p className="text-[11px] text-slate-500">{trackRows.length} imported track{trackRows.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {trackRows.map((row) => (
                      <div key={row.importedTrackId} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{row.importedTrackName}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Kind: {row.importedTrackKind} · Confidence {(row.confidence * 100).toFixed(0)}% · {row.reason}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                            {row.targetTrackId ? 'Mapped' : 'New track'}
                          </span>
                        </div>
                        <select
                          value={trackMappingLookup[row.importedTrackId] || '__new__'}
                          onChange={(event) => {
                            const value = event.target.value === '__new__' ? null : event.target.value;
                            setTrackMappingLookup((current) => ({
                              ...current,
                              [row.importedTrackId]: value,
                            }));
                          }}
                          className="mt-3 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="__new__">Create new track</option>
                          {currentState.tracks.map((track) => (
                            <option key={track.trackId} value={track.trackId}>
                              {track.trackName} ({track.kind})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Imported content is reconformed before merge so it does not collide with the current session.
                </p>
                {importTempo && tempoSummary && (
                  <p className="text-[11px] text-cyan-100/80">
                    Tempo metadata will be imported and preserved on the merged timeline.
                  </p>
                )}
                {conformToCurrentTempo && (
                  <p className="text-[11px] text-cyan-100/80">
                    Imported regions, markers, and automation will be scaled to match the current tempo before merge.
                  </p>
                )}
                {importAutomation && (
                  <p className="text-[11px] text-cyan-100/80">
                    Automation lanes will be remapped onto selected tracks and merged where matching lanes already exist.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Import Plan</p>
            <div className="mt-2 space-y-2 text-sm text-slate-300">
              <p>Session: {mode === 'merge' ? 'Merge imported content into the live timeline.' : 'Replace the current timeline state.'}</p>
              {mode === 'merge' && (
                <>
                  <p>Track prefix: <span className="font-mono text-cyan-200">{trackNamePrefix || 'Imported'}</span></p>
                  <p>Reconform: {reconformStrategy.replace('-', ' ')} at {activeReconformPlan.offsetSeconds.toFixed(3)} sec</p>
                  <p>Markers: {importMarkers ? 'Included' : 'Skipped'}</p>
                  <p>Groups: {importGroups ? 'Included' : 'Skipped'}</p>
                  <p>Comp lanes: {importCompLanes ? 'Included' : 'Skipped'}</p>
                  <p>Tempo: {importTempo && tempoSummary ? `Included (${tempoSummary})` : 'Skipped'}</p>
                  <p>Automation: {importAutomation ? 'Included' : 'Skipped'}</p>
                  <p>Automation merge: {importAutomation ? (mergeAutomationIntoExisting ? 'Existing lanes preferred' : 'Imported as separate lanes') : 'N/A'}</p>
                  <p>Track mapping: {trackRows.filter((row) => row.targetTrackId).length} mapped, {trackRows.filter((row) => !row.targetTrackId).length} new</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => onConfirm({
                mode,
                trackNamePrefix,
                importMarkers,
                importGroups,
                importCompLanes,
                importTempo,
                conformToCurrentTempo,
                importAutomation,
                mergeAutomationIntoExisting,
                trackMappings: trackRows.map((row) => ({
                  importedTrackId: row.importedTrackId,
                  targetTrackId: row.targetTrackId,
                })),
                reconformStrategy,
                anchorMarkerId,
                manualOffsetSeconds,
              })}
              className="mt-4 w-full rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-fuchsia-100 hover:bg-fuchsia-500/25"
            >
              {mode === 'merge' ? 'Stage Merge' : 'Replace Timeline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TimelineImportWizard = React.memo(TimelineImportWizardComponent);

export default TimelineImportWizard;
