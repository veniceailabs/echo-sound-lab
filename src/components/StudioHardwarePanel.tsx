import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReplayState } from '../services/deterministicReplayService';
import type { BranchEntity, MergeStrategy } from '../services/timelineBranchingService';
import type { AudioEngineSnapshot, MasteringQualityMode } from '../services/audioEngine';
import { downloadText } from '../services/cueSheetExporter';
import {
  buildStudioHardwareControlProfile,
  serializeStudioHardwareControlProfileJson,
  type StudioHardwareControlProfile,
  type StudioHardwareActionId,
} from '../services/studioHardwareControlService';
import {
  clearStudioMidiControlBindings,
  importStudioMidiControlBindingsJson,
  learnStudioMidiControlBindingFromMessage,
  serializeStudioMidiControlSnapshotJson,
  serializeStudioMidiControlBindingsJson,
  setStudioMidiControlLearnTarget,
  type StudioMidiControlSnapshot,
} from '../services/studioMidiControlService';
import type { TimelineInterchangeParityReport } from '../services/timelineInterchangeParityService';
import type { VendorInterchangeBridgeRuntimeSnapshot } from '../services/vendorInterchangeBridgeRuntime';
import type { StudioParityActionPlan } from '../services/studioParityActionPlanService';

interface StudioHardwarePanelProps {
  timelineState: ReplayState;
  compareState: ReplayState | null;
  branches: BranchEntity[];
  activeBranchId: string | null;
  compareBranchId: string | null;
  engineSnapshot: AudioEngineSnapshot;
  parityReport: TimelineInterchangeParityReport;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
  parityPlan: StudioParityActionPlan;
  hasSessionPackage: boolean;
  hasTimelineInterchange: boolean;
  hasAafExport: boolean;
  hasOmfExport: boolean;
  hasMarkerExport: boolean;
  hasTimelineImportWizard: boolean;
  hasCompEditing: boolean;
  hasCompAudition: boolean;
  hasBranchReview: boolean;
  hasBranchMerge: boolean;
  hasCollaborationSurface: boolean;
  hasControlSurfaceProfile: boolean;
  masteringQualityMode: MasteringQualityMode;
  midiSnapshot: StudioMidiControlSnapshot;
  onExportSessionPackage: () => void;
  onImportSessionPackage: (file: File) => Promise<void>;
  onExportAafAdapter: () => void;
  onExportOmfAdapter: () => void;
  onExportMarkers: () => void;
  onPlay: () => Promise<void>;
  onPause: () => void;
  onStop: () => void;
  onSeekToTime: (timeSec: number) => void;
  onPrevHotspot: () => void;
  onNextHotspot: () => void;
  onExportCompareSnapshot: () => void;
  onMergeCompareIntoActive: (strategy: MergeStrategy) => void;
  onCyclePrimaryCompTake: (direction: 'prev' | 'next') => void;
  onAuditionPrimaryCompLane: () => void;
  onPromotePrimaryCompTake: () => void;
  onOpenSection: (section: 'command-center' | 'timeline' | 'collaboration' | 'post-workflow') => void;
  onMasteringQualityModeChange: (mode: MasteringQualityMode) => void;
}

const actionButtonClass = 'rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]';

const MIDI_LEARN_ACTION_IDS: StudioHardwareActionId[] = [
  'transport.play',
  'transport.pause',
  'transport.stop',
  'transport.seek.zero',
  'timeline.prev-hotspot',
  'timeline.next-hotspot',
  'timeline.export-snapshot',
  'timeline.export-markers',
  'timeline.merge-compare',
  'timeline.open',
  'workspace.command-center',
  'workspace.timeline',
  'workspace.collaboration',
  'workspace.post-workflow',
  'comp.cycle-prev',
  'comp.cycle-next',
  'comp.audition',
  'comp.promote',
  'capture.flashback',
  'capture.restore.latest',
  'interchange.export-session',
  'interchange.export-aaf',
  'interchange.export-omf',
  'interchange.import-session',
];

function downloadProfile(profile: StudioHardwareControlProfile): void {
  downloadText(
    serializeStudioHardwareControlProfileJson(profile),
    'studio-hardware-control-profile.json',
    'application/json'
  );
}

