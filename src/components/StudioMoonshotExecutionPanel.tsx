import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { StudioFutureStackInput } from '../services/studioFutureStackService';
import { downloadText } from '../services/cueSheetExporter';
import { createCreatorRoom, buildCreatorRoomShareManifest } from '../services/creatorRoomService';
import { buildSessionTranscriptSearchIndex } from '../services/sessionTranscriptSearchService';
import { buildSessionPlayerArrangement } from '../services/sessionPlayerArrangementService';
import {
  buildStudioMoonshotExecutionStack,
  serializeStudioMoonshotExecutionStack,
} from '../services/studioMoonshotExecutionService';

interface StudioMoonshotExecutionPanelProps extends StudioFutureStackInput {
  sessionName?: string;
}

function sectionsFromTimeline(props: StudioMoonshotExecutionPanelProps) {
  const markers = props.timelineState.markers || [];
  if (markers.length > 0) {
    return markers.slice(0, 8).map((marker, index) => ({
      sectionId: marker.id,
      label: marker.label || `Section ${index + 1}`,
      startBar: Math.max(0, Math.round(marker.timeSec / 8)),
      bars: 4,
      energy: index === 0 ? 0.55 : 0.75,
      chord: index % 2 === 0 ? 'C' : 'F',
    }));
  }
  return [
    { sectionId: 'intro', label: 'Intro', startBar: 0, bars: 4, energy: 0.45, chord: 'C' },
    { sectionId: 'hook', label: 'Hook', startBar: 4, bars: 8, energy: 0.9, chord: 'F' },
  ];
}

export function StudioMoonshotExecutionPanel(props: StudioMoonshotExecutionPanelProps) {
  const transcriptIndex = useMemo(
    () => buildSessionTranscriptSearchIndex(props.timelineState),
    [props.timelineState]
  );
  const sessionPlayerPlan = useMemo(
    () =>
      buildSessionPlayerArrangement({
        sessionId: props.timelineState.sessionId,
        bpm: 96,
        key: 'C',
        sections: sectionsFromTimeline(props),
        players: [
          { role: 'drums', enabled: true, feel: 'laid-back', complexity: 0.7 },
          { role: 'bass', enabled: true, feel: 'straight', complexity: 0.55, octave: -1 },
          { role: 'keys', enabled: true, feel: 'pushed', complexity: 0.58 },
          { role: 'pad', enabled: true, feel: 'straight', complexity: 0.25 },
        ],
      }),
    [props]
  );
  const creatorRoom = useMemo(() => {
    const room = createCreatorRoom({
      name: props.sessionName || 'Echo Sound Lab Session',
      owner: { userId: 'current-user', displayName: 'Current User', role: 'owner' },
      timelineState: props.timelineState,
      processingConfig: props.currentConfig,
      visibility: 'unlisted',
      tags: ['echo-sound-lab', 'moonshot'],
    });
    return buildCreatorRoomShareManifest(room, { allowForks: true });
  }, [props.currentConfig, props.sessionName, props.timelineState]);
  const stack = useMemo(
    () =>
      buildStudioMoonshotExecutionStack({
        timelineState: props.timelineState,
        engineSnapshot: props.engineSnapshot,
        currentConfig: props.currentConfig,
        serviceTemplates: props.serviceTemplates,
        creatorRoom,
        transcriptIndex,
        sessionPlayerPlan,
      }),
    [creatorRoom, props.currentConfig, props.engineSnapshot, props.serviceTemplates, props.timelineState, sessionPlayerPlan, transcriptIndex]
  );

  const exportStack = () => {
    downloadText(
      serializeStudioMoonshotExecutionStack(stack),
      'studio-moonshot-execution-stack.json',
      'application/json'
    );
  };

  const laneCards = [
    ['Plugin Bridge', stack.nativePluginBridge.supportedFormats.join(' / ')],
    ['Recording', `${stack.recordingPlan.inputTracks.length} inputs @ ${stack.recordingPlan.sampleRate}Hz`],
    ['Session Players', `${stack.sessionPlayerPlan?.midiNotes.length || 0} MIDI notes`],
    ['Transcript Search', `${stack.transcriptIndex?.entries.length || 0} index entries`],
    ['Stem Engine', stack.stemSeparationJob.targets.join(', ')],
    ['Immersive/Post', stack.immersiveDelivery.formats.join(', ')],
    ['Control Surface', `${stack.controlSurfaceMap.bindings.length} guarded bindings`],
    ['Interchange', `${stack.interchangeValidation.score}% validation`],
    ['Creator Room', stack.creatorRoom?.allowForks ? 'forks enabled' : 'private review'],
    ['Content Pack', `${stack.contentPack.templates.length} templates`],
    ['Sandbox Root', stack.workspaceSandbox.workspaceRoot],
    ['Vault Target', stack.workspaceSandboxDelivery.vaultArchivePath],
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(6,23,30,0.96),rgba(2,6,23,0.92))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/80">Moonshot Execution</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            One stack for recording, editing, creation, mixing, mastering, sharing, and delivery.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            ESL now builds executable artifacts for the core studio lanes instead of presenting a comparison checklist.
          </p>
        </div>
        <button
          type="button"
          onClick={exportStack}
          className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
        >
          Export Execution Stack
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {laneCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Execution Order</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {stack.executionOrder.map((item, index) => (
            <p key={item} className="text-[11px] text-slate-300">
              {index + 1}. {item.replace(/-/g, ' ')}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Workspace Sandbox</p>
        <div className="mt-3 grid gap-2 text-[11px] text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
          <p className="break-all"><span className="text-slate-500">Client:</span> {stack.workspaceSandbox.clientUuid}</p>
          <p className="break-all"><span className="text-slate-500">Job:</span> {stack.workspaceSandbox.jobId}</p>
          <p className="break-all"><span className="text-slate-500">Render:</span> {stack.workspaceSandbox.renderPath}</p>
          <p className="break-all"><span className="text-slate-500">Deliver:</span> {stack.workspaceSandbox.deliverPath}</p>
        </div>
        <ul className="mt-3 grid gap-2 text-[11px] text-slate-400">
          {stack.workspaceSandbox.cleanupActions.map((action) => (
            <li key={action} className="rounded border border-white/5 bg-black/20 px-3 py-2">
              {action}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Delivery Vault</p>
        <div className="mt-3 grid gap-2 text-[11px] text-slate-300 sm:grid-cols-2 xl:grid-cols-3">
          <p className="break-all"><span className="text-slate-500">Vault:</span> {stack.workspaceSandboxDelivery.vaultRoot}</p>
          <p className="break-all"><span className="text-slate-500">Archive:</span> {stack.workspaceSandboxDelivery.vaultArchivePath}</p>
        </div>
        <ul className="mt-3 grid gap-2 text-[11px] text-slate-400">
          {stack.workspaceSandboxDelivery.cleanupActions.map((action) => (
            <li key={action} className="rounded border border-white/5 bg-black/20 px-3 py-2">
              {action}
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}

export default React.memo(StudioMoonshotExecutionPanel);
