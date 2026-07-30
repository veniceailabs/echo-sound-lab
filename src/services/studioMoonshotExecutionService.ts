import type { AudioEngineSnapshot } from './audioEngine';
import type { ReplayState } from './deterministicReplayService';
import type { ServiceTemplate } from './ServiceTemplates';
import type { ProcessingConfig } from '../types';
import { deterministicId } from './deterministicJson';
import type { CreatorRoomShareManifest } from './creatorRoomService';
import type { SessionTranscriptSearchIndex } from './sessionTranscriptSearchService';
import type { SessionPlayerArrangementPlan } from './sessionPlayerArrangementService';
import {
  buildWorkspaceSandboxManifest,
  buildWorkspaceSandboxDeliveryPlan,
  type WorkspaceSandboxManifest,
  type WorkspaceSandboxDeliveryPlan,
} from './workspaceSandboxService';

export type NativePluginFormat = 'AU' | 'VST3' | 'AAX' | 'WAM';
export type ImmersiveFormat = 'ADM_BWF' | 'DOLBY_ATMOS_ADM' | 'STEREO_MASTER' | 'STEMS_ZIP';
export type StemTarget = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano' | 'strings' | 'custom';

export interface NativePluginBridgeManifest {
  manifestId: string;
  supportedFormats: NativePluginFormat[];
  scanPaths: string[];
  sandboxed: boolean;
  latencyCompensation: boolean;
  requiredNextRuntime: 'native-host' | 'wam-ready' | 'bridge-adapter';
}

export interface MultitrackRecordingPlan {
  planId: string;
  sampleRate: number;
  bitDepth: 24 | 32;
  inputTracks: Array<{ trackId: string; trackName: string; armed: boolean; monitorMode: 'off' | 'input' | 'auto' }>;
  punchInOut: { enabled: boolean; startSec: number | null; endSec: number | null };
  takeManagement: 'lanes' | 'playlist' | 'single';
  latencyBudgetMs: number;
}

export interface ImmersiveDeliverySpec {
  specId: string;
  formats: ImmersiveFormat[];
  loudnessTarget: string;
  bedLayout: '2.0' | '5.1' | '7.1.4';
  objectTracks: string[];
  validationRequired: string[];
}

export interface StemSeparationExecutionJob {
  jobId: string;
  targets: StemTarget[];
  qualityMode: 'fast' | 'balanced' | 'max';
  localFirst: boolean;
  expectedArtifacts: string[];
}

export interface ControlSurfaceExecutionMap {
  mapId: string;
  protocols: Array<'MIDI_CC' | 'MACKIE_CONTROL' | 'HUI' | 'EUCON_ADAPTER'>;
  bindings: Array<{ control: string; action: string; guarded: boolean }>;
  macroSafety: 'action-authority-required';
}

export interface InterchangeValidationReport {
  reportId: string;
  sessionId: string;
  score: number;
  pass: boolean;
  requiredExports: Array<'AAF' | 'OMF' | 'MIDI' | 'MARKERS_JSON' | 'STEMS' | 'SESSION_PACKAGE'>;
  missing: string[];
  warnings: string[];
}

export interface ContentMarketplacePack {
  packId: string;
  name: string;
  templates: string[];
  loops: string[];
  chains: string[];
  sessionPlayerGrooves: string[];
}

export interface StudioMoonshotExecutionStack {
  stackId: string;
  generatedAt: number;
  nativePluginBridge: NativePluginBridgeManifest;
  recordingPlan: MultitrackRecordingPlan;
  immersiveDelivery: ImmersiveDeliverySpec;
  stemSeparationJob: StemSeparationExecutionJob;
  controlSurfaceMap: ControlSurfaceExecutionMap;
  interchangeValidation: InterchangeValidationReport;
  contentPack: ContentMarketplacePack;
  workspaceSandbox: WorkspaceSandboxManifest;
  workspaceSandboxDelivery: WorkspaceSandboxDeliveryPlan;
  creatorRoom?: CreatorRoomShareManifest;
  transcriptIndex?: Pick<SessionTranscriptSearchIndex, 'sessionId' | 'entries' | 'speakers'>;
  sessionPlayerPlan?: Pick<SessionPlayerArrangementPlan, 'planId' | 'tracks' | 'midiNotes' | 'markers'>;
  executionOrder: string[];
}

function latencyBudget(snapshot: AudioEngineSnapshot): number {
  const base = snapshot.latency.baseLatencyMs ?? 6;
  const output = snapshot.latency.outputLatencyMs ?? 8;
  return Number(Math.max(4, base + output).toFixed(2));
}