export function StudioHardwarePanel(props: StudioHardwarePanelProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const midiMapImportRef = useRef<HTMLInputElement | null>(null);
  const [learnTargetActionId, setLearnTargetActionId] = useState<StudioHardwareActionId>('transport.play');
  const [learnTargetSource, setLearnTargetSource] = useState<'note' | 'cc'>('note');
  const profile = useMemo(
    () =>
      buildStudioHardwareControlProfile({
        timelineState: props.timelineState,
        compareState: props.compareState,
        branches: props.branches,
        engineSnapshot: props.engineSnapshot,
        parityReport: props.parityReport,
        bridgeRuntime: props.bridgeRuntime,
        parityPlan: props.parityPlan,
        hasSessionPackage: props.hasSessionPackage,
        hasTimelineInterchange: props.hasTimelineInterchange,
        hasAafExport: props.hasAafExport,
        hasOmfExport: props.hasOmfExport,
        hasMarkerExport: props.hasMarkerExport,
        hasTimelineImportWizard: props.hasTimelineImportWizard,
        hasCompEditing: props.hasCompEditing,
        hasCompAudition: props.hasCompAudition,
        hasBranchReview: props.hasBranchReview,
        hasBranchMerge: props.hasBranchMerge,
        hasCollaborationSurface: props.hasCollaborationSurface,
        hasControlSurfaceProfile: props.hasControlSurfaceProfile,
      }),
    [
      props.branches,
      props.bridgeRuntime,
      props.compareState,
      props.engineSnapshot,
      props.hasAafExport,
      props.hasBranchMerge,
      props.hasBranchReview,
      props.hasCollaborationSurface,
      props.hasCompAudition,
      props.hasCompEditing,
      props.hasControlSurfaceProfile,
      props.hasMarkerExport,
      props.hasOmfExport,
      props.hasSessionPackage,
      props.hasTimelineImportWizard,
      props.hasTimelineInterchange,
      props.parityPlan,
      props.parityReport,
      props.timelineState,
    ]
  );

  const invoke = async (actionId: StudioHardwareActionId): Promise<void> => {
    switch (actionId) {
      case 'transport.play':
        await props.onPlay();
        break;
      case 'transport.pause':
        props.onPause();
        break;
      case 'transport.stop':
        props.onStop();
        break;
      case 'transport.seek.zero':
        props.onSeekToTime(0);
        break;
      case 'timeline.prev-hotspot':
        props.onPrevHotspot();
        break;
      case 'timeline.next-hotspot':
        props.onNextHotspot();
        break;
      case 'timeline.export-snapshot':
        props.onExportCompareSnapshot();
        break;
      case 'timeline.export-markers':
        props.onExportMarkers();
        break;
      case 'timeline.merge-compare':
        props.onMergeCompareIntoActive('THEIRS');
        break;
      case 'timeline.open':
        props.onOpenSection('timeline');
        break;
      case 'workspace.command-center':
        props.onOpenSection('command-center');
        break;
      case 'workspace.timeline':
        props.onOpenSection('timeline');
        break;
      case 'workspace.collaboration':
        props.onOpenSection('collaboration');
        break;
      case 'workspace.post-workflow':
        props.onOpenSection('post-workflow');
        break;
      case 'comp.cycle-prev':
        props.onCyclePrimaryCompTake('prev');
        break;
      case 'comp.cycle-next':
        props.onCyclePrimaryCompTake('next');
        break;
      case 'comp.audition':
        props.onAuditionPrimaryCompLane();
        break;
      case 'comp.promote':
        props.onPromotePrimaryCompTake();
        break;
      case 'interchange.export-session':
        props.onExportSessionPackage();
        break;
      case 'interchange.export-aaf':
        props.onExportAafAdapter();
        break;
      case 'interchange.export-omf':
        props.onExportOmfAdapter();
        break;
      case 'interchange.import-session':
        importRef.current?.click();
        break;
    }
  };

  const learnFromLastMessage = (): void => {
    setStudioMidiControlLearnTarget(learnTargetActionId, learnTargetSource);
    void learnStudioMidiControlBindingFromMessage(props.midiSnapshot.lastMessageDetails);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,15,30,0.98),rgba(7,11,24,0.92))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">Hardware Control Surface</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            A real bridge from hardware into studio actions.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This layer exposes transport, compare navigation, comping, and interchange actions through a runtime profile so a controller or SDK can bind to actual ESL behaviors.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Runtime mode</div>
          <div className="mt-1 text-lg font-semibold capitalize text-white">{profile.runtimeMode}</div>
          <div className="mt-1 text-xs text-slate-400">
            {profile.ready ? 'Ready for control binding.' : 'Waiting for more surface coverage.'}
          </div>
          <div className="mt-2 text-[11px] text-cyan-200">
            {props.midiSnapshot.plugAndPlayReady ? 'Plug and play ready.' : 'Waiting for a connected controller.'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => downloadProfile(profile)} className={actionButtonClass}>
          Export Profile
        </button>
        <button
          type="button"
          onClick={() => downloadText(serializeStudioMidiControlSnapshotJson(props.midiSnapshot), 'studio-midi-control-snapshot.json', 'application/json')}
          className={actionButtonClass}
        >
          Export MIDI Snapshot
        </button>
        <button
          type="button"
          onClick={() => downloadText(serializeStudioMidiControlBindingsJson(), 'studio-midi-control-bindings.json', 'application/json')}
          className={actionButtonClass}
        >
          Export MIDI Map
        </button>
        <button type="button" onClick={() => void invoke('transport.play')} className={actionButtonClass}>
          Play
        </button>
        <button type="button" onClick={() => void invoke('transport.pause')} className={actionButtonClass}>
          Pause
        </button>
        <button type="button" onClick={() => void invoke('transport.stop')} className={actionButtonClass}>
          Stop
        </button>
        <button type="button" onClick={() => void invoke('timeline.prev-hotspot')} className={actionButtonClass}>
          Prev Hotspot
        </button>
        <button type="button" onClick={() => void invoke('timeline.next-hotspot')} className={actionButtonClass}>
          Next Hotspot
        </button>
        <button type="button" onClick={() => void invoke('timeline.export-snapshot')} className={actionButtonClass}>
          Export Snapshot
        </button>
        <button type="button" onClick={() => void invoke('timeline.export-markers')} className={actionButtonClass}>
          Export Markers
        </button>
        <button type="button" onClick={() => void invoke('timeline.merge-compare')} className={actionButtonClass}>
          Merge Compare
        </button>
        <button type="button" onClick={() => void invoke('workspace.post-workflow')} className={actionButtonClass}>
          Open Post Workflow
        </button>
        <button type="button" onClick={() => void invoke('interchange.export-aaf')} className={actionButtonClass}>
          Export AAF
        </button>
        <button type="button" onClick={() => void invoke('interchange.export-omf')} className={actionButtonClass}>
          Export OMF
        </button>
        <button type="button" onClick={() => void invoke('interchange.import-session')} className={actionButtonClass}>
          Import Session
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">MIDI Learn</p>
            <p className="mt-1 text-sm text-slate-300">
              Map the last seen MIDI message to a studio action, then export or persist the learned map.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => learnFromLastMessage()} className={actionButtonClass}>
              Learn Last Message
            </button>
            <button
              type="button"
              onClick={() => {
                clearStudioMidiControlBindings();
              }}
              className={actionButtonClass}
            >
              Clear Learned Map
            </button>
            <button
              type="button"
              onClick={() => midiMapImportRef.current?.click()}
              className={actionButtonClass}
            >
              Import MIDI Map
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <label className="space-y-2">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Learn target action</span>
            <select
              value={learnTargetActionId}
              onChange={(event) => setLearnTargetActionId(event.target.value as StudioHardwareActionId)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            >
              {MIDI_LEARN_ACTION_IDS.map((actionId) => (
                <option key={actionId} value={actionId}>
                  {actionId}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Source type</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLearnTargetSource('note')}
                className={`${actionButtonClass} ${learnTargetSource === 'note' ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100' : ''}`}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setLearnTargetSource('cc')}
                className={`${actionButtonClass} ${learnTargetSource === 'cc' ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100' : ''}`}
              >
                CC
              </button>
            </div>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Last MIDI</p>
            <p className="mt-1 text-sm text-white">{props.midiSnapshot.lastMessage || 'None'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Learn Target</p>
            <p className="mt-1 text-sm text-white">{props.midiSnapshot.learnTarget ? `${props.midiSnapshot.learnTarget.source.toUpperCase()} -> ${props.midiSnapshot.learnTarget.actionId}` : 'Not armed'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Learned Bindings</p>
            <p className="mt-1 text-sm text-white">{props.midiSnapshot.learnedBindings.length}</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Learned Bindings</p>
          <div className="mt-2 space-y-2">
            {props.midiSnapshot.learnedBindings.length > 0 ? (
              props.midiSnapshot.learnedBindings.map((binding) => (
                <div key={`${binding.source}-${binding.number}-${binding.actionId}-${binding.deviceName || 'global'}`} className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/10 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-white">{`${binding.source.toUpperCase()} ${binding.number} -> ${binding.actionId}`}</p>
                    <p className="text-[11px] text-slate-500">{binding.notes}{binding.deviceName ? ` / ${binding.deviceName}` : ''}</p>
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200">{binding.deviceName || 'global'}</p>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-500">No learned bindings yet. Connect a controller and map one.</p>
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Last Message Details</p>
            <p className="mt-1 text-sm text-white">{props.midiSnapshot.lastMessageDetails ? `${props.midiSnapshot.lastMessageDetails.kind} ${props.midiSnapshot.lastMessageDetails.number} ch${props.midiSnapshot.lastMessageDetails.channel + 1}` : 'No parsed MIDI message yet.'}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {props.midiSnapshot.lastMessageDetails
                ? `Action: ${props.midiSnapshot.lastMessageDetails.actionId || 'unmapped'} / ${props.midiSnapshot.lastMessageDetails.bindingSource || 'none'}`
                : 'Waiting for controller input.'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Connected Inputs</p>
            <p className="mt-1 text-sm text-white">{props.midiSnapshot.activeInputs}</p>
            <p className="mt-1 text-[11px] text-slate-500">{props.midiSnapshot.connectedInputs.join(', ') || 'No inputs connected.'}</p>
          </div>
        </div>
        <input
          ref={midiMapImportRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then((content) => {
              try {
                importStudioMidiControlBindingsJson(content);
              } finally {
                event.currentTarget.value = '';
              }
            });
          }}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Available Actions</p>
            <p className="text-lg font-semibold text-white">{profile.availableActions.length}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {profile.availableActions.slice(0, 12).map((entry) => (
              <div key={entry.actionId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{entry.category}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${entry.enabled ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/25 bg-rose-500/10 text-rose-200'}`}>
                    {entry.enabled ? 'ready' : 'missing'}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-white">{entry.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">{entry.notes[0]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Bindings</p>
          <div className="mt-3 space-y-2">
            {profile.bindings.map((binding) => (
              <div key={`${binding.control}-${binding.actionId}`} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <p className="text-sm font-medium text-white">{binding.control}</p>
                  <p className="text-[11px] text-slate-500">{binding.notes}</p>
                </div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200">{binding.actionId}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Notes</p>
          <div className="mt-2 space-y-2">
            {profile.notes.map((note) => (
              <p key={note} className="text-[11px] text-slate-300">{note}</p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">MIDI Inputs</p>
          <div className="mt-2 space-y-2">
            {props.midiSnapshot.connectedInputs.length > 0 ? (
              props.midiSnapshot.connectedInputs.map((name) => (
                <p key={name} className="text-[11px] text-slate-300">{name}</p>
              ))
            ) : (
              <p className="text-[11px] text-slate-500">No MIDI inputs detected.</p>
            )}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Detected Profiles</p>
          <div className="mt-2 space-y-2">
            {props.midiSnapshot.detectedProfiles.length > 0 ? (
              props.midiSnapshot.detectedProfiles.map((profileEntry) => (
                <div key={profileEntry.inputName} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{profileEntry.inputName}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${profileEntry.ready ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/25 bg-amber-500/10 text-amber-200'}`}>
                      {profileEntry.family}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {profileEntry.notes.map((note) => (
                      <p key={note} className="text-[11px] text-slate-500">{note}</p>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-500">No controller profiles detected yet.</p>
            )}
          </div>
        </div>
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void props.onImportSessionPackage(file);
            event.currentTarget.value = '';
          }
        }}
      />
    </motion.section>
  );
}

export default React.memo(StudioHardwarePanel);