export function buildNativePluginBridgeManifest(snapshot: AudioEngineSnapshot): NativePluginBridgeManifest {
  const supportedFormats: NativePluginFormat[] = ['WAM'];
  if (snapshot.activeFlags.localPlugins) supportedFormats.push('AU', 'VST3');
  return {
    manifestId: deterministicId('native-plugin-bridge', {
      formats: supportedFormats,
      chainSignature: snapshot.chainSignature,
    }),
    supportedFormats,
    scanPaths: [
      '/Library/Audio/Plug-Ins/Components',
      '/Library/Audio/Plug-Ins/VST3',
      '/Library/Application Support/Avid/Audio/Plug-Ins',
    ],
    sandboxed: true,
    latencyCompensation: true,
    requiredNextRuntime: supportedFormats.includes('AU') && supportedFormats.includes('VST3') ? 'native-host' : 'bridge-adapter',
  };
}

export function buildMultitrackRecordingPlan(
  timelineState: ReplayState,
  snapshot: AudioEngineSnapshot
): MultitrackRecordingPlan {
  const audioTracks = timelineState.tracks.filter((track) => track.kind === 'audio');
  return {
    planId: deterministicId('recording-plan', {
      sessionId: timelineState.sessionId,
      tracks: audioTracks.map((track) => track.trackId),
      sampleRate: snapshot.sampleRate,
    }),
    sampleRate: snapshot.sampleRate || 48000,
    bitDepth: 24,
    inputTracks: audioTracks.length > 0
      ? audioTracks.map((track) => ({
          trackId: track.trackId,
          trackName: track.trackName,
          armed: false,
          monitorMode: 'auto' as const,
        }))
      : [{ trackId: 'input-1', trackName: 'Input 1', armed: true, monitorMode: 'input' }],
    punchInOut: { enabled: false, startSec: null, endSec: null },
    takeManagement: 'lanes',
    latencyBudgetMs: latencyBudget(snapshot),
  };
}

export function buildImmersiveDeliverySpec(timelineState: ReplayState): ImmersiveDeliverySpec {
  const objectTracks = timelineState.tracks
    .filter((track) => track.kind === 'audio' || track.kind === 'bus')
    .map((track) => track.trackId);
  return {
    specId: deterministicId('immersive-delivery', {
      sessionId: timelineState.sessionId,
      objectTracks,
    }),
    formats: ['STEREO_MASTER', 'STEMS_ZIP', 'ADM_BWF', 'DOLBY_ATMOS_ADM'],
    loudnessTarget: '-18 LKFS dialogue-safe / -14 LUFS music-share-safe',
    bedLayout: objectTracks.length >= 8 ? '7.1.4' : '2.0',
    objectTracks,
    validationRequired: ['true-peak', 'loudness', 'object-track-map', 'downmix-check', 'phase-correlation'],
  };
}

export function buildStemSeparationExecutionJob(
  targets: StemTarget[] = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'],
  qualityMode: StemSeparationExecutionJob['qualityMode'] = 'max'
): StemSeparationExecutionJob {
  return {
    jobId: deterministicId('stem-job', { targets, qualityMode }),
    targets,
    qualityMode,
    localFirst: true,
    expectedArtifacts: targets.map((target) => `${target}.wav`),
  };
}

export function buildControlSurfaceExecutionMap(): ControlSurfaceExecutionMap {
  const bindings = [
    { control: 'transport.play', action: 'TOGGLE_PLAYBACK', guarded: false },
    { control: 'transport.record', action: 'ARM_AND_RECORD', guarded: true },
    { control: 'fader.1', action: 'SET_TRACK_GAIN', guarded: true },
    { control: 'encoder.1', action: 'SET_PLUGIN_PARAM', guarded: true },
    { control: 'pad.1', action: 'CAPTURE_FLASHBACK', guarded: false },
    { control: 'macro.1', action: 'RUN_APPROVED_MACRO', guarded: true },
  ];
  return {
    mapId: deterministicId('control-map', bindings),
    protocols: ['MIDI_CC', 'MACKIE_CONTROL', 'HUI', 'EUCON_ADAPTER'],
    bindings,
    macroSafety: 'action-authority-required',
  };
}

export function validateInterchangeExecution(timelineState: ReplayState): InterchangeValidationReport {
  const missing: string[] = [];
  if (timelineState.tracks.length === 0) missing.push('tracks');
  if ((timelineState.markers || []).length === 0) missing.push('markers');
  if (timelineState.regions.length === 0 && (timelineState.midiNotes || []).length === 0) missing.push('regions-or-midi');
  const warnings = [];
  if ((timelineState.automation || []).length === 0) warnings.push('No automation lanes are present.');
  const score = Math.max(0, 100 - missing.length * 22 - warnings.length * 6);
  return {
    reportId: deterministicId('interchange-validation', {
      sessionId: timelineState.sessionId,
      missing,
      warnings,
    }),
    sessionId: timelineState.sessionId,
    score,
    pass: score >= 76,
    requiredExports: ['AAF', 'OMF', 'MIDI', 'MARKERS_JSON', 'STEMS', 'SESSION_PACKAGE'],
    missing,
    warnings,
  };
}

export function buildContentMarketplacePack(serviceTemplates: ServiceTemplate[]): ContentMarketplacePack {
  const templateNames = serviceTemplates.slice(0, 12).map((template) => template.name);
  return {
    packId: deterministicId('content-pack', templateNames),
    name: 'Echo Sound Lab Creator Launch Pack',
    templates: templateNames,
    loops: ['808 pocket kit', 'clean pop guitar loop', 'rnb keys bed', 'ambient hook pad'],
    chains: ['lead vocal polish', 'drum bus punch', 'streaming master', 'podcast voice clean'],
    sessionPlayerGrooves: ['half-time trap', 'laid-back rnb', 'straight pop lift', 'cinematic bridge'],
  };
}

export function buildStudioMoonshotExecutionStack(input: {
  timelineState: ReplayState;
  engineSnapshot: AudioEngineSnapshot;
  currentConfig: ProcessingConfig;
  serviceTemplates: ServiceTemplate[];
  creatorRoom?: CreatorRoomShareManifest;
  transcriptIndex?: SessionTranscriptSearchIndex;
  sessionPlayerPlan?: SessionPlayerArrangementPlan;
}): StudioMoonshotExecutionStack {
  const nativePluginBridge = buildNativePluginBridgeManifest(input.engineSnapshot);
  const recordingPlan = buildMultitrackRecordingPlan(input.timelineState, input.engineSnapshot);
  const immersiveDelivery = buildImmersiveDeliverySpec(input.timelineState);
  const stemSeparationJob = buildStemSeparationExecutionJob();
  const controlSurfaceMap = buildControlSurfaceExecutionMap();
  const interchangeValidation = validateInterchangeExecution(input.timelineState);
  const contentPack = buildContentMarketplacePack(input.serviceTemplates);
  const workspaceSandbox = buildWorkspaceSandboxManifest({
    clientUuid: input.timelineState.workspaceId || 'workspace-main',
    jobId: input.timelineState.sessionId || 'session-main',
    renderKind: 'master',
  });
  const workspaceSandboxDelivery = buildWorkspaceSandboxDeliveryPlan(workspaceSandbox);

  return {
    stackId: deterministicId('moonshot-stack', {
      sessionId: input.timelineState.sessionId,
      chainSignature: input.engineSnapshot.chainSignature,
      currentConfig: input.currentConfig,
      creatorRoom: input.creatorRoom?.shareToken,
      transcriptEntries: input.transcriptIndex?.entries.length ?? 0,
      playerPlan: input.sessionPlayerPlan?.planId,
    }),
    generatedAt: Date.now(),
    nativePluginBridge,
    recordingPlan,
    immersiveDelivery,
    stemSeparationJob,
    controlSurfaceMap,
    interchangeValidation,
    contentPack,
    workspaceSandbox,
    workspaceSandboxDelivery,
    creatorRoom: input.creatorRoom,
    transcriptIndex: input.transcriptIndex
      ? {
          sessionId: input.transcriptIndex.sessionId,
          entries: input.transcriptIndex.entries,
          speakers: input.transcriptIndex.speakers,
        }
      : undefined,
    sessionPlayerPlan: input.sessionPlayerPlan
      ? {
          planId: input.sessionPlayerPlan.planId,
          tracks: input.sessionPlayerPlan.tracks,
          midiNotes: input.sessionPlayerPlan.midiNotes,
          markers: input.sessionPlayerPlan.markers,
        }
      : undefined,
    executionOrder: [
      'scan-native-plugins',
      'prepare-low-latency-recording',
      'index-session-transcript',
      'generate-session-players',
      'create-six-stem-job',
      'validate-interchange',
      'prepare-immersive-delivery',
      'publish-creator-room',
      'export-content-pack',
    ],
  };
}

export function serializeStudioMoonshotExecutionStack(stack: StudioMoonshotExecutionStack): string {
  return JSON.stringify(stack, null, 2);
}
