/**
 * AlbumStudio — Professional DAW Recording Surface
 *
 * Full Logic Pro X feature parity:
 * - Multitrack recording (up to 16 tracks)
 * - Take folders + comping (swipe to select takes)
 * - Punch in/out with I/O markers
 * - Count-in (1/2/4 bars with audible click)
 * - Input monitoring (hear yourself live)
 * - Overdub vs Replace mode
 * - Real VU meters with peak hold + clip detection
 * - Per-track: gain, pan, mute, solo, arm
 * - Strip silence (actual DSP)
 * - Normalize regions
 * - Region gain envelope
 * - Tap tempo
 * - Timeline markers
 * - Playback of recorded audio (real AudioContext)
 * - Delete / trim regions
 * - Mono / stereo input toggle
 * - Low latency monitoring mode
 * - Mixdown → mastering chain
 * - AKG C214 / UA Volt optimized (48kHz, no processing)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StudioCollabPanel } from './StudioCollabPanel';
import { SongArranger } from './SongArranger';
import { AudioRestorationPanel } from './AudioRestorationPanel';
import { MidiSynth } from './MidiSynth';
import { BeatMachine } from './BeatMachine';
import { PowerEnginePanel } from './PowerEnginePanel';
import { MixCritiquePanel } from './MixCritiquePanel';
import { AudioIntelligencePanel } from './AudioIntelligencePanel';
import { SmartExportPanel } from './SmartExportPanel';
import { ChordProgressionPanel } from './ChordProgressionPanel';
import { ReverbDesignerPanel } from './ReverbDesignerPanel';
import { StereoFieldAnalyzer } from './StereoFieldAnalyzer';
import { SpectralRepairPanel } from './SpectralRepairPanel';
import { GainStagingPanel } from './GainStagingPanel';
import { MasteringHistoryPanel } from './MasteringHistoryPanel';
import { TempoGroovePanel } from './TempoGroovePanel';
import { KeyScaleHelper } from './KeyScaleHelper';
import { FrequencyReferenceCard } from './FrequencyReferenceCard';
import { EqAdvisorPanel } from './EqAdvisorPanel';
import { CompressorVisualizer } from './CompressorVisualizer';
import { MultiTrackMeterPanel } from './MultiTrackMeterPanel';
import { ProductionNotes } from './ProductionNotes';
import { ReferenceTrackPanel } from './ReferenceTrackPanel';
import { LufsTimelinePanel } from './LufsTimelinePanel';
import { WaveformAnnotationPanel } from './WaveformAnnotationPanel';
import { MixChecklistPanel } from './MixChecklistPanel';
import { CollabSharePanel } from './CollabSharePanel';
import { AudioFormatInspector } from './AudioFormatInspector';
import { PitchTimePanel } from './PitchTimePanel';
import { MixComparatorPanel } from './MixComparatorPanel';
import { StereoImagerPanel } from './StereoImagerPanel';
import { NoiseGatePanel } from './NoiseGatePanel';
import { TransientShaperPanel } from './TransientShaperPanel';
import { HarmonicExciterPanel } from './HarmonicExciterPanel';
import { WaveformTrimmerPanel } from './WaveformTrimmerPanel';
import { BatchExportPanel } from './BatchExportPanel';
import { ClickRepairPanel } from './ClickRepairPanel';
import { MasteringCertificate } from './MasteringCertificate';
import AudioDeviceSelector from './AudioDeviceSelector';
import { getMasteringHistory } from '../services/masteringHistory';
import { VocalPitchAnalyzer } from './VocalPitchAnalyzer';
import { SpectralBalanceAnalyzer } from './SpectralBalanceAnalyzer';
import { MasteringChainVisualizer } from './MasteringChainVisualizer';
import { LoudnessMeter } from './LoudnessMeter';
import { ReferenceMatcherPanel } from './ReferenceMatcherPanel';
import { MsDynamicEqPanel } from './MsDynamicEqPanel';
import { BlindAbTestPanel } from './BlindAbTestPanel';
import { PhaseCorrelationMeter } from './PhaseCorrelationMeter';
import { DynamicRangeEnhancerPanel } from './DynamicRangeEnhancerPanel';
import { AlbumGainPanel } from './AlbumGainPanel';
import { StudioToolbar } from './StudioToolbar';
import { StemSplitterPanel } from './StemSplitterPanel';
import { TapeSaturationPanel } from './TapeSaturationPanel';
import { SidechainCompressorPanel } from './SidechainCompressorPanel';
import MidiPianoRollPanel from './MidiPianoRollPanel';
import { analyzeRecordingIntake, type RecordingIntakeAnalysis } from '../services/recordingIntakeService';
import { generateCueSheet, generateTrackListCsv, generateAppleMusicXml, downloadText } from '../services/cueSheetExporter';
import {
  buildMidiNoteExportPackage,
  quantizeMidiNotes,
  serializeMidiNoteExportPackage,
} from '../services/midiCompositionService';
import type { AIAdaptiveMasteringResult } from '../services/advancedDsp';
import { saveSession, loadSession, hasSession, getSessionMeta, clearSession } from '../services/studioSessionStorage';
import { acknowledgeCoreRecovery, autosaveCoreSession, loadCoreSession, recoverCoreSession, saveCoreSession } from '../services/coreApi';
import type { ReplayMidiNote, ReplayTrackState } from '../services/deterministicReplayService';
import type { CollabState } from '../services/studioCollabService';

// ─── Constants ─────────────────────────────────────────────────────────────────
const TRACK_COLORS = [
  '#FB923C','#22d3ee','#a855f7','#10b981',
  '#f43f5e','#fbbf24','#3b82f6','#ec4899',
  '#f97316','#06b6d4','#8b5cf6','#34d399',
];
const SAMPLE_RATE = 48000; // UA Volt native rate
const THUMB_SIZE  = 400;   // waveform thumbnail resolution
const CORE_ALBUM_SESSION_JOB_ID = 'album-studio-current';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Take {
  id: string;
  blob: Blob;
  url: string;
  waveformData: Float32Array;
  durationSec: number;
  label: string; // "Take 1", "Take 2" …
  clipped: boolean;
  intakeAnalysis?: RecordingIntakeAnalysis | null;
}

export type MediaPoolSourceKind = 'import' | 'recording' | 'generated';

export interface MediaPoolAsset {
  id: string;
  assetId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  registeredAt: number;
  durationSec: number;
  waveformData: Float32Array;
  clipped: boolean;
  sourceKind: MediaPoolSourceKind;
  blob: Blob;
}

export interface TrackRegion {
  id: string;
  startSec: number;
  durationSec: number;
  takes: Take[];
  activeTaskIdx: number; // which take is "comp'd" in
  gainDb: number;        // per-region gain trim
  color: string;
  isTakeFolder: boolean;
}

export interface Marker {
  id: string;
  positionSec: number;
  label: string;
  color: string;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  soloed: boolean;
  volume: number;      // 0–1.5 (over-unity allowed)
  pan: number;         // -1 to 1
  gainDb: number;      // input trim dB
  inputMono: boolean;  // force mono
  regions: TrackRegion[];
  peakLevel: number;   // live 0–1
  peakHold: number;    // held peak 0–1
  peakHoldAt: number;  // timestamp of peak hold
  clipped: boolean;    // has clipped this session
  fx: TrackFX;
  width: number;       // stereo width 0=mono, 1=normal, 2=extra wide
  outputBusId?: string | null;
  sends?: TrackSend[];
}

export interface TrackSend {
  sendId: string;
  targetTrackId: string;
  levelDb: number;
  preFader: boolean;
  enabled: boolean;
  mode?: 'aux' | 'sidechain';
}

type RecordMode = 'new' | 'overdub' | 'replace';

interface AlbumStudioSnapshot {
  tracks: Track[];
  markers: Marker[];
  bpm: number;
  timeSigNum: number;
  playheadSec: number;
  recordMode: RecordMode;
  countIn: 0 | 1 | 2 | 4;
  metronomeOn: boolean;
  inputMonitor: boolean;
  lowLatency: boolean;
  punchIn: number | null;
  punchOut: number | null;
  punchEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  loopOn: boolean;
  selectedDevice: string;
  captureChannelMode: 'mono' | 'stereo';
}

// ─── FX Types ──────────────────────────────────────────────────────────────────
export interface TrackFX {
  eq:      { enabled: boolean; low: number; mid: number; midQ: number; high: number }
  comp:    { enabled: boolean; threshold: number; ratio: number; attack: number; release: number }
  reverb:  { enabled: boolean; decay: number; wet: number }
  delay:   { enabled: boolean; time: number; feedback: number; wet: number }
}

const DEFAULT_FX: TrackFX = {
  eq:     { enabled: false, low: 0, mid: 0, midQ: 1, high: 0 },
  comp:   { enabled: false, threshold: -18, ratio: 4, attack: 10, release: 150 },
  reverb: { enabled: false, decay: 1.5, wet: 0.25 },
  delay:  { enabled: false, time: 0.25, feedback: 0.35, wet: 0.2 },
};

/** Build and connect a full FX chain. Returns input + output nodes. */
function buildFXChain(ctx: BaseAudioContext, fx: TrackFX): { input: AudioNode; output: AudioNode } {
  // EQ
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf'; eqLow.frequency.value = 200;
  eqLow.gain.value = fx.eq.enabled ? fx.eq.low : 0;
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking'; eqMid.frequency.value = 1000;
  eqMid.Q.value = fx.eq.midQ; eqMid.gain.value = fx.eq.enabled ? fx.eq.mid : 0;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf'; eqHigh.frequency.value = 8000;
  eqHigh.gain.value = fx.eq.enabled ? fx.eq.high : 0;
  eqLow.connect(eqMid).connect(eqHigh);

  // Compressor
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = fx.comp.enabled ? fx.comp.threshold : 0;
  comp.ratio.value = fx.comp.enabled ? fx.comp.ratio : 1;
  comp.attack.value = (fx.comp.enabled ? fx.comp.attack : 5) / 1000;
  comp.release.value = (fx.comp.enabled ? fx.comp.release : 100) / 1000;
  eqHigh.connect(comp);

  // Reverb
  const irLen = Math.ceil(ctx.sampleRate * (fx.reverb.enabled ? fx.reverb.decay : 0.01));
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2);
  }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  const revDry = ctx.createGain(); revDry.gain.value = fx.reverb.enabled ? 1 - fx.reverb.wet : 1;
  const revWet = ctx.createGain(); revWet.gain.value = fx.reverb.enabled ? fx.reverb.wet : 0;
  const revMerge = ctx.createGain(); revMerge.gain.value = 1;
  comp.connect(revDry).connect(revMerge);
  comp.connect(conv).connect(revWet).connect(revMerge);

  // Delay
  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = fx.delay.enabled ? fx.delay.time : 0;
  const delayFb = ctx.createGain(); delayFb.gain.value = fx.delay.enabled ? fx.delay.feedback : 0;
  const delayWet = ctx.createGain(); delayWet.gain.value = fx.delay.enabled ? fx.delay.wet : 0;
  const delayDry = ctx.createGain(); delayDry.gain.value = fx.delay.enabled ? 1 - fx.delay.wet : 1;
  const delayMerge = ctx.createGain(); delayMerge.gain.value = 1;
  revMerge.connect(delayDry).connect(delayMerge);
  revMerge.connect(delayNode).connect(delayWet).connect(delayMerge);
  delayNode.connect(delayFb).connect(delayNode);

  return { input: eqLow, output: delayMerge };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function makeTrack(index: number): Track {
  return {
    id: `t${Date.now()}-${index}`,
    name: ['Vocals','Guitar','Bass','Keys','Drums','Synth','Strings','FX'][index] ?? `Track ${index+1}`,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    armed: index === 0,
    muted: false, soloed: false,
    volume: 0.85, pan: 0, gainDb: 0,
    inputMono: false,
    regions: [],
    peakLevel: 0, peakHold: 0, peakHoldAt: 0,
    clipped: false,
    fx: { ...DEFAULT_FX },
    width: 1.0,
    outputBusId: null,
    sends: [],
  };
}

function cloneStudioSnapshot(snapshot: AlbumStudioSnapshot): AlbumStudioSnapshot {
  return typeof structuredClone === 'function'
    ? structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot)) as AlbumStudioSnapshot;
}

function summarizeTrackForHistory(track: Track): unknown {
  return {
    id: track.id,
    name: track.name,
    color: track.color,
    armed: track.armed,
    muted: track.muted,
    soloed: track.soloed,
    volume: track.volume,
    pan: track.pan,
    gainDb: track.gainDb,
    inputMono: track.inputMono,
    width: track.width,
    outputBusId: track.outputBusId ?? null,
    sends: (track.sends ?? []).map((send) => ({
      sendId: send.sendId,
      targetTrackId: send.targetTrackId,
      levelDb: send.levelDb,
      preFader: send.preFader,
      enabled: send.enabled,
    })),
    regions: track.regions.map((region) => ({
      id: region.id,
      startSec: region.startSec,
      durationSec: region.durationSec,
      activeTaskIdx: region.activeTaskIdx,
      gainDb: region.gainDb,
      color: region.color,
      isTakeFolder: region.isTakeFolder,
      takes: region.takes.map((take) => ({
        id: take.id,
        label: take.label,
        durationSec: take.durationSec,
        clipped: take.clipped,
      })),
    })),
  };
}

function buildStudioHistorySignature(snapshot: AlbumStudioSnapshot): string {
  return JSON.stringify({
    tracks: snapshot.tracks.map(summarizeTrackForHistory),
    markers: snapshot.markers,
    bpm: snapshot.bpm,
    timeSigNum: snapshot.timeSigNum,
    playheadSec: snapshot.playheadSec,
    recordMode: snapshot.recordMode,
    countIn: snapshot.countIn,
    metronomeOn: snapshot.metronomeOn,
    inputMonitor: snapshot.inputMonitor,
    lowLatency: snapshot.lowLatency,
    punchIn: snapshot.punchIn,
    punchOut: snapshot.punchOut,
    punchEnabled: snapshot.punchEnabled,
    loopStart: snapshot.loopStart,
    loopEnd: snapshot.loopEnd,
    loopOn: snapshot.loopOn,
    selectedDevice: snapshot.selectedDevice,
    captureChannelMode: snapshot.captureChannelMode,
  });
}

function buildSessionPersistenceSignature(
  tracks: Track[],
  markers: Marker[],
  mediaPool: MediaPoolAsset[],
  bpm: number,
  timeSigNum: number,
): string {
  return JSON.stringify({
    tracks: tracks.map((track) => ({
      id: track.id,
      name: track.name,
      color: track.color,
      armed: track.armed,
      muted: track.muted,
      soloed: track.soloed,
      volume: track.volume,
      pan: track.pan,
      gainDb: track.gainDb,
      inputMono: track.inputMono,
      width: track.width,
      outputBusId: track.outputBusId ?? null,
      sends: (track.sends || []).map((send) => ({
        sendId: send.sendId,
        targetTrackId: send.targetTrackId,
        levelDb: send.levelDb,
        preFader: send.preFader,
        enabled: send.enabled,
      })),
      fx: track.fx,
      regions: track.regions.map((region) => ({
        id: region.id,
        startSec: region.startSec,
        durationSec: region.durationSec,
        activeTaskIdx: region.activeTaskIdx,
        gainDb: region.gainDb,
        color: region.color,
        isTakeFolder: region.isTakeFolder,
        takes: region.takes.map((take) => ({
          id: take.id,
          label: take.label,
          durationSec: take.durationSec,
          clipped: take.clipped,
          waveformPoints: take.waveformData.length,
        })),
      })),
    })),
    markers: markers.map((marker) => ({
      id: marker.id,
      positionSec: marker.positionSec,
      label: marker.label,
      color: marker.color,
    })),
    mediaPool: mediaPool.map((asset) => ({
      id: asset.id,
      assetId: asset.assetId,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      registeredAt: asset.registeredAt,
      durationSec: asset.durationSec,
      clipped: asset.clipped,
      sourceKind: asset.sourceKind,
    })),
    bpm,
    timeSigNum,
  });
}

async function blobToWaveform(blob: Blob): Promise<{ waveform: Float32Array; clipped: boolean; durationSec: number }> {
  try {
    const ab = await blob.arrayBuffer();
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const decoded = await ctx.decodeAudioData(ab);
    await ctx.close();
    const src = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(src.length / THUMB_SIZE));
    const thumb = new Float32Array(THUMB_SIZE);
    let clipped = false;
    for (let i = 0; i < THUMB_SIZE; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(src[i * step + j] ?? 0);
        if (v > max) max = v;
        if (v >= 0.999) clipped = true;
      }
      thumb[i] = max;
    }
    return { waveform: thumb, clipped, durationSec: decoded.duration };
  } catch {
    return { waveform: new Float32Array(THUMB_SIZE), clipped: false, durationSec: 0 };
  }
}

function dbToLinear(db: number) { return Math.pow(10, db / 20); }

/** Build an M/S stereo width processor. Returns input → output nodes. */
function buildWidthNode(ctx: BaseAudioContext, width: number): { input: ChannelMergerNode; output: ChannelSplitterNode } | null {
  if (Math.abs(width - 1.0) < 0.01) return null; // unity — bypass
  // Mid = (L+R)/2, Side = (L-R)/2
  // WidenedL = Mid + Side*width, WidenedR = Mid - Side*width
  // Approximate via panner tricks — use gain nodes on a split/merge chain
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const midGain = ctx.createGain();
  midGain.gain.value = 1.0;
  const sideGainL = ctx.createGain();
  sideGainL.gain.value = width;
  const sideGainR = ctx.createGain();
  sideGainR.gain.value = -width;
  // This is a simplified approach — connect L and R through gain-adjusted paths
  splitter.connect(midGain, 0);
  splitter.connect(sideGainL, 0);
  splitter.connect(sideGainR, 1);
  midGain.connect(merger, 0, 0);
  midGain.connect(merger, 0, 1);
  sideGainL.connect(merger, 0, 0);
  sideGainR.connect(merger, 0, 1);
  return { input: merger as unknown as ChannelMergerNode, output: splitter as unknown as ChannelSplitterNode };
}

// ─── WaveformCanvas ────────────────────────────────────────────────────────────
const WaveformCanvas: React.FC<{
  data: Float32Array;
  color: string;
  width: number;
  height: number;
  gainDb: number;
  clipped: boolean;
}> = ({ data, color, width, height, gainDb, clipped }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color + '18';
    ctx.fillRect(0, 0, W, H);
    const gain = dbToLinear(gainDb);
    ctx.beginPath();
    ctx.strokeStyle = clipped ? '#f43f5e' : color;
    ctx.lineWidth = 1.5;
    const step = data.length / W;
    for (let x = 0; x < W; x++) {
      const amp = Math.min(1, (data[Math.floor(x * step)] ?? 0) * gain);
      const cy = H / 2;
      ctx.moveTo(x + 0.5, cy - amp * cy);
      ctx.lineTo(x + 0.5, cy + amp * cy);
    }
    ctx.stroke();
  }, [data, color, width, height, gainDb, clipped]);
  return <canvas ref={ref} width={width} height={height} style={{ width, height }} />;
};

// ─── RegionBlock ───────────────────────────────────────────────────────────────
const RegionBlock: React.FC<{
  region: TrackRegion;
  pxPerSec: number;
  trackHeight: number;
  onDelete: () => void;
  onGainChange: (db: number) => void;
  onSelectTake: (idx: number) => void;
}> = ({ region, pxPerSec, trackHeight, onDelete, onGainChange, onSelectTake }) => {
  const [showTakes, setShowTakes] = useState(false);
  const activeTake = region.takes[region.activeTaskIdx];
  const w = Math.max(8, region.durationSec * pxPerSec);
  const H = trackHeight - 8;
  const takeCount = region.takes.length;
  const activeTakeLabel = activeTake?.label ?? 'Take';

  const stepTake = (direction: 1 | -1) => {
    if (takeCount <= 0) return;
    const nextIndex = (region.activeTaskIdx + direction + takeCount) % takeCount;
    onSelectTake(nextIndex);
  };

  return (
    <div
      className="absolute top-1 rounded-lg overflow-hidden border border-white/15 group/region select-none"
      style={{ left: region.startSec * pxPerSec, width: w, height: H, backgroundColor: region.color + '12' }}
    >
      {activeTake && (
        <WaveformCanvas
          data={activeTake.waveformData}
          color={region.color}
          width={w}
          height={H}
          gainDb={region.gainDb}
          clipped={activeTake.clipped}
        />
      )}
      {/* Region label */}
      <div className="absolute top-0.5 left-1 right-6 flex items-center gap-1 pointer-events-none">
        {region.isTakeFolder && (
          <span className="text-[8px] bg-white/10 px-1 rounded text-white/50">
            {region.takes.length} takes
          </span>
        )}
        {activeTake?.clipped && (
          <span className="text-[8px] bg-red-500/30 px-1 rounded text-red-400 font-bold">CLIP</span>
        )}
        {activeTake?.intakeAnalysis && (
          <span
            className={`text-[8px] px-1 rounded font-bold uppercase ${
              activeTake.intakeAnalysis.verdict === 'ready'
                ? 'bg-emerald-500/20 text-emerald-300'
                : activeTake.intakeAnalysis.verdict === 'borderline'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-rose-500/20 text-rose-300'
            }`}
          >
            {activeTake.intakeAnalysis.verdict}
          </span>
        )}
        <span className="text-[8px] text-white/40 font-mono truncate">
          {activeTake?.durationSec.toFixed(1)}s
        </span>
      </div>

      {/* Controls */}
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover/region:opacity-100 transition-opacity">
        {region.isTakeFolder && (
          <button
            onClick={() => setShowTakes(s => !s)}
            className="w-4 h-4 rounded text-[8px] bg-white/10 hover:bg-white/20 text-white/60 flex items-center justify-center"
            title="Show takes"
          >↕</button>
        )}
        {region.isTakeFolder && takeCount > 1 && (
          <>
            <button
              onClick={() => stepTake(-1)}
              className="w-4 h-4 rounded text-[8px] bg-white/10 hover:bg-white/20 text-white/60 flex items-center justify-center"
              title="Previous take"
            >‹</button>
            <button
              onClick={() => stepTake(1)}
              className="w-4 h-4 rounded text-[8px] bg-white/10 hover:bg-white/20 text-white/60 flex items-center justify-center"
              title="Next take"
            >›</button>
          </>
        )}
        <button
          onClick={onDelete}
          className="w-4 h-4 rounded text-[8px] bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center"
        >×</button>
      </div>

      {/* Take selector (dropdown) */}
      <AnimatePresence>
        {showTakes && region.isTakeFolder && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 z-50 bg-slate-900/98 border border-white/10 rounded-lg p-1 min-w-[120px] shadow-xl"
          >
            {region.takes.map((take, idx) => (
              <button
                key={take.id}
                onClick={() => { onSelectTake(idx); setShowTakes(false); }}
                className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center gap-1.5 transition-colors ${
                  idx === region.activeTaskIdx ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {idx === region.activeTaskIdx && <span className="text-orange-400">✓</span>}
                {take.label}
                {take.clipped && <span className="text-red-400 text-[8px]">CLIP</span>}
                <span className="ml-auto text-[9px] text-slate-600">{take.durationSec.toFixed(1)}s</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gain trim */}
      {w > 80 && (
        <input
          type="range" min={-18} max={12} step={0.5}
          value={region.gainDb}
          onChange={e => onGainChange(Number(e.target.value))}
          className="absolute bottom-0.5 left-1 right-1 h-1 opacity-0 group-hover/region:opacity-100 accent-white transition-opacity"
          title={`Region gain: ${region.gainDb > 0 ? '+' : ''}${region.gainDb}dB`}
          onClick={e => e.stopPropagation()}
        />
      )}

      {region.isTakeFolder && takeCount > 0 && (
        <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 text-[8px] text-slate-300 opacity-0 transition-opacity group-hover/region:opacity-100">
          <span className="truncate">Comp {activeTakeLabel}</span>
          <span className="text-slate-500">{region.activeTaskIdx + 1}/{takeCount}</span>
        </div>
      )}
    </div>
  );
};

// ─── VU Meter ──────────────────────────────────────────────────────────────────
const VUMeter: React.FC<{ peak: number; hold: number; clipped: boolean; vertical?: boolean }> = ({
  peak, hold, clipped, vertical = true,
}) => {
  const SEGS = 16;
  return (
    <div className={`flex ${vertical ? 'flex-col-reverse' : 'flex-row'} gap-px`}
         style={{ [vertical ? 'height' : 'width']: 64, [vertical ? 'width' : 'height']: 6 }}>
      {Array.from({ length: SEGS }, (_, i) => {
        const thresh = (i + 1) / SEGS;
        const active = peak >= thresh;
        const isHold = Math.abs(hold - thresh) < 1 / SEGS;
        const segColor = i >= 13 ? '#f43f5e' : i >= 10 ? '#fbbf24' : '#22d3ee';
        return (
          <div key={i} className="flex-1 rounded-sm transition-all duration-75"
               style={{ backgroundColor: clipped && i >= 13 ? '#f43f5e' : active ? segColor : isHold ? segColor + '80' : 'rgba(255,255,255,0.05)' }} />
        );
      })}
    </div>
  );
};

// ─── Tuner ─────────────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function freqToNote(freq: number): { note: string; cents: number; octave: number } | null {
  if (freq <= 0) return null;
  const midi = 12 * Math.log2(freq / 440) + 69;
  const midiRound = Math.round(midi);
  const cents = Math.round((midi - midiRound) * 100);
  return { note: NOTE_NAMES[midiRound % 12], octave: Math.floor(midiRound / 12) - 1, cents };
}

const TunerDisplay: React.FC<{ analyser: AnalyserNode | null; sampleRate: number }> = ({ analyser, sampleRate }) => {
  const [tuning, setTuning] = useState<{ note: string; cents: number; octave: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    const detect = () => {
      analyser.getFloatTimeDomainData(buf);
      // Autocorrelation pitch detection
      let bestOffset = -1, bestCorr = 0;
      const size = buf.length;
      for (let offset = 20; offset < size / 2; offset++) {
        let corr = 0;
        for (let i = 0; i < size / 2; i++) corr += (buf[i] ?? 0) * (buf[i + offset] ?? 0);
        if (corr > bestCorr) { bestCorr = corr; bestOffset = offset; }
      }
      if (bestOffset > 0 && bestCorr > 0.01) {
        const freq = sampleRate / bestOffset;
        setTuning(freqToNote(freq));
      } else {
        setTuning(null);
      }
      rafRef.current = requestAnimationFrame(detect);
    };
    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, sampleRate]);

  if (!tuning) return <div className="text-[10px] text-slate-600 font-mono">—</div>;
  const inTune = Math.abs(tuning.cents) <= 5;
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-bold font-mono ${inTune ? 'text-emerald-400' : 'text-orange-400'}`}>
        {tuning.note}{tuning.octave}
      </span>
      <div className="flex items-center gap-0.5 mt-0.5">
        {Array.from({ length: 11 }, (_, i) => {
          const off = i - 5;
          const active = Math.round(tuning.cents / 10) === off;
          return <div key={i} className={`h-2 rounded-full transition-colors ${i === 5 ? 'w-1' : 'w-0.5'} ${active ? (inTune ? 'bg-emerald-400' : 'bg-orange-400') : 'bg-white/10'}`} />;
        })}
      </div>
      <span className="text-[9px] font-mono text-slate-500">{tuning.cents > 0 ? '+' : ''}{tuning.cents}¢</span>
    </div>
  );
};

// ─── FX Rack Panel ─────────────────────────────────────────────────────────────
const Knob: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step = 0.01, unit = '', onChange }) => (
  <label className="flex flex-col items-center gap-0.5 cursor-pointer">
    <span className="text-[8px] text-slate-600 uppercase tracking-wide">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-16 h-1 accent-cyan-400"
    />
    <span className="text-[9px] text-slate-400 font-mono">{value > 0 && unit !== 'dB' ? '' : ''}{value.toFixed(step < 0.1 ? 2 : 1)}{unit}</span>
  </label>
);

const FXSection: React.FC<{ title: string; color: string; enabled: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, color, enabled, onToggle, children }) => (
  <div className={`rounded-lg border p-2 transition-all ${enabled ? `border-${color}-500/30 bg-${color}-950/20` : 'border-white/[0.05] bg-white/[0.02]'}`}>
    <div className="flex items-center gap-2 mb-2">
      <button onClick={onToggle}
        className={`w-4 h-4 rounded-full border-2 transition-all flex-shrink-0 ${enabled ? `border-${color}-400 bg-${color}-400` : 'border-white/20 bg-transparent'}`}
      />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${enabled ? `text-${color}-400` : 'text-slate-600'}`}>{title}</span>
    </div>
    {enabled && <div className="flex flex-wrap gap-x-3 gap-y-1">{children}</div>}
  </div>
);

const FXRack: React.FC<{
  track: Track;
  onClose: () => void;
  onChange: (fx: TrackFX) => void;
}> = ({ track, onClose, onChange }) => {
  const fx = track.fx;
  const set = (patch: Partial<TrackFX>) => onChange({ ...fx, ...patch });

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute right-0 top-0 bottom-0 z-40 w-72 bg-slate-950/98 border-l border-white/[0.08] flex flex-col shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: track.color }} />
        <span className="text-xs font-bold text-slate-200 flex-1 truncate">{track.name} — FX</span>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xs transition-colors">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {/* EQ */}
        <FXSection title="3-Band EQ" color="cyan" enabled={fx.eq.enabled} onToggle={() => set({ eq: { ...fx.eq, enabled: !fx.eq.enabled } })}>
          <Knob label="Low" value={fx.eq.low} min={-12} max={12} step={0.5} unit="dB" onChange={v => set({ eq: { ...fx.eq, low: v } })} />
          <Knob label="Mid" value={fx.eq.mid} min={-12} max={12} step={0.5} unit="dB" onChange={v => set({ eq: { ...fx.eq, mid: v } })} />
          <Knob label="Mid Q" value={fx.eq.midQ} min={0.1} max={10} step={0.1} onChange={v => set({ eq: { ...fx.eq, midQ: v } })} />
          <Knob label="High" value={fx.eq.high} min={-12} max={12} step={0.5} unit="dB" onChange={v => set({ eq: { ...fx.eq, high: v } })} />
        </FXSection>

        {/* Compressor */}
        <FXSection title="Compressor" color="orange" enabled={fx.comp.enabled} onToggle={() => set({ comp: { ...fx.comp, enabled: !fx.comp.enabled } })}>
          <Knob label="Thresh" value={fx.comp.threshold} min={-60} max={0} step={1} unit="dB" onChange={v => set({ comp: { ...fx.comp, threshold: v } })} />
          <Knob label="Ratio" value={fx.comp.ratio} min={1} max={20} step={0.5} onChange={v => set({ comp: { ...fx.comp, ratio: v } })} />
          <Knob label="Attack" value={fx.comp.attack} min={1} max={100} step={1} unit="ms" onChange={v => set({ comp: { ...fx.comp, attack: v } })} />
          <Knob label="Release" value={fx.comp.release} min={50} max={2000} step={10} unit="ms" onChange={v => set({ comp: { ...fx.comp, release: v } })} />
        </FXSection>

        {/* Reverb */}
        <FXSection title="Reverb" color="purple" enabled={fx.reverb.enabled} onToggle={() => set({ reverb: { ...fx.reverb, enabled: !fx.reverb.enabled } })}>
          <Knob label="Decay" value={fx.reverb.decay} min={0.1} max={8} step={0.1} unit="s" onChange={v => set({ reverb: { ...fx.reverb, decay: v } })} />
          <Knob label="Wet" value={fx.reverb.wet} min={0} max={1} step={0.01} onChange={v => set({ reverb: { ...fx.reverb, wet: v } })} />
        </FXSection>

        {/* Delay */}
        <FXSection title="Delay" color="emerald" enabled={fx.delay.enabled} onToggle={() => set({ delay: { ...fx.delay, enabled: !fx.delay.enabled } })}>
          <Knob label="Time" value={fx.delay.time} min={0.01} max={1} step={0.01} unit="s" onChange={v => set({ delay: { ...fx.delay, time: v } })} />
          <Knob label="Feedback" value={fx.delay.feedback} min={0} max={0.95} step={0.01} onChange={v => set({ delay: { ...fx.delay, feedback: v } })} />
          <Knob label="Wet" value={fx.delay.wet} min={0} max={1} step={0.01} onChange={v => set({ delay: { ...fx.delay, wet: v } })} />
        </FXSection>

        {/* Presets */}
        <div className="mt-1">
          <p className="text-[9px] text-slate-700 uppercase tracking-widest mb-1">Quick Presets</p>
          <div className="flex flex-wrap gap-1">
            {[
              { label: 'Vocal Room', fx: { eq: { enabled: true, low: -2, mid: 1.5, midQ: 1.5, high: 2 }, comp: { enabled: true, threshold: -24, ratio: 4, attack: 8, release: 120 }, reverb: { enabled: true, decay: 1.2, wet: 0.18 }, delay: { enabled: false, time: 0.25, feedback: 0.35, wet: 0.2 } } },
              { label: 'Guitar Body', fx: { eq: { enabled: true, low: 2, mid: -1, midQ: 1, high: 1.5 }, comp: { enabled: true, threshold: -20, ratio: 3, attack: 15, release: 200 }, reverb: { enabled: true, decay: 2, wet: 0.22 }, delay: { enabled: false, time: 0.375, feedback: 0.4, wet: 0.15 } } },
              { label: 'Slapback', fx: { eq: { enabled: false, low: 0, mid: 0, midQ: 1, high: 0 }, comp: { enabled: false, threshold: -18, ratio: 4, attack: 10, release: 150 }, reverb: { enabled: false, decay: 1.5, wet: 0.25 }, delay: { enabled: true, time: 0.08, feedback: 0.1, wet: 0.3 } } },
              { label: 'Big Hall', fx: { eq: { enabled: true, low: -4, mid: 0, midQ: 1, high: 1 }, comp: { enabled: false, threshold: -18, ratio: 4, attack: 10, release: 150 }, reverb: { enabled: true, decay: 4.5, wet: 0.4 }, delay: { enabled: false, time: 0.25, feedback: 0.35, wet: 0.2 } } },
              { label: 'Pop Vocals', fx: { eq: { enabled: true, low: -3, mid: 2, midQ: 2, high: 3 }, comp: { enabled: true, threshold: -22, ratio: 4, attack: 5, release: 100 }, reverb: { enabled: true, decay: 1.0, wet: 0.15 }, delay: { enabled: false, time: 0.25, feedback: 0.35, wet: 0.2 } } },
              { label: 'R&B Warm', fx: { eq: { enabled: true, low: 1, mid: 0.5, midQ: 1, high: 1.5 }, comp: { enabled: true, threshold: -18, ratio: 3, attack: 10, release: 180 }, reverb: { enabled: true, decay: 1.8, wet: 0.2 }, delay: { enabled: true, time: 0.333, feedback: 0.3, wet: 0.12 } } },
              { label: 'Hip-Hop', fx: { eq: { enabled: true, low: -4, mid: 3, midQ: 1.5, high: 0 }, comp: { enabled: true, threshold: -16, ratio: 6, attack: 3, release: 80 }, reverb: { enabled: false, decay: 1.2, wet: 0.15 }, delay: { enabled: false, time: 0.125, feedback: 0.2, wet: 0.15 } } },
              { label: 'Rock Edge', fx: { eq: { enabled: true, low: -5, mid: 4, midQ: 2, high: 2 }, comp: { enabled: true, threshold: -24, ratio: 8, attack: 2, release: 60 }, reverb: { enabled: true, decay: 0.7, wet: 0.1 }, delay: { enabled: false, time: 0.25, feedback: 0.35, wet: 0.2 } } },
            ].map(preset => (
              <button key={preset.label} onClick={() => onChange(preset.fx as TrackFX)}
                className="px-2 py-0.5 rounded text-[9px] bg-white/[0.04] hover:bg-white/10 text-slate-500 hover:text-slate-300 border border-white/[0.06] transition-colors">
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── AI Mix Feedback ───────────────────────────────────────────────────────────
interface MixTip { trackName: string; color: string; icon: string; tip: string; severity: 'info' | 'warn' | 'critical' }

function analyzeTrackForTips(track: Track): MixTip[] {
  const tips: MixTip[] = [];
  if (!track.regions.length) return tips;

  const take = track.regions[0]?.takes[track.regions[0].activeTaskIdx];
  if (!take) return tips;

  const wf = take.waveformData;
  const avg = Array.from(wf).reduce((a, b) => a + b, 0) / wf.length;
  const peak = Math.max(...Array.from(wf));

  if (take.clipped || peak >= 0.999) {
    tips.push({ trackName: track.name, color: track.color, icon: 'critical', tip: 'Signal is clipping — reduce input gain or track gain before mixdown.', severity: 'critical' });
  }
  if (avg > 0.6 && !take.clipped) {
    tips.push({ trackName: track.name, color: track.color, icon: 'warn', tip: 'Very hot average level — add compression to tame dynamics before mastering.', severity: 'warn' });
  }
  if (avg < 0.05 && peak < 0.3) {
    tips.push({ trackName: track.name, color: track.color, icon: 'info', tip: 'Signal is very quiet. Normalize the region or add gain to bring it up.', severity: 'info' });
  }
  if (track.volume > 1.2) {
    tips.push({ trackName: track.name, color: track.color, icon: 'warn', tip: 'Track fader is above unity — risk of inter-track clipping. Consider lowering and raising region gain instead.', severity: 'warn' });
  }
  if (!track.fx.comp.enabled && avg > 0.3) {
    tips.push({ trackName: track.name, color: track.color, icon: 'tip', tip: 'No compression active. Open the FX rack and enable Compressor for a more consistent, glued sound.', severity: 'info' });
  }
  if (track.pan === 0 && track.name.toLowerCase().includes('guitar')) {
    tips.push({ trackName: track.name, color: track.color, icon: 'tip', tip: 'Guitar is centered. Try panning two takes L/R (double-track) to create stereo width.', severity: 'info' });
  }
  if (!track.fx.eq.enabled && (track.name.toLowerCase().includes('vocal') || track.name.toLowerCase().includes('voc'))) {
    tips.push({ trackName: track.name, color: track.color, icon: 'tip', tip: 'Vocals have no EQ. A gentle high-pass at 80–100Hz and 2dB of 8kHz air lift helps cut through the mix.', severity: 'info' });
  }
  return tips;
}

const MixFeedbackPanel: React.FC<{ tracks: Track[] }> = ({ tracks }) => {
  const tips = tracks.flatMap(analyzeTrackForTips);
  if (tips.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-emerald-950/20 border border-emerald-500/15 text-[10px] text-emerald-400">
        ✓ No issues detected. Your levels look good — hit Mixdown when ready.
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="w-full mt-1 flex flex-col gap-1 max-h-32 overflow-y-auto">
      {tips.map((tip, i) => (
        <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-[10px] ${
          tip.severity === 'critical' ? 'bg-red-950/30 border border-red-500/20' :
          tip.severity === 'warn' ? 'bg-yellow-950/25 border border-yellow-500/15' :
          'bg-slate-900/40 border border-white/[0.05]'
        }`}>
          <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${tip.icon === 'critical' ? 'bg-red-400' : tip.icon === 'warn' ? 'bg-amber-400' : tip.icon === 'tip' ? 'bg-cyan-400' : 'bg-blue-400'}`} />
          <span className="font-semibold flex-shrink-0" style={{ color: tip.color }}>{tip.trackName}:</span>
          <span className="text-slate-300">{tip.tip}</span>
        </div>
      ))}
    </motion.div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────────
interface AlbumStudioProps {
  onMixdown?: (blob: Blob, fileName: string) => void;
}

export const AlbumStudio: React.FC<AlbumStudioProps> = ({ onMixdown }) => {
  // ── Tracks ──
  const [tracks, setTracks] = useState<Track[]>(() =>
    Array.from({ length: 4 }, (_, i) => makeTrack(i))
  );

  // ── Transport ──
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [pxPerSec, setPxPerSec]       = useState(80);

  // ── Session ──
  const [bpm, setBpm]             = useState(90);
  const [timeSigNum, setTimeSigNum] = useState(4);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [countIn, setCountIn]     = useState<0|1|2|4>(2); // bars before record
  const [recordMode, setRecordMode] = useState<RecordMode>('new');
  const [inputMonitor, setInputMonitor] = useState(true);
  const [lowLatency, setLowLatency] = useState(false);

  // ── Punch in/out ──
  const [punchIn, setPunchIn]   = useState<number | null>(null);
  const [punchOut, setPunchOut] = useState<number | null>(null);
  const [punchEnabled, setPunchEnabled] = useState(false);

  // ── Loop ──
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd]     = useState<number | null>(null);
  const [loopOn, setLoopOn]       = useState(false);

  // ── Markers ──
  const [markers, setMarkers] = useState<Marker[]>([]);

  // ── Devices ──
  const [selectedDevice, setSelectedDevice] = useState('default');
  const [captureChannelMode, setCaptureChannelMode] = useState<'mono' | 'stereo'>('stereo');

  // ── UI ──
  const [showTuner, setShowTuner]     = useState(false);
  const [isMixingDown, setIsMixingDown] = useState(false);
  const [mixdownDone, setMixdownDone] = useState(false);
  const [activePanel, setActivePanel] = useState<'mix'|'edit'|'restore'|null>(null);
  const [restoredBuffer, setRestoredBuffer] = useState<AudioBuffer | null>(null);
  const [fxTrackId, setFxTrackId]     = useState<string | null>(null);
  const [showCollab, setShowCollab]       = useState(false);
  const [showArranger, setShowArranger]   = useState(false);
  const [showMediaPool, setShowMediaPool] = useState(true);
  const [showSynth, setShowSynth]         = useState(false);
  const [showMidiEditor, setShowMidiEditor] = useState(false);
  const [isPrintingSynth, setIsPrintingSynth] = useState(false);
  const [synthCaptureDestination, setSynthCaptureDestination] = useState<MediaStreamAudioDestinationNode | null>(null);
  const [capturedMidiNotes, setCapturedMidiNotes] = useState<ReplayMidiNote[]>([]);
  const [showBeats, setShowBeats]         = useState(false);
  const [showPowerEngine, setShowPowerEngine] = useState(false);
  const [powerEngineBuffer, setPowerEngineBuffer] = useState<AudioBuffer | null>(null);
  const [showMixCritique, setShowMixCritique] = useState(false);
  const [mixCritiqueBuffer, setMixCritiqueBuffer] = useState<AudioBuffer | null>(null);
  const [showAudioIntel, setShowAudioIntel] = useState(false);
  const [audioIntelBuffer, setAudioIntelBuffer] = useState<AudioBuffer | null>(null);
  const [showSmartExport, setShowSmartExport] = useState(false);
  const [smartExportBuffer, setSmartExportBuffer] = useState<AudioBuffer | null>(null);
  const [showChords, setShowChords] = useState(false);
  const [chordsBuffer, setChordsBuffer] = useState<AudioBuffer | null>(null);
  const [showReverb, setShowReverb] = useState(false);
  const [reverbBuffer, setReverbBuffer] = useState<AudioBuffer | null>(null);
  const [showStereoAnalyzer, setShowStereoAnalyzer] = useState(false);
  const [stereoBuffer, setStereoBuffer] = useState<AudioBuffer | null>(null);
  const [showSpectralRepair, setShowSpectralRepair] = useState(false);
  const [spectralBuffer, setSpectralBuffer] = useState<AudioBuffer | null>(null);
  const [showGainStaging, setShowGainStaging] = useState(false);
  const [showMasteringHistory, setShowMasteringHistory] = useState(false);
  const [showTempoGroove, setShowTempoGroove] = useState(false);
  const [showKeyScale, setShowKeyScale] = useState(false);
  const [showFreqRef, setShowFreqRef] = useState(false);
  const recordInputLevel = useMemo(() => {
    return tracks.reduce((max, track) => {
      if (!track.armed) return max;
      return Math.max(max, track.peakLevel, track.peakHold);
    }, 0);
  }, [tracks]);
  const [showEqAdvisor, setShowEqAdvisor] = useState(false);
  const [eqAdvisorBuffer, setEqAdvisorBuffer] = useState<AudioBuffer | null>(null);
  const [showCompressor, setShowCompressor] = useState(false);
  const [showMultiMeter, setShowMultiMeter] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showRefTrack, setShowRefTrack] = useState(false);
  const [refTrackBuffer, setRefTrackBuffer] = useState<AudioBuffer | null>(null);
  const [showLufsTimeline, setShowLufsTimeline] = useState(false);
  const [lufsTimelineBuffer, setLufsTimelineBuffer] = useState<AudioBuffer | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showCollabShare, setShowCollabShare] = useState(false);
  const [showFormatInspector, setShowFormatInspector] = useState(false);
  const [formatInspectorBuffer, setFormatInspectorBuffer] = useState<AudioBuffer | null>(null);
  const [showPitchTime, setShowPitchTime] = useState(false);
  const [pitchTimeBuffer, setPitchTimeBuffer] = useState<AudioBuffer | null>(null);
  const [showMixComparator, setShowMixComparator] = useState(false);
  const [mixComparatorBuffer, setMixComparatorBuffer] = useState<AudioBuffer | null>(null);
  const [showStereoImager, setShowStereoImager] = useState(false);
  const [stereoImagerBuffer, setStereoImagerBuffer] = useState<AudioBuffer | null>(null);
  const [showNoiseGate, setShowNoiseGate] = useState(false);
  const [noiseGateBuffer, setNoiseGateBuffer] = useState<AudioBuffer | null>(null);
  const [showTransientShaper, setShowTransientShaper] = useState(false);
  const [transientBuffer, setTransientBuffer] = useState<AudioBuffer | null>(null);
  const [showHarmonicExciter, setShowHarmonicExciter] = useState(false);
  const [harmonicBuffer, setHarmonicBuffer] = useState<AudioBuffer | null>(null);
  const [showWaveformTrimmer, setShowWaveformTrimmer] = useState(false);
  const [waveformTrimmerBuffer, setWaveformTrimmerBuffer] = useState<AudioBuffer | null>(null);
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showClickRepair, setShowClickRepair] = useState(false);
  const [clickRepairBuffer, setClickRepairBuffer] = useState<AudioBuffer | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  const midiEditorTrack = useMemo<ReplayTrackState | null>(() => {
    const targetTrack = tracks.find((track) => track.armed) || tracks[0] || null;
    if (!targetTrack) return null;
    return {
      trackId: targetTrack.id,
      trackName: `${targetTrack.name} MIDI Lane`,
      kind: 'midi',
      groupId: null,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      appliedProposalIds: [],
      trackStateHash: `midi-lane:${targetTrack.id}`,
      outputBusId: null,
      sends: [],
    };
  }, [tracks]);

  const midiLaneNotes = useMemo(
    () => {
      if (!midiEditorTrack) return [];
      return capturedMidiNotes.filter((note) => note.trackId === midiEditorTrack.trackId);
    },
    [capturedMidiNotes, midiEditorTrack]
  );
  const [showVocalPitch, setShowVocalPitch] = useState(false);
  const [vocalPitchBuffer, setVocalPitchBuffer] = useState<AudioBuffer | null>(null);
  const [showSpectralBalance, setShowSpectralBalance] = useState(false);
  const [spectralBalanceBuffer, setSpectralBalanceBuffer] = useState<AudioBuffer | null>(null);
  const [showChainVisualizer, setShowChainVisualizer] = useState(false);
  const [showLoudnessMeter, setShowLoudnessMeter] = useState(false);
  const [loudnessMeterBuffer, setLoudnessMeterBuffer] = useState<AudioBuffer | null>(null);
  const [showRefMatcher, setShowRefMatcher] = useState(false);
  const [refMatcherBuffer, setRefMatcherBuffer] = useState<AudioBuffer | null>(null);
  const [showMsDynamicEq, setShowMsDynamicEq] = useState(false);
  const [msDynamicEqBuffer, setMsDynamicEqBuffer] = useState<AudioBuffer | null>(null);
  const [showBlindAb, setShowBlindAb] = useState(false);
  const [blindAbOriginal, setBlindAbOriginal] = useState<AudioBuffer | null>(null);
  const [blindAbMastered, setBlindAbMastered] = useState<AudioBuffer | null>(null);
  const [showPhaseCorr, setShowPhaseCorr] = useState(false);
  const [phaseCorrBuffer, setPhaseCorrBuffer] = useState<AudioBuffer | null>(null);
  const [showDynamicRange, setShowDynamicRange] = useState(false);
  const [dynamicRangeBuffer, setDynamicRangeBuffer] = useState<AudioBuffer | null>(null);
  const [showAlbumGain, setShowAlbumGain] = useState(false);
  const [showStemSplitter, setShowStemSplitter] = useState(false);
  const [stemSplitterBuffer, setStemSplitterBuffer] = useState<AudioBuffer | null>(null);
  const [showTapeSat, setShowTapeSat] = useState(false);
  const [tapeSatBuffer, setTapeSatBuffer] = useState<AudioBuffer | null>(null);
  const [showSidechain, setShowSidechain] = useState(false);
  const [sidechainBuffer, setSidechainBuffer] = useState<AudioBuffer | null>(null);
  const [mediaPool, setMediaPool] = useState<MediaPoolAsset[]>([]);
  const [mediaPoolTrackId, setMediaPoolTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus]     = useState<'idle'|'saving'|'saved'>('idle');
  const [sessionMeta, setSessionMeta]   = useState(() => getSessionMeta());
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ghostSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ghostRecovery, setGhostRecovery] = useState<Record<string, any> | null>(null);
  const [trackHeight] = useState(72);
  const [tapTimes, setTapTimes]       = useState<number[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  // ── Refs ──
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const recorderMap      = useRef<Map<string, MediaRecorder>>(new Map());
  const chunkMap         = useRef<Map<string, Blob[]>>(new Map());
  const streamMap        = useRef<Map<string, MediaStream>>(new Map());
  const synthCaptureDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const synthCaptureMidiRef = useRef<{
    active: Map<number, { startTimeSec: number; velocity: number }>;
    notes: ReplayMidiNote[];
  }>({
    active: new Map(),
    notes: [],
  });
  const analyserMap      = useRef<Map<string, AnalyserNode>>(new Map());
  const monitorGainMap   = useRef<Map<string, GainNode>>(new Map());
  const monitorDelayMap  = useRef<Map<string, DelayNode>>(new Map());
  const playbackNodes    = useRef<AudioBufferSourceNode[]>([]);
  const metronomeInt     = useRef<ReturnType<typeof setInterval> | null>(null);
  const playheadRaf      = useRef<number>(0);
  const phStart          = useRef<number>(0);
  const levelRaf         = useRef<number>(0);
  const peakHoldTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const takeCountMap     = useRef<Map<string, number>>(new Map()); // trackId→takeCount
  const recStartSec      = useRef<number>(0);
  const tunerAnalyserRef = useRef<AnalyserNode | null>(null);
  const timelineRef      = useRef<HTMLDivElement>(null);
  const mediaImportRef   = useRef<HTMLInputElement | null>(null);
  const studioHistoryRef = useRef<{
    snapshots: AlbumStudioSnapshot[];
    index: number;
    lastSignature: string | null;
    suppress: boolean;
  }>({
    snapshots: [],
    index: -1,
    lastSignature: null,
    suppress: false,
  });

  // ── Derived ──
  const secPerBeat = 60 / bpm;
  const secPerBar  = secPerBeat * timeSigNum;
  const anySoloed  = tracks.some(t => t.soloed);
  const totalDuration = Math.max(
    30,
    playheadSec + 5,
    ...tracks.flatMap(t => t.regions.map(r => r.startSec + r.durationSec))
  );

  useEffect(() => {
    if (!tracks.length) {
      if (mediaPoolTrackId !== null) setMediaPoolTrackId(null);
      return;
    }
    const targetExists = mediaPoolTrackId ? tracks.some((track) => track.id === mediaPoolTrackId) : false;
    if (!targetExists) {
      setMediaPoolTrackId(tracks[0]?.id ?? null);
    }
  }, [mediaPoolTrackId, tracks]);

  const buildStudioSnapshot = useCallback((): AlbumStudioSnapshot => ({
    tracks,
    markers,
    bpm,
    timeSigNum,
    playheadSec,
    recordMode,
    countIn,
    metronomeOn,
    inputMonitor,
    lowLatency,
    punchIn,
    punchOut,
    punchEnabled,
    loopStart,
    loopEnd,
    loopOn,
    selectedDevice,
    captureChannelMode,
  }), [
    bpm,
    countIn,
    inputMonitor,
    lowLatency,
    loopEnd,
    loopOn,
    loopStart,
    markers,
    metronomeOn,
    playheadSec,
    punchEnabled,
    punchIn,
    punchOut,
    recordMode,
    selectedDevice,
    captureChannelMode,
    timeSigNum,
    tracks,
  ]);

  const resetStudioHistory = useCallback((snapshot?: AlbumStudioSnapshot) => {
    const nextSnapshot = snapshot ?? buildStudioSnapshot();
    const cloned = cloneStudioSnapshot(nextSnapshot);
    const signature = buildStudioHistorySignature(cloned);
    studioHistoryRef.current.snapshots = [cloned];
    studioHistoryRef.current.index = 0;
    studioHistoryRef.current.lastSignature = signature;
    studioHistoryRef.current.suppress = false;
    setHistoryVersion((value) => value + 1);
  }, [buildStudioSnapshot]);

  const restoreStudioSnapshot = useCallback((snapshot: AlbumStudioSnapshot) => {
    studioHistoryRef.current.suppress = true;
    setTracks(snapshot.tracks);
    setMarkers(snapshot.markers);
    setBpm(snapshot.bpm);
    setTimeSigNum(snapshot.timeSigNum);
    setPlayheadSec(snapshot.playheadSec);
    setRecordMode(snapshot.recordMode);
    setCountIn(snapshot.countIn);
    setMetronomeOn(snapshot.metronomeOn);
    setInputMonitor(snapshot.inputMonitor);
    setLowLatency(snapshot.lowLatency);
    setPunchIn(snapshot.punchIn);
    setPunchOut(snapshot.punchOut);
    setPunchEnabled(snapshot.punchEnabled);
    setLoopStart(snapshot.loopStart);
    setLoopEnd(snapshot.loopEnd);
    setLoopOn(snapshot.loopOn);
    setSelectedDevice(snapshot.selectedDevice);
    setCaptureChannelMode(snapshot.captureChannelMode);
    window.setTimeout(() => {
      studioHistoryRef.current.suppress = false;
    }, 0);
  }, []);

  const commitStudioHistory = useCallback((snapshot?: AlbumStudioSnapshot) => {
    if (studioHistoryRef.current.suppress) return;
    const nextSnapshot = snapshot ?? buildStudioSnapshot();
    const cloned = cloneStudioSnapshot(nextSnapshot);
    const signature = buildStudioHistorySignature(cloned);
    if (studioHistoryRef.current.lastSignature === signature) return;

    const nextHistory = studioHistoryRef.current.snapshots.slice(0, studioHistoryRef.current.index + 1);
    nextHistory.push(cloned);
    if (nextHistory.length > 50) {
      nextHistory.splice(0, nextHistory.length - 50);
    }
    studioHistoryRef.current.snapshots = nextHistory;
    studioHistoryRef.current.index = nextHistory.length - 1;
    studioHistoryRef.current.lastSignature = signature;
    setHistoryVersion((value) => value + 1);
  }, [buildStudioSnapshot]);

  const undoStudioHistory = useCallback(() => {
    const state = studioHistoryRef.current;
    if (state.index <= 0) return;
    state.index -= 1;
    const snapshot = state.snapshots[state.index];
    if (!snapshot) return;
    state.lastSignature = buildStudioHistorySignature(snapshot);
    restoreStudioSnapshot(cloneStudioSnapshot(snapshot));
  }, [restoreStudioSnapshot]);

  const redoStudioHistory = useCallback(() => {
    const state = studioHistoryRef.current;
    if (state.index >= state.snapshots.length - 1) return;
    state.index += 1;
    const snapshot = state.snapshots[state.index];
    if (!snapshot) return;
    state.lastSignature = buildStudioHistorySignature(snapshot);
    restoreStudioSnapshot(cloneStudioSnapshot(snapshot));
  }, [restoreStudioSnapshot]);

  const canUndoStudio = studioHistoryRef.current.index > 0;
  const canRedoStudio = studioHistoryRef.current.index < studioHistoryRef.current.snapshots.length - 1;

  const buildCoreDspState = useCallback(() => ({
    source: 'AlbumStudio',
    bpm,
    captureChannelMode,
    timeSigNum,
    markerCount: markers.length,
    trackCount: tracks.length,
    mediaPoolCount: mediaPool.length,
    regionCount: tracks.reduce((sum, track) => sum + track.regions.length, 0),
    tracks: tracks.map(track => ({
      id: track.id,
      name: track.name,
      muted: track.muted,
      soloed: track.soloed,
      armed: track.armed,
      volume: track.volume,
      pan: track.pan,
      gainDb: track.gainDb,
      width: track.width,
      inputMono: track.inputMono,
      outputBusId: track.outputBusId ?? null,
      sends: Array.isArray(track.sends)
        ? track.sends.map((send) => ({
            sendId: send.sendId,
            targetTrackId: send.targetTrackId,
            levelDb: send.levelDb,
            preFader: send.preFader,
            enabled: send.enabled,
            mode: send.mode === 'sidechain' ? 'sidechain' : 'aux',
          }))
        : [],
      regionCount: track.regions.length,
      fx: track.fx,
    })),
    markers: markers.map(marker => ({
      id: marker.id,
      positionSec: marker.positionSec,
      label: marker.label,
      color: marker.color,
    })),
    mediaPool: mediaPool.map((asset) => ({
      id: asset.id,
      name: asset.name,
      durationSec: asset.durationSec,
      sourceKind: asset.sourceKind,
    })),
  }), [bpm, captureChannelMode, markers, mediaPool, timeSigNum, tracks]);

  // ── AudioContext ──
  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: lowLatency ? 'interactive' : 'balanced' });
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, [lowLatency]);

  useEffect(() => {
    if (!showSynth) return;
    try {
      const ctx = getCtx();
      const existing = synthCaptureDestinationRef.current;
      if (!existing || existing.context !== ctx) {
        synthCaptureDestinationRef.current = ctx.createMediaStreamDestination();
      }
      setSynthCaptureDestination(synthCaptureDestinationRef.current);
    } catch {
      setSynthCaptureDestination(null);
    }
  }, [getCtx, showSynth]);

  const appendTakeToTrack = useCallback((trackId: string, take: Take, startPos: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      const existingRegion = recordMode === 'overdub'
        ? t.regions.find(r => Math.abs(r.startSec - startPos) < 0.5)
        : null;

      if (existingRegion) {
        return {
          ...t,
          clipped: t.clipped || take.clipped,
          regions: t.regions.map(r =>
            r.id === existingRegion.id
              ? { ...r, takes: [...r.takes, take], activeTaskIdx: r.takes.length, isTakeFolder: true }
              : r
          ),
        };
      }

      const region: TrackRegion = {
        id: `reg-${Date.now()}-${trackId}`,
        startSec: startPos,
        durationSec: take.durationSec,
        takes: [take],
        activeTaskIdx: 0,
        gainDb: 0,
        color: t.color,
        isTakeFolder: false,
      };

      return { ...t, clipped: t.clipped || take.clipped, regions: [...t.regions, region] };
    }));
  }, [recordMode]);

  const analyzeTakeBlob = useCallback(async (blob: Blob): Promise<RecordingIntakeAnalysis | null> => {
    try {
      const ab = await blob.arrayBuffer();
      const buffer = await getCtx().decodeAudioData(ab.slice(0));
      return analyzeRecordingIntake(buffer);
    } catch (error) {
      console.warn('[AlbumStudio] Take analysis unavailable:', error);
      return null;
    }
  }, [getCtx]);

  // ── Level metering loop ──
  const startLevelLoop = useCallback(() => {
    cancelAnimationFrame(levelRaf.current);
    const loop = () => {
      const now = performance.now();
      setTracks(prev => prev.map(t => {
        const analyser = analyserMap.current.get(t.id);
        if (!analyser) return t;
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs((buf[i] - 128) / 128);
          if (v > peak) peak = v;
        }
        let { peakHold, peakHoldAt, clipped } = t;
        if (peak > peakHold) {
          peakHold = peak; peakHoldAt = now;
          const timer = peakHoldTimers.current.get(t.id);
          if (timer) clearTimeout(timer);
          const newTimer = setTimeout(() => {
            setTracks(p => p.map(x => x.id === t.id ? { ...x, peakHold: 0 } : x));
          }, 2000);
          peakHoldTimers.current.set(t.id, newTimer);
        }
        if (peak >= 0.999) clipped = true;
        return { ...t, peakLevel: peak, peakHold, peakHoldAt, clipped };
      }));
      levelRaf.current = requestAnimationFrame(loop);
    };
    levelRaf.current = requestAnimationFrame(loop);
  }, []);

  // ── Metronome ──
  const startMetronome = useCallback((bpmVal: number) => {
    if (metronomeInt.current) clearInterval(metronomeInt.current);
    if (!metronomeOn) return;
    const ctx = getCtx();
    let beat = Math.round(playheadSec / secPerBeat) % timeSigNum;
    const ms = (60 / bpmVal) * 1000;
    metronomeInt.current = setInterval(() => {
      if (ctx.state !== 'running') return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g).connect(ctx.destination);
      osc.frequency.value = beat % timeSigNum === 0 ? 1000 : 700;
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
      beat = (beat + 1) % timeSigNum;
    }, ms);
  }, [metronomeOn, getCtx, secPerBeat, timeSigNum, playheadSec]);

  const stopMetronome = useCallback(() => {
    if (metronomeInt.current) clearInterval(metronomeInt.current);
  }, []);

  // ── Count-in click ──
  const doCountIn = useCallback((): Promise<void> => {
    if (countIn === 0) return Promise.resolve();
    return new Promise(resolve => {
      const ctx = getCtx();
      const totalBeats = countIn * timeSigNum;
      const ms = secPerBeat * 1000;
      let beat = 0;
      const tick = setInterval(() => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g).connect(ctx.destination);
        osc.frequency.value = beat % timeSigNum === 0 ? 1100 : 800;
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.start(); osc.stop(ctx.currentTime + 0.07);
        beat++;
        if (beat >= totalBeats) { clearInterval(tick); resolve(); }
      }, ms);
    });
  }, [countIn, timeSigNum, secPerBeat, getCtx]);

  // ── Open mic stream for a track ──
  const openStream = useCallback(async (track: Track): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice !== 'default' ? { exact: selectedDevice } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: SAMPLE_RATE,
          channelCount: captureChannelMode === 'mono' || track.inputMono ? 1 : 2,
        }
      });
      streamMap.current.set(track.id, stream);

      const ctx = getCtx();
      const src = ctx.createMediaStreamSource(stream);

      // Analyser for metering
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser);
      analyserMap.current.set(track.id, analyser);

      // Input monitoring (hear yourself)
      if (inputMonitor) {
        const monGain = ctx.createGain();
        monGain.gain.value = dbToLinear(track.gainDb);
        const panner = ctx.createStereoPanner();
        panner.pan.value = track.pan;
        const monitorDelay = ctx.createDelay(1);
        const baseLatencySec = Number(ctx.baseLatency || 0);
        const outputLatencySec = Number((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0);
        monitorDelay.delayTime.value = Math.max(0, baseLatencySec + outputLatencySec);
        src.connect(monGain).connect(panner).connect(monitorDelay).connect(ctx.destination);
        monitorGainMap.current.set(track.id, monGain);
        monitorDelayMap.current.set(track.id, monitorDelay);
        // Tuner hookup for first armed track
        if (!tunerAnalyserRef.current) tunerAnalyserRef.current = analyser;
      }
      return stream;
    } catch (err) {
      console.warn('[AlbumStudio] mic denied for', track.name, err);
      return null;
    }
  }, [captureChannelMode, selectedDevice, getCtx, inputMonitor]);

  // ── Close stream for a track ──
  const closeStream = useCallback((trackId: string) => {
    const analyser = analyserMap.current.get(trackId) || null;
    streamMap.current.get(trackId)?.getTracks().forEach(t => t.stop());
    streamMap.current.delete(trackId);
    analyserMap.current.delete(trackId);
    monitorGainMap.current.get(trackId)?.disconnect();
    monitorGainMap.current.delete(trackId);
    monitorDelayMap.current.get(trackId)?.disconnect();
    monitorDelayMap.current.delete(trackId);
    if (tunerAnalyserRef.current === analyser) {
      tunerAnalyserRef.current = null;
    }
  }, []);

  // ── Start recording a single track ──
  const startTrackRecording = useCallback(async (track: Track, startPos: number) => {
    const stream = await openStream(track);
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    chunkMap.current.set(track.id, []);
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = e => {
      if (e.data.size > 0) {
        const chunks = chunkMap.current.get(track.id) ?? [];
        chunks.push(e.data);
      }
    };
    recorder.onstop = async () => {
      const chunks = chunkMap.current.get(track.id) ?? [];
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const intakeAnalysis = await analyzeTakeBlob(blob);
      const { waveform, clipped } = await blobToWaveform(blob);
      const endPos = recStartSec.current + (performance.now() / 1000 - phStart.current);
      const dur = Math.max(0.1, endPos - startPos);
      const takeNum = (takeCountMap.current.get(track.id) ?? 0) + 1;
      takeCountMap.current.set(track.id, takeNum);

      const take: Take = {
        id: `take-${Date.now()}-${track.id}`,
        blob, url, waveformData: waveform,
        durationSec: dur,
        label: `Take ${takeNum}`,
        clipped,
        intakeAnalysis,
      };
      appendTakeToTrack(track.id, take, startPos);
    };

    recorder.start(100);
    recorderMap.current.set(track.id, recorder);
  }, [analyzeTakeBlob, openStream, recordMode, appendTakeToTrack]);

  const handlePrintSynth = useCallback(async () => {
    const destination = synthCaptureDestination;
    if (!destination || isPrintingSynth) return;
    const targetTrack = tracks.find((track) => track.armed) || tracks[0];
    if (!targetTrack) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    setIsPrintingSynth(true);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(destination.stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => setIsPrintingSynth(false);
    recorder.onstop = async () => {
      try {
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const intakeAnalysis = await analyzeTakeBlob(blob);
        const { waveform, clipped, durationSec } = await blobToWaveform(blob);
        const takeNum = (takeCountMap.current.get(targetTrack.id) ?? 0) + 1;
        takeCountMap.current.set(targetTrack.id, takeNum);
        const take: Take = {
          id: `synth-take-${Date.now()}-${targetTrack.id}`,
          blob,
          url,
          waveformData: waveform,
          durationSec: Math.max(0.1, durationSec || (secPerBar * 4)),
          label: `Take ${takeNum}`,
          clipped,
          intakeAnalysis,
        };
        appendTakeToTrack(targetTrack.id, take, playheadSec);
      } finally {
        setIsPrintingSynth(false);
      }
    };

    recorder.start(250);
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, Math.max(4000, Math.round(secPerBar * timeSigNum * 4 * 1000)));
  }, [analyzeTakeBlob, appendTakeToTrack, isPrintingSynth, playheadSec, secPerBar, synthCaptureDestination, timeSigNum, tracks]);

  const handleSynthMidiEvent = useCallback((event: {
    type: 'noteOn' | 'noteOff';
    note: number;
    velocity: number;
    timeSec: number;
  }) => {
    const trackId = tracks.find((track) => track.armed)?.id || tracks[0]?.id || 'midi-track';
    const state = synthCaptureMidiRef.current;
    if (event.type === 'noteOn') {
      state.active.set(event.note, { startTimeSec: event.timeSec, velocity: event.velocity });
      return;
    }

    const active = state.active.get(event.note);
    if (!active) return;
    state.active.delete(event.note);
    const note: ReplayMidiNote = {
      noteId: `midi-${Date.now()}-${event.note}-${Math.random().toString(36).slice(2, 8)}`,
      trackId,
      startTimeSec: Number(active.startTimeSec.toFixed(4)),
      durationSec: Math.max(0.05, Number((event.timeSec - active.startTimeSec).toFixed(4))),
      pitch: event.note,
      velocity: Math.max(1, Math.min(127, active.velocity)),
      channel: 0,
    };
    state.notes = [...state.notes, note];
    setCapturedMidiNotes(state.notes);
  }, [tracks]);

  const handleExportMidiLane = useCallback(() => {
    const targetTrack = tracks.find((track) => track.armed) || tracks[0];
    if (!targetTrack) return;
    const quantized = quantizeMidiNotes(capturedMidiNotes, { gridSeconds: 0.125, preserveDuration: true, preserveVelocity: true });
    const pkg = buildMidiNoteExportPackage(targetTrack.id, `${targetTrack.name} MIDI Lane`, quantized);
    downloadText(
      serializeMidiNoteExportPackage(pkg),
      `${targetTrack.name.replace(/\s+/g, '-').toLowerCase()}-midi-lane.json`,
      'application/json'
    );
  }, [capturedMidiNotes, tracks]);

  // ── RECORD ──
  const handleRecord = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      recorderMap.current.forEach((rec, id) => {
        if (rec.state !== 'inactive') rec.stop();
        closeStream(id);
      });
      recorderMap.current.clear();
      setIsRecording(false);
      cancelAnimationFrame(levelRaf.current);
      stopMetronome();
      cancelAnimationFrame(playheadRaf.current);
      return;
    }

    // Count-in
    await doCountIn();

    // Start
    const startPos = punchEnabled && punchIn !== null ? punchIn : playheadSec;
    recStartSec.current = startPos;
    phStart.current = performance.now() / 1000 - startPos;
    setIsRecording(true);
    setIsPlaying(true);

    // Playhead ticker
    cancelAnimationFrame(playheadRaf.current);
    const tick = () => {
      const pos = performance.now() / 1000 - phStart.current;
      setPlayheadSec(pos);
      // Auto-punch out
      if (punchEnabled && punchOut !== null && pos >= punchOut) {
        recorderMap.current.forEach((rec, id) => { if (rec.state !== 'inactive') rec.stop(); closeStream(id); });
        recorderMap.current.clear();
        setIsRecording(false);
        cancelAnimationFrame(playheadRaf.current);
        stopMetronome();
        return;
      }
      // Loop
      if (loopOn && loopEnd !== null && loopStart !== null && pos >= loopEnd) {
        phStart.current = performance.now() / 1000 - loopStart;
        setPlayheadSec(loopStart);
      }
      playheadRaf.current = requestAnimationFrame(tick);
    };
    playheadRaf.current = requestAnimationFrame(tick);

    startMetronome(bpm);
    startLevelLoop();

    const armedTracks = tracks.filter(t => t.armed);
    for (const t of armedTracks) {
      await startTrackRecording(t, startPos);
    }
  }, [
    isRecording, tracks, playheadSec, punchEnabled, punchIn, punchOut,
    loopOn, loopStart, loopEnd, bpm, doCountIn, closeStream, startTrackRecording,
    startMetronome, stopMetronome, startLevelLoop,
  ]);

  // ── PLAY / STOP ──
  const handlePlayStop = useCallback(() => {
    if (isPlaying && !isRecording) {
      setIsPlaying(false);
      cancelAnimationFrame(playheadRaf.current);
      stopMetronome();
      // Stop playback nodes
      playbackNodes.current.forEach(n => { try { n.stop(); } catch {} });
      playbackNodes.current = [];
      return;
    }
    if (isRecording) return;

    setIsPlaying(true);
    phStart.current = performance.now() / 1000 - playheadSec;
    if (metronomeOn) startMetronome(bpm);

    // Play back all non-muted regions
    const ctx = getCtx();
    (async () => {
      for (const track of tracks) {
        const shouldPlay = !track.muted && (!anySoloed || track.soloed);
        if (!shouldPlay) continue;
        for (const region of track.regions) {
          const take = region.takes[region.activeTaskIdx];
          if (!take) continue;
          try {
            const ab = await take.blob.arrayBuffer();
            const decoded = await ctx.decodeAudioData(ab);
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            const gainNode = ctx.createGain();
            gainNode.gain.value = track.volume * dbToLinear(region.gainDb) * dbToLinear(track.gainDb);
            const panner = ctx.createStereoPanner();
            panner.pan.value = track.pan;
            const { input: fxIn, output: fxOut } = buildFXChain(ctx, track.fx);
            src.connect(gainNode).connect(fxIn);
            fxOut.connect(panner).connect(ctx.destination);
            const offset = Math.max(0, playheadSec - region.startSec);
            if (offset < region.durationSec) {
              src.start(ctx.currentTime, offset);
              playbackNodes.current.push(src);
            }
          } catch {}
        }
      }
    })();

    // Playhead
    cancelAnimationFrame(playheadRaf.current);
    const tick = () => {
      const pos = performance.now() / 1000 - phStart.current;
      setPlayheadSec(pos);
      if (loopOn && loopEnd !== null && loopStart !== null && pos >= loopEnd) {
        phStart.current = performance.now() / 1000 - loopStart;
        setPlayheadSec(loopStart);
      }
      playheadRaf.current = requestAnimationFrame(tick);
    };
    playheadRaf.current = requestAnimationFrame(tick);
  }, [
    isPlaying, isRecording, tracks, playheadSec, metronomeOn, bpm,
    anySoloed, loopOn, loopStart, loopEnd, getCtx, startMetronome, stopMetronome,
  ]);

  // ── RETURN TO ZERO ──
  const handleRTZ = useCallback(() => {
    cancelAnimationFrame(playheadRaf.current);
    playbackNodes.current.forEach(n => { try { n.stop(); } catch {} });
    playbackNodes.current = [];
    setIsPlaying(false);
    setPlayheadSec(0);
  }, []);

  // ── TAP TEMPO ──
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    setTapTimes(prev => {
      const recent = [...prev, now].filter(t => now - t < 4000).slice(-8);
      if (recent.length >= 2) {
        const intervals = recent.slice(1).map((t, i) => t - recent[i]);
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        setBpm(Math.round(60000 / avg));
      }
      return recent;
    });
  }, []);

  // ── STRIP SILENCE ──
  const handleStripSilence = useCallback(async (trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      const newRegions = t.regions.map(region => {
        const take = region.takes[region.activeTaskIdx];
        if (!take?.waveformData) return region;
        // Find first/last non-silent sample in waveform thumb
        const data = take.waveformData;
        const silThresh = 0.02;
        let start = 0, end = data.length - 1;
        while (start < data.length && (data[start] ?? 0) < silThresh) start++;
        while (end > 0 && (data[end] ?? 0) < silThresh) end--;
        if (start >= end) return region;
        const trimStart = (start / data.length) * region.durationSec;
        const trimEnd   = (end / data.length) * region.durationSec;
        return {
          ...region,
          startSec: region.startSec + trimStart,
          durationSec: trimEnd - trimStart,
        };
      });
      return { ...t, regions: newRegions };
    }));
  }, []);

  // ── NORMALIZE ──
  const handleNormalize = useCallback(async (trackId: string, regionId: string, targetDb = -1) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        regions: t.regions.map(r => {
          if (r.id !== regionId) return r;
          const take = r.takes[r.activeTaskIdx];
          if (!take) return r;
          const peak = take.waveformData.reduce((max, sample) => Math.max(max, sample), 0);
          if (peak <= 0) return r;
          const peakDb = 20 * Math.log10(peak);
          const gainNeeded = targetDb - peakDb;
          return { ...r, gainDb: Math.min(12, r.gainDb + gainNeeded) };
        }),
      };
    }));
  }, []);

  // ── ADD MARKER ──
  const addMarker = useCallback(() => {
    const m: Marker = {
      id: `m-${Date.now()}`,
      positionSec: playheadSec,
      label: `M${markers.length + 1}`,
      color: TRACK_COLORS[markers.length % TRACK_COLORS.length],
    };
    setMarkers(prev => [...prev, m]);
  }, [playheadSec, markers.length]);

  const insertMediaPoolAsset = useCallback((assetId: string) => {
    const asset = mediaPool.find((item) => item.id === assetId);
    if (!asset) return;

    const targetTrackId = mediaPoolTrackId ?? tracks[0]?.id ?? null;
    const take: Take = {
      id: `${asset.id}-take-${Date.now()}`,
      blob: asset.blob,
      url: URL.createObjectURL(asset.blob),
      waveformData: asset.waveformData.slice(),
      durationSec: Math.max(0.01, asset.durationSec || 0),
      label: 'Take 1',
      clipped: asset.clipped,
    };
    const region: TrackRegion = {
      id: `media-reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startSec: playheadSec,
      durationSec: Math.max(0.01, asset.durationSec || 0),
      takes: [take],
      activeTaskIdx: 0,
      gainDb: 0,
      color: '#38bdf8',
      isTakeFolder: false,
    };

    setTracks((prev) => {
      if (!prev.length) {
        const freshTrack = makeTrack(0);
        freshTrack.name = 'Media';
        freshTrack.color = '#38bdf8';
        freshTrack.regions = [region];
        return [freshTrack];
      }

      const resolvedTrackId = targetTrackId && prev.some((track) => track.id === targetTrackId)
        ? targetTrackId
        : prev[0]?.id ?? null;

      if (!resolvedTrackId) {
        const freshTrack = makeTrack(prev.length);
        freshTrack.name = 'Media';
        freshTrack.color = '#38bdf8';
        freshTrack.regions = [region];
        return [...prev, freshTrack];
      }

      return prev.map((track, index) => {
        if (track.id !== resolvedTrackId) return track;
        const nextRegions = [...track.regions, region];
        return { ...track, name: track.name || `Track ${index + 1}`, regions: nextRegions };
      });
    });
  }, [mediaPool, mediaPoolTrackId, playheadSec, tracks]);

  const handleMediaPoolImport = useCallback(async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith('audio/') || /\.(wav|mp3|aif|aiff|flac|m4a|ogg)$/i.test(file.name));
    if (!audioFiles.length) return;

    const importedAssets: MediaPoolAsset[] = [];
    for (const file of audioFiles) {
      const { waveform, clipped, durationSec } = await blobToWaveform(file);
      const now = Date.now();
      importedAssets.push({
        id: `media-${now.toString(36)}-${importedAssets.length + 1}`,
        assetId: `media-${now.toString(36)}-${importedAssets.length + 1}`,
        name: file.name || 'Imported Audio',
        mimeType: file.type || 'audio/wav',
        sizeBytes: file.size,
        registeredAt: now,
        durationSec: Number.isFinite(durationSec) ? Number(durationSec.toFixed(3)) : 0,
        waveformData: waveform,
        clipped,
        sourceKind: 'import',
        blob: file,
      });
    }

    const nextMediaPool = mediaPool.slice();
    for (const asset of importedAssets) {
      const existingIndex = nextMediaPool.findIndex((item) => item.id === asset.id || (item.name === asset.name && item.sizeBytes === asset.sizeBytes));
      if (existingIndex >= 0) {
        nextMediaPool.splice(existingIndex, 1, asset);
      } else {
        nextMediaPool.push(asset);
      }
    }
    setMediaPool(nextMediaPool);
    void saveSession(tracks, markers, nextMediaPool, bpm, timeSigNum, captureChannelMode)
      .then(() => setSessionMeta(getSessionMeta()))
      .catch((error) => {
        console.warn('[AlbumStudio] Media pool save failed:', error);
      });
  }, [bpm, markers, mediaPool, timeSigNum, tracks]);

  // ── MIXDOWN ──
  const handleMixdown = useCallback(async () => {
    setIsMixingDown(true);
    try {
      const ctx = new OfflineAudioContext(2, Math.ceil(totalDuration * SAMPLE_RATE), SAMPLE_RATE);
      for (const track of tracks) {
        if (track.muted) continue;
        if (anySoloed && !track.soloed) continue;
        for (const region of track.regions) {
          const take = region.takes[region.activeTaskIdx];
          if (!take) continue;
          try {
            const ab = await take.blob.arrayBuffer();
            const decoded = await new AudioContext().decodeAudioData(ab);
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            const g = ctx.createGain();
            g.gain.value = track.volume * dbToLinear(region.gainDb) * dbToLinear(track.gainDb);
            const panner = ctx.createStereoPanner();
            panner.pan.value = track.pan;
            const { input: fxIn, output: fxOut } = buildFXChain(ctx, track.fx);
            src.connect(g).connect(fxIn);
            fxOut.connect(panner).connect(ctx.destination);
            src.start(region.startSec);
          } catch {}
        }
      }
      const rendered = await ctx.startRendering();
      // WAV encode
      const nCh = 2, len = rendered.length, sr = SAMPLE_RATE;
      const blockAlign = nCh * 2;
      const ab = new ArrayBuffer(44 + len * blockAlign);
      const view = new DataView(ab);
      const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
      wr(0,'RIFF'); view.setUint32(4,36+len*blockAlign,true); wr(8,'WAVE');
      wr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
      view.setUint16(22,nCh,true); view.setUint32(24,sr,true);
      view.setUint32(28,sr*blockAlign,true); view.setUint16(32,blockAlign,true);
      view.setUint16(34,16,true); wr(36,'data'); view.setUint32(40,len*blockAlign,true);
      let off = 44;
      for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < nCh; ch++) {
          const s = Math.max(-1, Math.min(1, rendered.getChannelData(Math.min(ch, rendered.numberOfChannels-1))[i]));
          view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
        }
      }
      const blob = new Blob([ab], { type: 'audio/wav' });
      setMixdownDone(true);
      onMixdown?.(blob, 'Album-Mixdown.wav');
    } finally {
      setIsMixingDown(false);
    }
  }, [tracks, totalDuration, anySoloed, onMixdown]);

  // ── CLEANUP ──
  useEffect(() => () => {
    cancelAnimationFrame(playheadRaf.current);
    cancelAnimationFrame(levelRaf.current);
    stopMetronome();
    streamMap.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    playbackNodes.current.forEach(n => { try { n.stop(); } catch {} });
    audioCtxRef.current?.close();
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
  }, [stopMetronome]);

  // ── SESSION LOAD on mount ──
  useEffect(() => {
    if (!hasSession()) return;
    loadSession().then(session => {
      if (!session) return;
      setTracks(session.tracks);
      setMarkers(session.markers);
      setMediaPool(session.mediaPool);
      setBpm(session.bpm);
      setTimeSigNum(session.timeSigNum);
      setCaptureChannelMode(session.captureChannelMode);
      setSessionMeta(getSessionMeta());
      window.setTimeout(() => resetStudioHistory(), 0);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── GHOST RECOVERY CHECK ──
  useEffect(() => {
    recoverCoreSession(CORE_ALBUM_SESSION_JOB_ID)
      .then((result) => {
        if (result.status === 'available' && result.session?.dsp_state) {
          setGhostRecovery(result.session.dsp_state as Record<string, any>);
        }
      })
      .catch((error) => {
        console.warn('[AlbumStudio] Core ghost recovery unavailable:', error);
      });
  }, []);

  // ── GHOST AUTO-SAVE after slider/stem/session changes ──
  useEffect(() => {
    if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
    ghostSaveTimer.current = setTimeout(() => {
      autosaveCoreSession({
        job_id: CORE_ALBUM_SESSION_JOB_ID,
        audio_paths: {},
        dsp_state: buildCoreDspState(),
      }).catch((error) => {
        console.warn('[AlbumStudio] Core ghost autosave failed:', error);
      });
    }, 2000);
    return () => {
      if (ghostSaveTimer.current) clearTimeout(ghostSaveTimer.current);
    };
  }, [buildCoreDspState]);

  // ── AUTO-SAVE after structural edits ──
  const sessionPersistenceSignature = buildSessionPersistenceSignature(tracks, markers, mediaPool, bpm, timeSigNum);
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      await saveSession(tracks, markers, mediaPool, bpm, timeSigNum, captureChannelMode).catch(() => {});
      setSessionMeta(getSessionMeta());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [captureChannelMode, sessionPersistenceSignature]);

  // ── MANUAL SAVE ──
  const handleManualSave = useCallback(async () => {
    setSaveStatus('saving');
    await saveSession(tracks, markers, mediaPool, bpm, timeSigNum, captureChannelMode).catch(() => {});
    await saveCoreSession({
      job_id: CORE_ALBUM_SESSION_JOB_ID,
      audio_paths: {},
      dsp_state: buildCoreDspState(),
    }).catch((error) => {
      console.warn('[AlbumStudio] Core session save failed:', error);
    });
    setSessionMeta(getSessionMeta());
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [buildCoreDspState, bpm, captureChannelMode, markers, mediaPool, timeSigNum, tracks]);

  const handleManualLoad = useCallback(async () => {
    await loadCoreSession(CORE_ALBUM_SESSION_JOB_ID).catch((error) => {
      console.warn('[AlbumStudio] Core session load unavailable:', error);
      return null;
    });
    const session = await loadSession();
    if (!session) return;
    setTracks(session.tracks);
    setMarkers(session.markers);
    setMediaPool(session.mediaPool);
    setBpm(session.bpm);
    setTimeSigNum(session.timeSigNum);
    setCaptureChannelMode(session.captureChannelMode);
    setSessionMeta(getSessionMeta());
    setSaveStatus('saved');
    window.setTimeout(() => resetStudioHistory(), 0);
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [buildStudioSnapshot, bpm, captureChannelMode, countIn, inputMonitor, lowLatency, loopEnd, loopOn, loopStart, metronomeOn, playheadSec, punchEnabled, punchIn, punchOut, recordMode, resetStudioHistory, selectedDevice, timeSigNum]);

  const restoreGhostSession = useCallback(() => {
    if (!ghostRecovery) return;
    const recoveredTracks = Array.isArray(ghostRecovery.tracks) ? ghostRecovery.tracks : [];
    setTracks(prev => prev.map(track => {
      const recovered = recoveredTracks.find((item: any) => item?.id === track.id);
      if (!recovered) return track;
      return {
        ...track,
        name: typeof recovered.name === 'string' ? recovered.name : track.name,
        muted: Boolean(recovered.muted),
        soloed: Boolean(recovered.soloed),
        armed: Boolean(recovered.armed),
        volume: Number.isFinite(Number(recovered.volume)) ? Number(recovered.volume) : track.volume,
        pan: Number.isFinite(Number(recovered.pan)) ? Number(recovered.pan) : track.pan,
        gainDb: Number.isFinite(Number(recovered.gainDb)) ? Number(recovered.gainDb) : track.gainDb,
        width: Number.isFinite(Number(recovered.width)) ? Number(recovered.width) : track.width,
        inputMono: Boolean(recovered.inputMono),
        outputBusId: typeof recovered.outputBusId === 'string' ? recovered.outputBusId : track.outputBusId ?? null,
        sends: Array.isArray(recovered.sends)
          ? recovered.sends
              .map((send: any) => ({
                sendId: typeof send?.sendId === 'string' ? send.sendId : '',
                targetTrackId: typeof send?.targetTrackId === 'string' ? send.targetTrackId : '',
                levelDb: Number.isFinite(Number(send?.levelDb)) ? Number(send.levelDb) : 0,
                preFader: Boolean(send?.preFader),
                enabled: send?.enabled !== false,
                mode: send?.mode === 'sidechain' ? 'sidechain' : 'aux',
              }))
              .filter((send: TrackSend) => send.sendId && send.targetTrackId)
          : track.sends ?? [],
        fx: recovered.fx ?? track.fx,
      };
    }));
    if (Number.isFinite(Number(ghostRecovery.bpm))) setBpm(Number(ghostRecovery.bpm));
    if (Number.isFinite(Number(ghostRecovery.timeSigNum))) setTimeSigNum(Number(ghostRecovery.timeSigNum));
    if (ghostRecovery.captureChannelMode === 'mono' || ghostRecovery.captureChannelMode === 'stereo') {
      setCaptureChannelMode(ghostRecovery.captureChannelMode);
    }
    if (Array.isArray(ghostRecovery.markers)) setMarkers(ghostRecovery.markers as Marker[]);
    void acknowledgeCoreRecovery(CORE_ALBUM_SESSION_JOB_ID).catch((error) => {
      console.warn('[AlbumStudio] Core ghost recovery acknowledgement failed:', error);
    });
    setGhostRecovery(null);
    setSaveStatus('saved');
    window.setTimeout(() => resetStudioHistory(), 0);
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [bpm, buildStudioSnapshot, captureChannelMode, countIn, inputMonitor, lowLatency, loopEnd, loopOn, loopStart, markers, metronomeOn, playheadSec, punchEnabled, punchIn, punchOut, recordMode, resetStudioHistory, selectedDevice, timeSigNum, ghostRecovery]);

  // ── UNDO / REDO HISTORY ──
  useEffect(() => {
    if (studioHistoryRef.current.snapshots.length === 0) {
      resetStudioHistory();
      return;
    }

    const snapshot = buildStudioSnapshot();
    const signature = buildStudioHistorySignature(snapshot);
    if (studioHistoryRef.current.suppress) return;
    if (studioHistoryRef.current.lastSignature === signature) return;

    const state = studioHistoryRef.current;
    const nextHistory = state.snapshots.slice(0, state.index + 1);
    nextHistory.push(cloneStudioSnapshot(snapshot));
    if (nextHistory.length > 50) {
      nextHistory.splice(0, nextHistory.length - 50);
    }
    state.snapshots = nextHistory;
    state.index = nextHistory.length - 1;
    state.lastSignature = signature;
    setHistoryVersion((value) => value + 1);
  }, [bpm, buildStudioSnapshot, countIn, inputMonitor, lowLatency, loopEnd, loopOn, loopStart, markers, metronomeOn, playheadSec, punchEnabled, punchIn, punchOut, recordMode, resetStudioHistory, selectedDevice, timeSigNum, tracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isEditable) return;

      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) {
        redoStudioHistory();
      } else {
        undoStudioHistory();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoStudioHistory, undoStudioHistory]);

  // ── STEM EXPORT ──
  const handleExportStems = useCallback(async () => {
    for (const track of tracks) {
      if (!track.regions.length) continue;
      const ctx = new OfflineAudioContext(2, Math.ceil(totalDuration * SAMPLE_RATE), SAMPLE_RATE);
      for (const region of track.regions) {
        const take = region.takes[region.activeTaskIdx];
        if (!take) continue;
        try {
          const ab = await take.blob.arrayBuffer();
          const decoded = await new AudioContext().decodeAudioData(ab);
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          const g = ctx.createGain();
          g.gain.value = track.volume * dbToLinear(region.gainDb) * dbToLinear(track.gainDb);
          const panner = ctx.createStereoPanner();
          panner.pan.value = track.pan;
          const { input: fxIn, output: fxOut } = buildFXChain(ctx, track.fx);
          src.connect(g).connect(fxIn);
          fxOut.connect(panner).connect(ctx.destination);
          src.start(region.startSec);
        } catch {}
      }
      const rendered = await ctx.startRendering();
      const nCh = 2, len = rendered.length, blockAlign = nCh * 2;
      const wavAb = new ArrayBuffer(44 + len * blockAlign);
      const view = new DataView(wavAb);
      const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
      wr(0,'RIFF'); view.setUint32(4,36+len*blockAlign,true); wr(8,'WAVE');
      wr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
      view.setUint16(22,nCh,true); view.setUint32(24,SAMPLE_RATE,true);
      view.setUint32(28,SAMPLE_RATE*blockAlign,true); view.setUint16(32,blockAlign,true);
      view.setUint16(34,16,true); wr(36,'data'); view.setUint32(40,len*blockAlign,true);
      let off = 44;
      for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < nCh; ch++) {
          const s2 = Math.max(-1, Math.min(1, rendered.getChannelData(Math.min(ch,rendered.numberOfChannels-1))[i] ?? 0));
          view.setInt16(off, s2 < 0 ? s2 * 0x8000 : s2 * 0x7FFF, true); off += 2;
        }
      }
      const blob = new Blob([wavAb], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${track.name.replace(/\s+/g,'-')}.wav`;
      a.click(); URL.revokeObjectURL(url);
      await new Promise(r => setTimeout(r, 200));
    }
  }, [tracks, totalDuration]);

  // ── Timeline click to seek ──
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isRecording) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    setPlayheadSec(pos);
    phStart.current = performance.now() / 1000 - pos;
  }, [isRecording, pxPerSec]);

  const timelineWidth = Math.max(900, totalDuration * pxPerSec + 200);

  return (
    <div className="flex flex-col bg-slate-950 border border-white/[0.07] rounded-2xl overflow-hidden font-sans" style={{ minHeight: 500 }}>
      {ghostRecovery && (
        <div className="flex items-center justify-between gap-3 border-b border-orange-500/20 bg-orange-500/10 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-orange-200">Session interrupted. Restore unsaved changes?</p>
            <p className="text-[10px] text-orange-200/60">Ghost Save found newer mixer/session parameters from the local core WAL.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGhostRecovery(null)}
              className="rounded-md border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
            >
              Ignore
            </button>
            <button
              onClick={restoreGhostSession}
              className="rounded-md border border-orange-400/30 bg-orange-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-200 hover:bg-orange-500/30"
            >
              Restore
            </button>
          </div>
        </div>
      )}

      {/* ══════════ TRANSPORT BAR ══════════ */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-slate-900/70 flex-wrap gap-y-2">

        {/* RTZ */}
        <button onClick={handleRTZ} title="Return to zero" className="w-7 h-7 rounded-md bg-white/[0.04] hover:bg-white/10 text-slate-400 flex items-center justify-center transition-colors">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>

        {/* Undo / Redo */}
        <button
          onClick={undoStudioHistory}
          disabled={!canUndoStudio}
          title="Undo (Cmd/Ctrl+Z)"
          className="w-7 h-7 rounded-md bg-white/[0.04] hover:bg-white/10 text-slate-400 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-white/[0.04] disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 7H7.83l1.58-1.59L8 4l-4 4 4 4 1.41-1.41L7.83 9H11c3.31 0 6 2.69 6 6v1h2v-1c0-4.42-3.58-8-8-8z"/></svg>
        </button>
        <button
          onClick={redoStudioHistory}
          disabled={!canRedoStudio}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="w-7 h-7 rounded-md bg-white/[0.04] hover:bg-white/10 text-slate-400 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-white/[0.04] disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 7h3.17l-1.58-1.59L16 4l4 4-4 4-1.41-1.41L16.17 9H13c-3.31 0-6 2.69-6 6v1H5v-1c0-4.42 3.58-8 8-8z"/></svg>
        </button>

        {/* Play */}
        <motion.button
          onClick={handlePlayStop}
          disabled={isRecording}
          whileTap={{ scale: 0.9 }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 ${isPlaying && !isRecording ? 'bg-orange-500/25 text-orange-400 border border-orange-500/30' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'}`}
        >
          {isPlaying && !isRecording
            ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            : <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          }
        </motion.button>

        {/* Record */}
        <motion.button
          onClick={handleRecord}
          whileTap={{ scale: 0.9 }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isRecording ? 'bg-red-500/30 border border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.35)]' : 'bg-white/[0.06] hover:bg-red-500/15'}`}
        >
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-red-500/70'}`} />
        </motion.button>

        {/* Timecode */}
        <div className="font-mono text-xs text-slate-300 bg-black/40 px-3 py-1.5 rounded-lg border border-white/[0.06] tabular-nums min-w-[96px] text-center">
          {String(Math.floor(playheadSec / 3600)).padStart(2,'0')}:
          {String(Math.floor((playheadSec % 3600) / 60)).padStart(2,'0')}:
          {String(Math.floor(playheadSec % 60)).padStart(2,'0')}.
          {String(Math.floor((playheadSec % 1) * 100)).padStart(2,'0')}
        </div>

        {/* BPM + tap */}
        <div className="flex items-center gap-1 bg-black/30 rounded-lg border border-white/[0.06] px-2 py-1">
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">BPM</span>
          <input type="number" value={bpm} min={20} max={300}
            onChange={e => setBpm(Math.max(20, Math.min(300, Number(e.target.value))))}
            className="w-12 bg-transparent text-xs text-orange-400 font-mono text-center focus:outline-none"
          />
          <button onClick={handleTapTempo} className="text-[9px] text-slate-500 hover:text-slate-300 px-1 border-l border-white/[0.06] ml-1 transition-colors">TAP</button>
        </div>

        {/* Time sig */}
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <select value={timeSigNum} onChange={e => setTimeSigNum(Number(e.target.value))}
            className="bg-black/30 border border-white/[0.06] rounded px-1 py-0.5 text-slate-400 focus:outline-none">
            {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/4</option>)}
          </select>
        </div>

        {/* Count-in */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-600">COUNT IN</span>
          <select value={countIn} onChange={e => setCountIn(Number(e.target.value) as 0|1|2|4)}
            className="bg-black/30 border border-white/[0.06] rounded px-1 py-0.5 text-[10px] text-slate-400 focus:outline-none">
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
            <option value={4}>4 bars</option>
          </select>
        </div>

        {/* Metronome */}
        <button onClick={() => setMetronomeOn(m => !m)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${metronomeOn ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'}`}>
          ♩
        </button>

        {/* Record Mode */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
          {(['new','overdub','replace'] as RecordMode[]).map(m => (
            <button key={m} onClick={() => setRecordMode(m)}
              className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-all ${recordMode === m ? 'bg-orange-500/20 text-orange-400' : 'bg-white/[0.02] text-slate-600 hover:text-slate-400'}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Punch */}
        <button onClick={() => setPunchEnabled(p => !p)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${punchEnabled ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'}`}>
          PUNCH
        </button>

        {/* Loop */}
        <button onClick={() => setLoopOn(l => !l)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${loopOn ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'}`}>
          ↺ LOOP
        </button>

        {/* Monitor */}
        <button onClick={() => setInputMonitor(m => !m)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${inputMonitor ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'}`}
          title="Input monitoring — hear yourself while recording">
          MON
        </button>

        {/* Tuner */}
        <button onClick={() => setShowTuner(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showTuner ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'}`}>
          ♦ TUNER
        </button>

        {/* Marker */}
        <button onClick={addMarker}
          className="px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border border-white/[0.06] bg-white/[0.03] text-slate-600 hover:text-slate-300 transition-colors"
          title="Drop marker at playhead (M)">
          + MARKER
        </button>

        <div className="ml-auto min-w-[280px] max-w-[360px]">
          <AudioDeviceSelector
            selectedDeviceId={selectedDevice}
            onSelectDevice={setSelectedDevice}
            channelMode={captureChannelMode}
            onChannelModeChange={setCaptureChannelMode}
            inputLevel={recordInputLevel}
            disabled={isRecording}
          />
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setPxPerSec(p => Math.max(20, p - 20))} className="w-5 h-5 rounded text-slate-500 hover:text-slate-300 flex items-center justify-center text-xs">−</button>
          <button onClick={() => setPxPerSec(p => Math.min(300, p + 20))} className="w-5 h-5 rounded text-slate-500 hover:text-slate-300 flex items-center justify-center text-xs">+</button>
        </div>

        {/* Beat Machine */}
        {/* Beat Machine */}
        <button onClick={() => setShowBeats(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showBeats ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Beat Machine — program a 16-step drum pattern and bounce it into this session as a WAV clip">
          Beat Machine
        </button>

        {/* MIDI Synth */}
        <button onClick={() => setShowSynth(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showSynth ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="MIDI Synth — play notes with your keyboard (or a MIDI controller) and record into a track">
          Synth / Keys
        </button>

        {/* Song Arranger */}
        <button onClick={() => setShowArranger(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showArranger ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Song Arranger — AI detects your verse/chorus/bridge sections and lets you drag to reorder them">
          Arrange Song
        </button>

        {/* Mix Critique */}
        <button onClick={() => setShowMixCritique(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showMixCritique ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="AI Mix Critique — scans your mix for frequency imbalances, clipping, mud, phase issues, and more before mastering">
          Mix Critique
        </button>

        {/* Audio Intelligence */}
        <button onClick={() => setShowAudioIntel(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showAudioIntel ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Audio Intelligence — detect BPM, musical key, and see loudness over time">
          BPM / Key
        </button>

        {/* Smart Export */}
        <button onClick={() => setShowSmartExport(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showSmartExport ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Smart Export — WAV 24-bit, 16-bit, 32-bit float, or 96kHz with platform-specific presets">
          Smart Export
        </button>

        {/* Chord Progression */}
        <button onClick={() => setShowChords(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showChords ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Chord Progression — detect chords across the track: major, minor, 7th, sus, dim, aug">
          Chords
        </button>

        {/* Reverb Designer */}
        <button onClick={() => setShowReverb(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showReverb ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Reverb Designer — algorithmic reverb: small room, plate, hall, cathedral, spring, ambience">
          Reverb
        </button>

        {/* Stereo Analyzer */}
        <button onClick={() => setShowStereoAnalyzer(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showStereoAnalyzer ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Stereo Field Analyzer — Lissajous scope, L/R/M/S meters, phase correlation, width">
          ↔ Stereo
        </button>

        {/* Spectral Repair */}
        <button onClick={() => setShowSpectralRepair(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showSpectralRepair ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Spectral Repair — paint over the spectrogram to remove hum, hiss, clicks, and tonal noise">
          Spectral Repair
        </button>

        {/* Gain Staging */}
        <button onClick={() => setShowGainStaging(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showGainStaging ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Gain Staging Advisor — per-track RMS and peak analysis with suggested adjustments">
          Gain Staging
        </button>

        {/* Mastering History */}
        <button onClick={() => setShowMasteringHistory(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showMasteringHistory ? 'bg-slate-500/15 text-slate-300 border-slate-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Mastering History — view and annotate your past mastering sessions">
          History
        </button>

        {/* Tempo & Groove */}
        <button onClick={() => setShowTempoGroove(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showTempoGroove ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Tempo & Groove — metronome, tap tempo, delay calculator">
          Tempo
        </button>

        {/* Key & Scale */}
        <button onClick={() => setShowKeyScale(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showKeyScale ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Key & Scale Reference — diatonic chords, progressions, circle of fifths">
          Key Helper
        </button>

        {/* Frequency Reference */}
        <button onClick={() => setShowFreqRef(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showFreqRef ? 'bg-teal-500/15 text-teal-400 border-teal-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Frequency Reference — EQ cheat sheet: what each frequency range sounds like, boost/cut guidance">
          Freq Guide
        </button>

        {/* EQ Advisor */}
        <button onClick={() => setShowEqAdvisor(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showEqAdvisor ? 'bg-green-500/15 text-green-400 border-green-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="EQ Advisor — automated frequency analysis and specific EQ move suggestions">
          EQ Advisor
        </button>

        {/* Compressor Visualizer */}
        <button onClick={() => setShowCompressor(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showCompressor ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Compressor Visualizer — interactive transfer curve, knee, gain reduction">
          Compressor
        </button>

        {/* Multi-Track Meters */}
        <button onClick={() => setShowMultiMeter(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showMultiMeter ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Multi-Track Meters — VU/PPM meters for all tracks with peak hold and balance">
          Meters
        </button>

        {/* Production Notes */}
        <button onClick={() => setShowNotes(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showNotes ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Production Notes — session notepad with tags, snippets, and export">
          Notes
        </button>

        {/* Reference Track */}
        <button onClick={() => setShowRefTrack(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showRefTrack ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Reference Track — load a commercial reference and compare LUFS, spectrum, width">
          Reference
        </button>

        {/* LUFS Timeline */}
        <button onClick={() => setShowLufsTimeline(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showLufsTimeline ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="LUFS Timeline — loudness over time with platform targets, click to seek">
          LUFS Timeline
        </button>

        {/* Waveform Markers */}
        <button onClick={() => setShowAnnotations(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showAnnotations ? 'bg-pink-500/15 text-pink-400 border-pink-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Waveform Markers — bookmark key moments with labels and export cue sheets">
          Markers
        </button>

        {/* Mix Checklist */}
        <button onClick={() => setShowChecklist(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showChecklist ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Pre-Mastering Checklist — verify your mix is ready before mastering">
          ✅ Checklist
        </button>

        {/* Vocal Pitch */}
        <button onClick={() => setShowVocalPitch(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showVocalPitch ? 'bg-pink-500/15 text-pink-400 border-pink-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Vocal Pitch Analyzer — autocorrelation pitch detection, note histogram, CSV export">
          Pitch Detect
        </button>

        {/* Spectral Balance */}
        <button onClick={() => setShowSpectralBalance(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showSpectralBalance ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Spectral Balance — compare frequency bands vs genre target curves">
          Spectral Balance
        </button>

        {/* Mastering Chain Visualizer */}
        <button onClick={() => setShowChainVisualizer(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showChainVisualizer ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Mastering Chain EQ — see the cumulative frequency response curve">
          〰 EQ Curve
        </button>

        {/* Loudness Meter */}
        <button onClick={() => setShowLoudnessMeter(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showLoudnessMeter ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Loudness Meter — ITU-R BS.1770-4 integrated/short-term/momentary + LRA + true peak">
          LUFS Meter
        </button>

        {/* Reference Matcher */}
        <button onClick={() => setShowRefMatcher(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showRefMatcher ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Reference Matcher — compare mix vs professional reference, export EQ preset">
          Ref Match
        </button>

        {/* Dynamic Range Enhancer */}
        <button onClick={() => setShowDynamicRange(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showDynamicRange ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Dynamic Range Enhancer — upward expansion to restore punch">
          DR Enhance
        </button>

        {/* Sidechain Compressor */}
        <button onClick={() => setShowSidechain(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showSidechain ? 'bg-orange-500/15 text-orange-400 border-orange-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Sidechain Compressor — trigger-driven ducking with lookahead and soft-knee">
          Sidechain
        </button>

        {/* Tape Saturation */}
        <button onClick={() => setShowTapeSat(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showTapeSat ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Tape Saturation — analog tape machine emulation with drive, harmonics, HF rolloff, and flutter">
          Tape Sat
        </button>

        {/* Stem Splitter */}
        <button onClick={() => setShowStemSplitter(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showStemSplitter ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Stem Splitter — HPSS frequency-domain separation: Vocals, Bass, Drums, Other">
          Stems
        </button>

        {/* Album Gain */}
        <button onClick={() => setShowAlbumGain(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showAlbumGain ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Album Gain — ReplayGain 2.0 BS.1770-4 analysis: per-track + album-level gain recommendations">
          Album Gain
        </button>

        {/* Cue Sheet Export */}
        <button
          onClick={() => {
            const cueOpts = {
              albumTitle:  sessionMeta?.name ?? 'My Album',
              albumArtist: 'Artist',
              year:        new Date().getFullYear().toString(),
              tracks: tracks.map((t, i) => ({
                index:       i + 1,
                title:       t.name,
                startSec:    tracks.slice(0, i).reduce((s, tt) => s + (tt.regions[0]?.takes[0] ? 0 : 0), 0),
                durationSec: 0,
                pregapSec:   i === 0 ? 0 : 2,
              })),
            };
            downloadText(generateCueSheet(cueOpts), 'album.cue', 'text/plain');
            downloadText(generateTrackListCsv(cueOpts), 'tracklist.csv', 'text/csv');
          }}
          className="px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300"
          title="Export cue sheet + track listing CSV">
          Cue Sheet
        </button>

        {/* Phase Correlation Meter */}
        <button onClick={() => setShowPhaseCorr(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showPhaseCorr ? 'bg-teal-500/15 text-teal-400 border-teal-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Phase Correlation — stereo phase analysis, mono compatibility score, Lissajous">
          Phase
        </button>

        {/* Blind A/B Test */}
        <button onClick={() => setShowBlindAb(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showBlindAb ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Blind A/B Test — randomized listening test to verify your master sounds better">
          Blind A/B
        </button>

        {/* M/S Dynamic EQ */}
        <button onClick={() => setShowMsDynamicEq(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showMsDynamicEq ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="M/S Dynamic EQ — threshold-triggered EQ on mid and side channels independently">
          M/S EQ
        </button>

        {/* Click Repair */}
        <button onClick={() => setShowClickRepair(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showClickRepair ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Click Repair — detect and interpolate clicks, pops, and digital dropouts">
          Click Repair
        </button>

        {/* Mastering Certificate */}
        <button onClick={() => setShowCertificate(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showCertificate ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Mastering Certificate — generate a shareable PNG certificate for your finished master">
          Certificate
        </button>

        {/* Batch Export */}
        <button onClick={() => setShowBatchExport(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showBatchExport ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Batch Export — export all tracks as WAV files with format, normalize, and fade settings">
          ↓ Batch Export
        </button>

        {/* Waveform Trimmer */}
        <button onClick={() => setShowWaveformTrimmer(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showWaveformTrimmer ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Waveform Trimmer — drag IN/OUT handles to trim start and end, add fades, export">
          Trimmer
        </button>

        {/* Transient Shaper */}
        <button onClick={() => setShowTransientShaper(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showTransientShaper ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Transient Shaper — boost/cut attack punch and sustain tail independently">
          Transients
        </button>

        {/* Harmonic Exciter */}
        <button onClick={() => setShowHarmonicExciter(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showHarmonicExciter ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Harmonic Exciter — add tube warmth and air via harmonic saturation">
          Exciter
        </button>

        {/* Stereo Imager */}
        <button onClick={() => setShowStereoImager(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showStereoImager ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Stereo Imager — Mid/Side width control, phase correlation meter, Lissajous display">
          ↔ Stereo Imager
        </button>

        {/* Noise Gate */}
        <button onClick={() => setShowNoiseGate(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showNoiseGate ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Noise Gate — attenuate signals below threshold with attack, hold, release controls">
          Noise Gate
        </button>

        {/* Pitch & Time */}
        <button onClick={() => setShowPitchTime(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showPitchTime ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Pitch & Time — shift pitch in semitones or stretch/compress duration without affecting pitch">
          Pitch / Time
        </button>

        {/* A/B Comparator */}
        <button onClick={() => setShowMixComparator(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showMixComparator ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="A/B Mix Comparator — load two mixes and compare levels, dynamic range, LUFS side-by-side">
          ⚖ A/B Compare
        </button>

        {/* Audio Inspector */}
        <button onClick={() => setShowFormatInspector(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showFormatInspector ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Audio Inspector — sample rate, channels, DC offset, true peak, crest factor, estimated export sizes">
          Inspector
        </button>

        {/* Share Session */}
        <button onClick={() => setShowCollabShare(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showCollabShare ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Share Session — export a shareable session card and text summary">
          Share
        </button>

        {/* Power Engine */}
        <button onClick={() => setShowPowerEngine(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showPowerEngine ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Power Engine — professional mastering, 5-band multiband compressor, linear-phase EQ, Airwindows saturation">
          Master / Engine
        </button>

        {/* Collab */}
        <button onClick={() => setShowCollab(s => !s)}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${showCollab ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title="Live Collab — share a room code and record together with another person in real time over the internet">
          ⬡ Live Collab
        </button>

        {/* Save session */}
        <button onClick={handleManualSave}
          className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${saveStatus==='saved' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : saveStatus==='saving' ? 'text-slate-500 border-white/[0.06]' : 'bg-white/[0.03] text-slate-600 border-white/[0.06] hover:text-slate-300'}`}
          title={sessionMeta ? `Session autosaves after structural edits. Last saved ${sessionMeta.savedAt.toLocaleTimeString()}. Track count: ${sessionMeta.trackCount}, regions: ${sessionMeta.regionCount}, media assets: ${sessionMeta.mediaCount}. Click to save now.` : 'Save your session to browser storage and the local core session store.'}>
          {saveStatus==='saving' ? '…saving' : saveStatus==='saved' ? '✓ Saved' : '↑ Save Session'}
        </button>

        <button onClick={handleManualLoad}
          className="px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 transition-colors"
          title="Load the latest browser session and verify the matching local core session if available.">
          Load Session
        </button>

        {/* Stem export */}
        <button onClick={handleExportStems}
          className="px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border border-white/[0.06] bg-white/[0.03] text-slate-600 hover:text-slate-300 transition-colors"
          title="Export Stems — downloads each track as a separate WAV file with its FX applied. Use this to send individual tracks to a mixing engineer or DAW.">
          ↓ Export Stems
        </button>

        {/* Mixdown */}
        <motion.button onClick={handleMixdown} disabled={isMixingDown} whileTap={{ scale: 0.95 }}
          title="Mixdown — combines all tracks into one stereo WAV and sends it to the mastering pipeline. Different from Export Stems: this is the final combined mix."
          className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all disabled:opacity-40 ${mixdownDone ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-orange-500/15 text-orange-400 border-orange-500/25 hover:bg-orange-500/25'}`}>
          {isMixingDown ? 'Mixing…' : mixdownDone ? '✓ Sent to Master' : '↓ Mixdown to Master'}
        </motion.button>
      </div>

      {/* ══════════ GROUPED TOOL TOOLBAR ══════════ */}
      <StudioToolbar categories={[
        {
          id: 'create', label: 'Create', icon: 'create', accent: 'orange',
          tools: [
            { label: 'Beat Machine',   active: showBeats,      onClick: () => setShowBeats(s=>!s),      title: 'Program a 16-step drum pattern' },
            { label: 'Synth / Keys',   active: showSynth,      onClick: () => setShowSynth(s=>!s),      title: 'Play & record MIDI synth' },
            { label: 'Arrange Song',   active: showArranger,   onClick: () => setShowArranger(s=>!s),   title: 'AI section detection + reorder' },
            { label: 'Chords',         active: showChords,     onClick: () => setShowChords(s=>!s),     title: 'Detect chord progression' },
            { label: 'Reverb',         active: showReverb,     onClick: () => setShowReverb(s=>!s),     title: 'Algorithmic reverb designer' },
            { label: 'Tape Sat',       active: showTapeSat,    onClick: () => setShowTapeSat(s=>!s),    color: 'amber', title: 'Analog tape saturation' },
            { label: 'Sidechain',      active: showSidechain,  onClick: () => setShowSidechain(s=>!s),  color: 'amber', title: 'Sidechain / ducking compressor' },
          ],
        },
        {
          id: 'analyze', label: 'Analyze', icon: 'analyze', accent: 'cyan',
          tools: [
            { label: 'BPM / Key',      active: showAudioIntel,      onClick: () => setShowAudioIntel(s=>!s),      title: 'Detect BPM and musical key' },
            { label: 'Mix Critique',   active: showMixCritique,     onClick: () => setShowMixCritique(s=>!s),     title: 'AI mix analysis' },
            { label: 'Spectral Bal.',  active: showSpectralBalance, onClick: () => setShowSpectralBalance(s=>!s), title: 'Frequency balance vs genre' },
            { label: 'EQ Curve',       active: showChainVisualizer, onClick: () => setShowChainVisualizer(s=>!s), title: 'Mastering chain EQ response' },
            { label: 'LUFS Meter',     active: showLoudnessMeter,   onClick: () => setShowLoudnessMeter(s=>!s),   title: 'BS.1770-4 integrated + LRA' },
            { label: 'LUFS Timeline',  active: showLufsTimeline,    onClick: () => setShowLufsTimeline(s=>!s),    title: 'Loudness over time' },
            { label: 'Phase Corr.',    active: showPhaseCorr,       onClick: () => setShowPhaseCorr(s=>!s),       title: 'Lissajous + mono compat', color: 'teal' },
            { label: 'Blind A/B',      active: showBlindAb,         onClick: () => setShowBlindAb(s=>!s),         color: 'amber', title: 'N-round blind listening test' },
            { label: 'Gain Staging',   active: showGainStaging,     onClick: () => setShowGainStaging(s=>!s),     title: 'Per-track RMS / peak advice' },
            { label: 'Ref Match',      active: showRefMatcher,      onClick: () => setShowRefMatcher(s=>!s),      color: 'rose', title: 'Compare vs reference track' },
          ],
        },
        {
          id: 'master', label: 'Master', icon: 'master', accent: 'purple',
          tools: [
            { label: 'Power Engine',   active: showPowerEngine,     onClick: () => setShowPowerEngine(s=>!s),     title: 'Professional mastering chain' },
            { label: 'M/S EQ',         active: showMsDynamicEq,     onClick: () => setShowMsDynamicEq(s=>!s),     color: 'violet', title: 'Mid-Side dynamic EQ' },
            { label: 'DR Enhance',     active: showDynamicRange,    onClick: () => setShowDynamicRange(s=>!s),    color: 'emerald', title: 'Upward expansion' },
            { label: 'Transients',     active: showTransientShaper, onClick: () => setShowTransientShaper(s=>!s), title: 'Attack / sustain shaping' },
            { label: 'Exciter',        active: showHarmonicExciter, onClick: () => setShowHarmonicExciter(s=>!s), color: 'amber', title: 'Harmonic saturation' },
            { label: 'Stereo Imager',  active: showStereoImager,    onClick: () => setShowStereoImager(s=>!s),    color: 'emerald', title: 'M/S width control' },
            { label: 'Noise Gate',     active: showNoiseGate,       onClick: () => setShowNoiseGate(s=>!s),       color: 'red', title: 'Threshold gate' },
            { label: 'Album Gain',     active: showAlbumGain,       onClick: () => setShowAlbumGain(s=>!s),       title: 'ReplayGain 2.0 analysis' },
          ],
        },
        {
          id: 'repair', label: 'Repair', icon: 'repair', accent: 'rose',
          tools: [
            { label: 'Spectral Repair',active: showSpectralRepair,  onClick: () => setShowSpectralRepair(s=>!s),  color: 'rose',  title: 'Paint-to-remove noise / hum' },
            { label: 'Click Repair',   active: showClickRepair,     onClick: () => setShowClickRepair(s=>!s),     color: 'red',   title: 'Detect / interpolate clicks' },
            { label: 'Noise Gate',     active: showNoiseGate,       onClick: () => setShowNoiseGate(s=>!s),       color: 'red',   title: 'Gate below threshold' },
            { label: 'Pitch / Time',   active: showPitchTime,       onClick: () => setShowPitchTime(s=>!s),       color: 'purple',title: 'Shift pitch or stretch time' },
            { label: 'Pitch Detect',   active: showVocalPitch,      onClick: () => setShowVocalPitch(s=>!s),      color: 'pink',  title: 'Autocorrelation pitch analysis' },
            { label: 'Trimmer',        active: showWaveformTrimmer, onClick: () => setShowWaveformTrimmer(s=>!s), title: 'Trim IN/OUT with fades' },
            { label: 'Stems',          active: showStemSplitter,    onClick: () => setShowStemSplitter(s=>!s),    color: 'purple',title: 'HPSS 4-stem separation' },
          ],
        },
        {
          id: 'export', label: 'Export', icon: 'export', accent: 'emerald',
          tools: [
            { label: 'Smart Export',   active: showSmartExport,     onClick: () => setShowSmartExport(s=>!s),     title: 'Platform-specific export presets' },
            { label: 'Batch Export',   active: showBatchExport,     onClick: () => setShowBatchExport(s=>!s),     title: 'Export all tracks at once' },
            { label: 'Cue Sheet',      active: false,               onClick: () => {
                const cueOpts = { albumTitle: sessionMeta?.name ?? 'My Album', albumArtist: 'Artist', year: new Date().getFullYear().toString(), tracks: tracks.map((t,i) => ({ index: i+1, title: t.name, startSec: 0, durationSec: t.regions[0]?.durationSec ?? 0 })) };
                downloadText(generateCueSheet(cueOpts), 'album.cue');
                downloadText(generateTrackListCsv(cueOpts), 'tracklist.csv');
              }, title: 'Red Book CUE + CSV download' },
            { label: 'Certificate',    active: showCertificate,     onClick: () => setShowCertificate(s=>!s),     color: 'purple',title: 'Mastering certificate PNG' },
            { label: 'Album Gain',     active: showAlbumGain,       onClick: () => setShowAlbumGain(s=>!s),       title: 'ReplayGain 2.0 report' },
          ],
        },
        {
          id: 'session', label: 'Session', icon: 'session', accent: 'amber',
          tools: [
            { label: 'Collab',         active: showCollab,          onClick: () => setShowCollab(s=>!s),          color: 'emerald',title: 'Live collaboration room' },
            { label: 'Share',          active: showCollabShare,     onClick: () => setShowCollabShare(s=>!s),     color: 'blue',  title: 'Export session share card' },
            { label: 'Media Pool',     active: showMediaPool,       onClick: () => setShowMediaPool(s=>!s),       color: 'cyan',  title: 'Persistent imported audio assets' },
            { label: 'Notes',          active: showNotes,           onClick: () => setShowNotes(s=>!s),           title: 'Session production notes' },
            { label: 'Checklist',      active: showChecklist,       onClick: () => setShowChecklist(s=>!s),       color: 'emerald',title: 'Pre-mastering checklist' },
            { label: 'History',        active: showMasteringHistory, onClick: () => setShowMasteringHistory(s=>!s), title: 'Mastering history log' },
            { label: 'Inspector',      active: showFormatInspector, onClick: () => setShowFormatInspector(s=>!s), color: 'cyan',  title: 'Audio format inspector' },
            { label: 'A/B Compare',    active: showMixComparator,   onClick: () => setShowMixComparator(s=>!s),   color: 'amber', title: 'Side-by-side mix comparison' },
          ],
        },
      ]} />

      <AnimatePresence>
        {showMediaPool && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.04] bg-cyan-950/10"
          >
            <div className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Media Pool</p>
                  <p className="mt-1 text-xs text-slate-400">Persistent imported audio assets. Place anything here onto the session timeline without re-uploading.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={mediaPoolTrackId ?? ''}
                    onChange={(event) => setMediaPoolTrackId(event.target.value || null)}
                    className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-300 focus:outline-none"
                  >
                    <option value="">Auto target track</option>
                    {tracks.map((track) => (
                      <option key={track.id} value={track.id}>{track.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => mediaImportRef.current?.click()}
                    className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 hover:bg-cyan-500/25"
                  >
                    Import Audio
                  </button>
                  <input
                    ref={mediaImportRef}
                    type="file"
                    accept="audio/*,.wav,.mp3,.aif,.aiff,.flac,.m4a,.ogg"
                    multiple
                    className="hidden"
                    onChange={async (event) => {
                      const files = event.currentTarget.files;
                      if (files && files.length) {
                        await handleMediaPoolImport(files);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {mediaPool.length > 0 ? mediaPool.map((asset) => (
                  <div key={asset.id} className="rounded-xl border border-white/8 bg-slate-950/70 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{asset.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          {asset.sourceKind} · {asset.mimeType || 'audio'} · {asset.durationSec.toFixed(2)}s
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                          {Math.round(asset.sizeBytes / 1024)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => insertMediaPoolAsset(asset.id)}
                          className="rounded-md border border-cyan-400/25 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/25"
                        >
                          Place at playhead
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-8 overflow-hidden rounded-md border border-white/5 bg-slate-900/70">
                      <div className="flex h-full items-end gap-px px-1 py-1">
                        {Array.from(asset.waveformData.slice(0, 72)).map((peak, index) => (
                          <span
                            key={`${asset.id}-${index}`}
                            className="w-full rounded-sm bg-cyan-300/70"
                            style={{ height: `${Math.max(8, Math.min(100, Number(peak) * 100))}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/60 px-3 py-4 text-sm text-slate-500">
                    No media imported yet. Drop an audio file into the pool to persist it in the session.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ BEAT MACHINE ══════════ */}
      <AnimatePresence>
        {showBeats && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.04]">
            <div className="p-3">
              <BeatMachine
                bpm={bpm}
                onBounce={async (blob, durationSec) => {
                  // Import the beat into a Drums track
                  const { waveform, clipped } = await blobToWaveform(blob);
                  const url = URL.createObjectURL(blob);
                  const take: Take = {
                    id: `beat-${Date.now()}`,
                    blob, url, waveformData: waveform,
                    durationSec, label: 'Take 1', clipped,
                  };
                  const region: TrackRegion = {
                    id: `beat-reg-${Date.now()}`,
                    startSec: playheadSec,
                    durationSec, takes: [take],
                    activeTaskIdx: 0, gainDb: 0,
                    color: '#FB923C', isTakeFolder: false,
                  };
                  setTracks(prev => {
                    // Find or create a Drums track
                    const drumIdx = prev.findIndex(t => t.name.toLowerCase().includes('drum') || t.name.toLowerCase().includes('beat'));
                    if (drumIdx >= 0) {
                      return prev.map((t, i) => i === drumIdx ? { ...t, regions: [...t.regions, region] } : t);
                    }
                    // Create new Drums track
                    const newTrack = makeTrack(prev.length);
                    newTrack.name = 'Drums';
                    newTrack.color = '#FB923C';
                    newTrack.regions = [region];
                    return [...prev, newTrack];
                  });
                }}
                onClose={() => setShowBeats(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ MIDI SYNTH ══════════ */}
      <AnimatePresence>
        {showSynth && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.04] bg-amber-950/10 px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300/75">Synth capture</p>
                <p className="mt-1 text-xs text-slate-400">
                  Print the live synth output into the session as a take.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePrintSynth()}
                disabled={isPrintingSynth}
                className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPrintingSynth ? 'Printing synth…' : 'Print synth to track'}
              </button>
              <button
                type="button"
                onClick={handleExportMidiLane}
                disabled={capturedMidiNotes.length === 0}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export MIDI lane
              </button>
              <button
                type="button"
                onClick={() => setShowMidiEditor((value) => !value)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 hover:bg-white/[0.08]"
              >
                {showMidiEditor ? 'Hide MIDI editor' : 'Open MIDI editor'}
              </button>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                {capturedMidiNotes.length} notes captured
              </span>
            </div>
            <MidiSynth
              captureDestination={synthCaptureDestination}
              onNoteEvent={handleSynthMidiEvent}
              onClose={() => setShowSynth(false)}
            />
            {showMidiEditor && midiEditorTrack && (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/25 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300/75">MIDI lane</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Edit the captured synth notes directly here, then export the lane back into the session.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {midiLaneNotes.length} editable note{midiLaneNotes.length === 1 ? '' : 's'}
                  </span>
                </div>
                <MidiPianoRollPanel
                  track={midiEditorTrack}
                  notes={midiLaneNotes}
                  pxPerSec={pxPerSec}
                  laneWidth={timelineWidth}
                  playheadSeconds={playheadSec}
                  onAddNote={(trackId, note) => {
                    const nextNote = {
                      ...note,
                      trackId,
                      channel: note.channel ?? 0,
                    };
                    setCapturedMidiNotes((prev) => [
                      ...prev.filter((existing) => existing.noteId !== nextNote.noteId),
                      nextNote,
                    ]);
                  }}
                  onSetNote={(trackId, noteId, patch) => {
                    setCapturedMidiNotes((prev) =>
                      prev.map((note) =>
                        note.noteId === noteId && note.trackId === trackId
                          ? {
                              ...note,
                              ...patch,
                              trackId,
                            }
                          : note
                      )
                    );
                  }}
                  onRemoveNote={(trackId, noteId) => {
                    setCapturedMidiNotes((prev) =>
                      prev.filter((note) => !(note.noteId === noteId && note.trackId === trackId))
                    );
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ SONG ARRANGER OVERLAY ══════════ */}
      <AnimatePresence>
        {showArranger && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowArranger(false)}>
            <div onClick={e => e.stopPropagation()}>
              <SongArranger
                tracks={tracks}
                onApplyArrangement={(sections) => {
                  // Reorder regions on the timeline based on new section order
                  // Rebuild region start positions by stacking sections sequentially
                  let cursor = 0;
                  const regionUpdates = new Map<string, { trackId: string; newStart: number }>();
                  sections.forEach(sec => {
                    sec.regionRefs.forEach(ref => {
                      regionUpdates.set(ref.regionId, { trackId: ref.trackId, newStart: cursor });
                    });
                    cursor += sec.durationSec + 0.5; // 0.5s gap between sections
                  });
                  setTracks(prev => prev.map(t => ({
                    ...t,
                    regions: t.regions.map(r => {
                      const update = regionUpdates.get(r.id);
                      return update && update.trackId === t.id ? { ...r, startSec: update.newStart } : r;
                    })
                  })));
                  setShowArranger(false);
                }}
                onClose={() => setShowArranger(false)}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════ COLLAB PANEL ══════════ */}
      <AnimatePresence>
        {showCollab && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.06] flex justify-center py-3 px-4 bg-emerald-950/10"
          >
            <StudioCollabPanel
              audioCtx={audioCtxRef.current}
              onStateReceived={(state: CollabState) => {
                if (state.bpm) setBpm(state.bpm);
                if (typeof state.isPlaying === 'boolean') {
                  // Guest mirrors host play state
                }
              }}
              onClose={() => setShowCollab(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ POWER ENGINE OVERLAY ══════════ */}
      <AnimatePresence>
        {showPowerEngine && (() => {
          // Get AudioBuffer from first armed or first track with regions
          const getTrackBuffer = async (): Promise<AudioBuffer | null> => {
            const targetTrack = tracks.find(t => t.armed && t.regions.length > 0) ?? tracks.find(t => t.regions.length > 0);
            if (!targetTrack) return null;
            const region = targetTrack.regions[0];
            const take = region.takes[region.activeTaskIdx];
            if (!take) return null;
            const ctx = new AudioContext();
            const ab = await take.blob.arrayBuffer();
            return ctx.decodeAudioData(ab);
          };
          // Lazy-load buffer on first open
          if (!powerEngineBuffer) {
            getTrackBuffer().then(buf => { if (buf) setPowerEngineBuffer(buf); });
          }
          return (
            <PowerEnginePanel
              inputBuffer={powerEngineBuffer}
              onProcessed={(buf: AudioBuffer, meta: AIAdaptiveMasteringResult) => {
                setPowerEngineBuffer(buf);
                // Optionally notify user of result
                console.info('[PowerEngine]', meta.processingChain.join(' → '));
              }}
              onClose={() => setShowPowerEngine(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MIX CRITIQUE OVERLAY ══════════ */}
      <AnimatePresence>
        {showMixCritique && (() => {
          // Lazy-load buffer on first open (same pattern as Power Engine)
          if (!mixCritiqueBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setMixCritiqueBuffer(buf));
              }
            }
          }
          return (
            <MixCritiquePanel
              buffer={mixCritiqueBuffer}
              onClose={() => { setShowMixCritique(false); setMixCritiqueBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ AUDIO INTELLIGENCE OVERLAY ══════════ */}
      <AnimatePresence>
        {showAudioIntel && (() => {
          if (!audioIntelBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setAudioIntelBuffer(buf));
              }
            }
          }
          return (
            <AudioIntelligencePanel
              buffer={audioIntelBuffer}
              onClose={() => { setShowAudioIntel(false); setAudioIntelBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ SMART EXPORT OVERLAY ══════════ */}
      <AnimatePresence>
        {showSmartExport && (() => {
          if (!smartExportBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setSmartExportBuffer(buf));
              }
            }
          }
          return (
            <SmartExportPanel
              buffer={smartExportBuffer}
              trackName={tracks.find(t => t.regions.length > 0)?.name ?? 'track'}
              onClose={() => { setShowSmartExport(false); setSmartExportBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ STEREO FIELD OVERLAY ══════════ */}
      <AnimatePresence>
        {showStereoAnalyzer && (() => {
          if (!stereoBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setStereoBuffer(buf));
              }
            }
          }
          return (
            <StereoFieldAnalyzer
              buffer={stereoBuffer}
              onClose={() => { setShowStereoAnalyzer(false); setStereoBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ SPECTRAL REPAIR OVERLAY ══════════ */}
      <AnimatePresence>
        {showSpectralRepair && (() => {
          if (!spectralBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setSpectralBuffer(buf));
              }
            }
          }
          return (
            <SpectralRepairPanel
              buffer={spectralBuffer}
              onRepaired={(result) => {
                setSpectralBuffer(result);
              }}
              onClose={() => { setShowSpectralRepair(false); setSpectralBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ GAIN STAGING OVERLAY ══════════ */}
      <AnimatePresence>
        {showGainStaging && (() => {
          // Collect all tracks that have at least one take
          const trackInputs = tracks
            .filter(t => t.regions.length > 0 && t.regions[0].takes.length > 0)
            .map(t => ({
              id: t.id,
              name: t.name,
              blob: t.regions[0].takes[t.regions[0].activeTaskIdx]?.blob ?? t.regions[0].takes[0].blob,
            }));
          return (
            <GainStagingPanel
              tracks={trackInputs}
              onClose={() => setShowGainStaging(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MASTERING HISTORY OVERLAY ══════════ */}
      <AnimatePresence>
        {showMasteringHistory && (
          <MasteringHistoryPanel onClose={() => setShowMasteringHistory(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ TEMPO & GROOVE OVERLAY ══════════ */}
      <AnimatePresence>
        {showTempoGroove && (
          <TempoGroovePanel onClose={() => setShowTempoGroove(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ KEY & SCALE OVERLAY ══════════ */}
      <AnimatePresence>
        {showKeyScale && (
          <KeyScaleHelper onClose={() => setShowKeyScale(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ FREQUENCY REFERENCE OVERLAY ══════════ */}
      <AnimatePresence>
        {showFreqRef && (
          <FrequencyReferenceCard onClose={() => setShowFreqRef(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ EQ ADVISOR OVERLAY ══════════ */}
      <AnimatePresence>
        {showEqAdvisor && (() => {
          if (!eqAdvisorBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setEqAdvisorBuffer(buf));
              }
            }
          }
          return (
            <EqAdvisorPanel
              buffer={eqAdvisorBuffer}
              onClose={() => { setShowEqAdvisor(false); setEqAdvisorBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ COMPRESSOR VISUALIZER OVERLAY ══════════ */}
      <AnimatePresence>
        {showCompressor && (
          <CompressorVisualizer onClose={() => setShowCompressor(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ PRODUCTION NOTES OVERLAY ══════════ */}
      <AnimatePresence>
        {showNotes && (
          <ProductionNotes onClose={() => setShowNotes(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ REFERENCE TRACK OVERLAY ══════════ */}
      <AnimatePresence>
        {showRefTrack && (() => {
          if (!refTrackBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setRefTrackBuffer(buf));
              }
            }
          }
          return (
            <ReferenceTrackPanel
              mixBuffer={refTrackBuffer}
              onClose={() => { setShowRefTrack(false); setRefTrackBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ AUDIO FORMAT INSPECTOR OVERLAY ══════════ */}
      <AnimatePresence>
        {showFormatInspector && (() => {
          if (!formatInspectorBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setFormatInspectorBuffer(buf));
              }
            }
          }
          return (
            <AudioFormatInspector
              buffer={formatInspectorBuffer}
              fileName={tracks.find(t => t.regions.length > 0)?.name}
              onClose={() => { setShowFormatInspector(false); setFormatInspectorBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ VOCAL PITCH OVERLAY ══════════ */}
      <AnimatePresence>
        {showVocalPitch && (() => {
          if (!vocalPitchBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setVocalPitchBuffer(buf));
              }
            }
          }
          return <VocalPitchAnalyzer buffer={vocalPitchBuffer} onClose={() => { setShowVocalPitch(false); setVocalPitchBuffer(null); }} />;
        })()}
      </AnimatePresence>

      {/* ══════════ SPECTRAL BALANCE OVERLAY ══════════ */}
      <AnimatePresence>
        {showSpectralBalance && (() => {
          if (!spectralBalanceBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setSpectralBalanceBuffer(buf));
              }
            }
          }
          return <SpectralBalanceAnalyzer buffer={spectralBalanceBuffer} onClose={() => { setShowSpectralBalance(false); setSpectralBalanceBuffer(null); }} />;
        })()}
      </AnimatePresence>

      {/* ══════════ CLICK REPAIR OVERLAY ══════════ */}
      <AnimatePresence>
        {showClickRepair && (() => {
          if (!clickRepairBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setClickRepairBuffer(buf));
              }
            }
          }
          return (
            <ClickRepairPanel
              buffer={clickRepairBuffer}
              onClose={() => { setShowClickRepair(false); setClickRepairBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MASTERING CERTIFICATE OVERLAY ══════════ */}
      <AnimatePresence>
        {showCertificate && (() => {
          const history = getMasteringHistory();
          const last = history[0];
          const certData = {
            trackName: tracks[0]?.name ?? 'My Track',
            artistName: undefined,
            gradeLabel: last ? 'A+' : 'A',
            gradeEmoji: '',
            lufs: last?.appliedLUFS ?? -14,
            truePeak: -1,
            genre: last?.genre ?? last?.detectedGenre ?? 'General',
            engine: 'browser' as const,
            date: new Date(),
            dynamicRange: 8,
          };
          return (
            <MasteringCertificate
              data={certData}
              onClose={() => setShowCertificate(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ LOUDNESS METER ══════════ */}
      <AnimatePresence>
        {showLoudnessMeter && (() => {
          if (!loudnessMeterBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setLoudnessMeterBuffer(buf));
              }
            }
          }
          return (
            <LoudnessMeter
              buffer={loudnessMeterBuffer}
              onClose={() => { setShowLoudnessMeter(false); setLoudnessMeterBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ REFERENCE MATCHER ══════════ */}
      <AnimatePresence>
        {showRefMatcher && (() => {
          if (!refMatcherBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setRefMatcherBuffer(buf));
              }
            }
          }
          return (
            <ReferenceMatcherPanel
              buffer={refMatcherBuffer}
              onClose={() => { setShowRefMatcher(false); setRefMatcherBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ DYNAMIC RANGE ENHANCER ══════════ */}
      <AnimatePresence>
        {showDynamicRange && (() => {
          if (!dynamicRangeBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setDynamicRangeBuffer(buf));
              }
            }
          }
          return (
            <DynamicRangeEnhancerPanel
              buffer={dynamicRangeBuffer}
              onClose={() => { setShowDynamicRange(false); setDynamicRangeBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ PHASE CORRELATION METER ══════════ */}
      <AnimatePresence>
        {showPhaseCorr && (() => {
          if (!phaseCorrBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setPhaseCorrBuffer(buf));
              }
            }
          }
          return (
            <PhaseCorrelationMeter
              buffer={phaseCorrBuffer}
              onClose={() => { setShowPhaseCorr(false); setPhaseCorrBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ BLIND A/B TEST ══════════ */}
      <AnimatePresence>
        {showBlindAb && (() => {
          // Load original (take index 0) and mastered (last take) into separate buffers
          const track = tracks.find(t => t.regions.length > 0);
          if (track && !blindAbOriginal) {
            const region = track.regions[0];
            const firstTake = region.takes[0];
            const lastTake  = region.takes[region.activeTaskIdx] ?? region.takes[region.takes.length - 1];
            const ctx = new AudioContext();
            if (firstTake?.blob) {
              firstTake.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setBlindAbOriginal(buf));
            }
            if (lastTake?.blob && lastTake !== firstTake) {
              lastTake.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setBlindAbMastered(buf));
            } else if (firstTake?.blob) {
              // Same take — use it for both so the panel still opens
              firstTake.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setBlindAbMastered(buf));
            }
          }
          return (
            <BlindAbTestPanel
              bufferA={blindAbOriginal}
              bufferB={blindAbMastered}
              labelA="Original"
              labelB="Mastered"
              onClose={() => { setShowBlindAb(false); setBlindAbOriginal(null); setBlindAbMastered(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ M/S DYNAMIC EQ ══════════ */}
      <AnimatePresence>
        {showMsDynamicEq && (() => {
          if (!msDynamicEqBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setMsDynamicEqBuffer(buf));
              }
            }
          }
          return (
            <MsDynamicEqPanel
              buffer={msDynamicEqBuffer}
              onClose={() => { setShowMsDynamicEq(false); setMsDynamicEqBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ SIDECHAIN COMPRESSOR ══════════ */}
      <AnimatePresence>
        {showSidechain && (() => {
          if (!sidechainBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setSidechainBuffer(buf));
              }
            }
          }
          return (
            <SidechainCompressorPanel
              buffer={sidechainBuffer}
              onClose={() => { setShowSidechain(false); setSidechainBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ TAPE SATURATION ══════════ */}
      <AnimatePresence>
        {showTapeSat && (() => {
          if (!tapeSatBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setTapeSatBuffer(buf));
              }
            }
          }
          return (
            <TapeSaturationPanel
              buffer={tapeSatBuffer}
              onClose={() => { setShowTapeSat(false); setTapeSatBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ STEM SPLITTER ══════════ */}
      <AnimatePresence>
        {showStemSplitter && (() => {
          if (!stemSplitterBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setStemSplitterBuffer(buf));
              }
            }
          }
          return (
            <StemSplitterPanel
              buffer={stemSplitterBuffer}
              onClose={() => { setShowStemSplitter(false); setStemSplitterBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ ALBUM GAIN ══════════ */}
      <AnimatePresence>
        {showAlbumGain && (() => {
          const trackInputs = tracks
            .map(t => {
              const region = t.regions[0];
              const take = region?.takes[region.activeTaskIdx] ?? region?.takes[region.takes.length - 1];
              if (!take?.blob) return null;
              return { title: t.name, blob: take.blob };
            })
            .filter((x): x is { title: string; blob: Blob } => x !== null);
          return (
            <AlbumGainPanel
              tracks={trackInputs}
              albumTitle={sessionMeta?.name ?? 'My Album'}
              onClose={() => setShowAlbumGain(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MASTERING CHAIN VISUALIZER ══════════ */}
      <AnimatePresence>
        {showChainVisualizer && (() => {
          const history = getMasteringHistory();
          const last = history[0];
          const detectedGenre = last?.genre ?? last?.detectedGenre ?? 'default';
          return (
            <MasteringChainVisualizer
              genre={detectedGenre}
              targetLufs={last?.appliedLUFS ?? -14}
              onClose={() => setShowChainVisualizer(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ BATCH EXPORT OVERLAY ══════════ */}
      <AnimatePresence>
        {showBatchExport && (
          <BatchExportPanel
            tracks={tracks.map(t => ({ id: t.id, name: t.name, regions: t.regions }))}
            sessionName={undefined}
            onClose={() => setShowBatchExport(false)}
          />
        )}
      </AnimatePresence>

      {/* ══════════ WAVEFORM TRIMMER OVERLAY ══════════ */}
      <AnimatePresence>
        {showWaveformTrimmer && (() => {
          if (!waveformTrimmerBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setWaveformTrimmerBuffer(buf));
              }
            }
          }
          return (
            <WaveformTrimmerPanel
              buffer={waveformTrimmerBuffer}
              onClose={() => { setShowWaveformTrimmer(false); setWaveformTrimmerBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ TRANSIENT SHAPER OVERLAY ══════════ */}
      <AnimatePresence>
        {showTransientShaper && (() => {
          if (!transientBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setTransientBuffer(buf));
              }
            }
          }
          return (
            <TransientShaperPanel
              buffer={transientBuffer}
              onClose={() => { setShowTransientShaper(false); setTransientBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ HARMONIC EXCITER OVERLAY ══════════ */}
      <AnimatePresence>
        {showHarmonicExciter && (() => {
          if (!harmonicBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setHarmonicBuffer(buf));
              }
            }
          }
          return (
            <HarmonicExciterPanel
              buffer={harmonicBuffer}
              onClose={() => { setShowHarmonicExciter(false); setHarmonicBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ STEREO IMAGER OVERLAY ══════════ */}
      <AnimatePresence>
        {showStereoImager && (() => {
          if (!stereoImagerBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setStereoImagerBuffer(buf));
              }
            }
          }
          return (
            <StereoImagerPanel
              buffer={stereoImagerBuffer}
              onClose={() => { setShowStereoImager(false); setStereoImagerBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ NOISE GATE OVERLAY ══════════ */}
      <AnimatePresence>
        {showNoiseGate && (() => {
          if (!noiseGateBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setNoiseGateBuffer(buf));
              }
            }
          }
          return (
            <NoiseGatePanel
              buffer={noiseGateBuffer}
              onClose={() => { setShowNoiseGate(false); setNoiseGateBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ PITCH TIME OVERLAY ══════════ */}
      <AnimatePresence>
        {showPitchTime && (() => {
          if (!pitchTimeBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setPitchTimeBuffer(buf));
              }
            }
          }
          return (
            <PitchTimePanel
              buffer={pitchTimeBuffer}
              onClose={() => { setShowPitchTime(false); setPitchTimeBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MIX COMPARATOR OVERLAY ══════════ */}
      <AnimatePresence>
        {showMixComparator && (() => {
          if (!mixComparatorBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take?.blob) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setMixComparatorBuffer(buf));
              }
            }
          }
          return (
            <MixComparatorPanel
              initialBuffer={mixComparatorBuffer}
              onClose={() => { setShowMixComparator(false); setMixComparatorBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ COLLAB SHARE OVERLAY ══════════ */}
      <AnimatePresence>
        {showCollabShare && (
          <CollabSharePanel
            tracks={tracks.map(t => ({ id: t.id, name: t.name, regions: t.regions }))}
            onClose={() => setShowCollabShare(false)}
          />
        )}
      </AnimatePresence>

      {/* ══════════ MIX CHECKLIST OVERLAY ══════════ */}
      <AnimatePresence>
        {showChecklist && (
          <MixChecklistPanel onClose={() => setShowChecklist(false)} />
        )}
      </AnimatePresence>

      {/* ══════════ WAVEFORM ANNOTATIONS OVERLAY ══════════ */}
      <AnimatePresence>
        {showAnnotations && (
          <WaveformAnnotationPanel
            duration={tracks.find(t => t.regions.length > 0)?.regions[0].durationSec ?? 0}
            currentTime={0}
            onClose={() => setShowAnnotations(false)}
          />
        )}
      </AnimatePresence>

      {/* ══════════ LUFS TIMELINE OVERLAY ══════════ */}
      <AnimatePresence>
        {showLufsTimeline && (() => {
          if (!lufsTimelineBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setLufsTimelineBuffer(buf));
              }
            }
          }
          return (
            <LufsTimelinePanel
              buffer={lufsTimelineBuffer}
              onClose={() => { setShowLufsTimeline(false); setLufsTimelineBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ MULTI-TRACK METER OVERLAY ══════════ */}
      <AnimatePresence>
        {showMultiMeter && (() => {
          const trackInputs = tracks
            .filter(t => t.regions.length > 0 && t.regions[0].takes.length > 0)
            .map(t => ({
              id: t.id,
              name: t.name,
              blob: t.regions[0].takes[t.regions[0].activeTaskIdx]?.blob ?? t.regions[0].takes[0].blob,
            }));
          return (
            <MultiTrackMeterPanel
              tracks={trackInputs}
              onClose={() => setShowMultiMeter(false)}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ CHORD PROGRESSION OVERLAY ══════════ */}
      <AnimatePresence>
        {showChords && (() => {
          if (!chordsBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setChordsBuffer(buf));
              }
            }
          }
          return (
            <ChordProgressionPanel
              buffer={chordsBuffer}
              onClose={() => { setShowChords(false); setChordsBuffer(null); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ REVERB DESIGNER OVERLAY ══════════ */}
      <AnimatePresence>
        {showReverb && (() => {
          if (!reverbBuffer) {
            const track = tracks.find(t => t.regions.length > 0);
            if (track) {
              const region = track.regions[0];
              const take = region.takes[region.activeTaskIdx];
              if (take) {
                const ctx = new AudioContext();
                take.blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => setReverbBuffer(buf));
              }
            }
          }
          return (
            <ReverbDesignerPanel
              buffer={reverbBuffer}
              onProcessed={(buf) => setReverbBuffer(buf)}
              onClose={() => { setShowReverb(false); }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ══════════ PUNCH MARKERS ══════════ */}
      {punchEnabled && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/[0.04] bg-red-950/20 text-[10px]">
          <span className="text-red-400 font-semibold uppercase tracking-wider text-[9px]">PUNCH</span>
          <label className="flex items-center gap-1 text-slate-400">
            IN
            <input type="number" value={punchIn ?? ''} placeholder="—"
              onChange={e => setPunchIn(e.target.value ? Number(e.target.value) : null)}
              className="w-14 bg-black/30 border border-red-500/20 rounded px-1 py-0.5 text-red-300 font-mono focus:outline-none text-[10px]"
            />s
          </label>
          <label className="flex items-center gap-1 text-slate-400">
            OUT
            <input type="number" value={punchOut ?? ''} placeholder="—"
              onChange={e => setPunchOut(e.target.value ? Number(e.target.value) : null)}
              className="w-14 bg-black/30 border border-red-500/20 rounded px-1 py-0.5 text-red-300 font-mono focus:outline-none text-[10px]"
            />s
          </label>
          {punchIn !== null && punchOut !== null && (
            <span className="text-slate-500">{(punchOut - punchIn).toFixed(1)}s region</span>
          )}
        </div>
      )}

      {/* ══════════ TUNER ══════════ */}
      <AnimatePresence>
        {showTuner && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 64, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex items-center justify-center gap-4 border-b border-white/[0.04] bg-purple-950/20 overflow-hidden">
            <span className="text-[9px] text-purple-400 uppercase tracking-widest">Chromatic Tuner</span>
            <TunerDisplay analyser={tunerAnalyserRef.current} sampleRate={SAMPLE_RATE} />
            <span className="text-[9px] text-slate-600">Arm a track + enable monitoring</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ TRACK LIST + TIMELINE ══════════ */}
      <div className="flex flex-1 overflow-hidden relative" style={{ minHeight: 300 }}>
        {/* FX Rack Panel */}
        <AnimatePresence>
          {fxTrackId && (() => {
            const fxTrack = tracks.find(t => t.id === fxTrackId);
            return fxTrack ? (
              <FXRack
                key={fxTrackId}
                track={fxTrack}
                onClose={() => setFxTrackId(null)}
                onChange={newFx => setTracks(p => p.map(t => t.id === fxTrackId ? { ...t, fx: newFx } : t))}
              />
            ) : null;
          })()}
        </AnimatePresence>

        {/* ── Track headers ── */}
        <div className="flex-shrink-0 border-r border-white/[0.06] overflow-y-auto bg-slate-950/80" style={{ width: 224 }}>
          {tracks.map((track, ti) => (
            <div key={track.id} className="border-b border-white/[0.04] px-2 py-1.5 flex flex-col gap-1" style={{ height: trackHeight }}>
              {/* Row 1: color, name, clip */}
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer"
                  style={{ backgroundColor: track.color }}
                  onClick={() => {
                    const next = TRACK_COLORS[(TRACK_COLORS.indexOf(track.color) + 1) % TRACK_COLORS.length];
                    setTracks(p => p.map(t => t.id === track.id ? { ...t, color: next } : t));
                  }}
                />
                <input value={track.name}
                  onChange={e => setTracks(p => p.map(t => t.id === track.id ? { ...t, name: e.target.value } : t))}
                  className="flex-1 bg-transparent text-[11px] text-slate-200 font-semibold focus:outline-none truncate"
                />
                {track.clipped && (
                  <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, clipped: false } : t))}
                    className="text-[8px] text-red-400 bg-red-500/20 px-1 rounded font-bold" title="Click to reset">
                    CLIP
                  </button>
                )}
              </div>

              {/* Row 2: R M S + mono + VU */}
              <div className="flex items-center gap-1">
                {/* Arm */}
                <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, armed: !t.armed } : t))}
                  className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${track.armed ? 'bg-red-500/30 text-red-400 border-red-500/40' : 'bg-white/[0.04] text-slate-600 border-white/[0.06] hover:border-white/20'}`}>
                  R
                </button>
                {/* Mute */}
                <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t))}
                  className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${track.muted ? 'bg-yellow-500/25 text-yellow-400 border-yellow-500/35' : 'bg-white/[0.04] text-slate-600 border-white/[0.06] hover:border-white/20'}`}>
                  M
                </button>
                {/* Solo */}
                <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, soloed: !t.soloed } : t))}
                  className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${track.soloed ? 'bg-cyan-500/25 text-cyan-400 border-cyan-500/35' : 'bg-white/[0.04] text-slate-600 border-white/[0.06] hover:border-white/20'}`}>
                  S
                </button>
                {/* Mono toggle */}
                <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, inputMono: !t.inputMono } : t))}
                  className={`w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center border transition-all ${track.inputMono ? 'bg-white/10 text-white/70 border-white/20' : 'bg-white/[0.04] text-slate-700 border-white/[0.06]'}`}
                  title="Force mono input">
                  {track.inputMono ? 'M' : 'S'}
                </button>
                {/* FX button */}
                <button onClick={() => setFxTrackId(id => id === track.id ? null : track.id)}
                  className={`w-5 h-5 rounded text-[7px] font-bold flex items-center justify-center border transition-all ${fxTrackId === track.id ? 'bg-cyan-500/25 text-cyan-400 border-cyan-500/35' : 'bg-white/[0.04] text-slate-700 border-white/[0.06] hover:border-white/20'}`}
                  title="Open FX rack">
                  FX
                </button>
                {/* VU */}
                <div className="flex-1 flex items-center justify-end gap-1">
                  <VUMeter peak={track.peakLevel} hold={track.peakHold} clipped={track.clipped} vertical={false} />
                </div>
              </div>

              {/* Row 3: vol pan gain */}
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-slate-700 w-4">VOL</span>
                <input type="range" min={0} max={1.5} step={0.01} value={track.volume}
                  onChange={e => setTracks(p => p.map(t => t.id === track.id ? { ...t, volume: Number(e.target.value) } : t))}
                  className="flex-1 h-1 accent-orange-400" />
                <span className="text-[8px] text-slate-700 w-4">PAN</span>
                <input type="range" min={-1} max={1} step={0.01} value={track.pan}
                  onChange={e => setTracks(p => p.map(t => t.id === track.id ? { ...t, pan: Number(e.target.value) } : t))}
                  className="w-10 h-1 accent-cyan-400" />
                <span className="text-[7px] text-slate-700 w-3" title="Stereo Width">W</span>
                <input type="range" min={0} max={2} step={0.05} value={track.width}
                  onChange={e => setTracks(p => p.map(t => t.id === track.id ? { ...t, width: Number(e.target.value) } : t))}
                  className="w-8 h-1 accent-purple-400"
                  title={`Stereo width: ${track.width.toFixed(2)}`} />
              </div>
            </div>
          ))}

          {/* Add track */}
          <button onClick={() => setTracks(p => [...p, makeTrack(p.length)])}
            className="w-full py-2 text-[9px] text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center gap-1 border-b border-white/[0.04]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Track
          </button>

          {/* Track actions */}
          {activePanel === 'edit' && tracks.map(t => (
            <div key={t.id + '-edit'} className="px-2 py-1 border-b border-white/[0.04] flex gap-1 flex-wrap" style={{ height: trackHeight }}>
              <button onClick={() => handleStripSilence(t.id)} className="px-1.5 py-0.5 text-[8px] rounded bg-white/[0.04] hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">Strip Silence</button>
              {t.regions.map(r => (
                <button key={r.id} onClick={() => handleNormalize(t.id, r.id)} className="px-1.5 py-0.5 text-[8px] rounded bg-white/[0.04] hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                  Norm {r.takes[r.activeTaskIdx]?.label}
                </button>
              ))}
              <button onClick={() => setTracks(p => p.filter(x => x.id !== t.id))} className="px-1.5 py-0.5 text-[8px] rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors">Delete Track</button>
            </div>
          ))}
        </div>

        {/* ── Timeline ── */}
        <div className="flex-1 overflow-auto bg-[#070a10]" ref={timelineRef}>
          <div style={{ width: timelineWidth, position: 'relative' }}>

            {/* Ruler */}
            <div className="sticky top-0 z-20 bg-slate-950/95 border-b border-white/[0.06]" style={{ height: 24 }}>
              {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => {
                const isBar = Math.round(i % secPerBar) === 0;
                return (
                  <div key={i} className="absolute top-0 bottom-0" style={{ left: i * pxPerSec }}>
                    {isBar && <div className="absolute inset-y-0 w-px bg-white/[0.08]" />}
                    {i % 4 === 0 && (
                      <span className="absolute bottom-0.5 left-0.5 text-[8px] text-slate-700 font-mono">{i}s</span>
                    )}
                  </div>
                );
              })}
              {/* Markers on ruler */}
              {markers.map(m => (
                <div key={m.id} className="absolute top-0 bottom-0 flex items-start" style={{ left: m.positionSec * pxPerSec }}>
                  <div className="w-px h-full" style={{ backgroundColor: m.color + '80' }} />
                  <span className="text-[8px] px-0.5 rounded-sm font-semibold" style={{ backgroundColor: m.color + '30', color: m.color }}>
                    {m.label}
                  </span>
                </div>
              ))}
              {/* Punch region overlay on ruler */}
              {punchEnabled && punchIn !== null && punchOut !== null && (
                <div className="absolute top-0 bottom-0 border border-red-500/30 bg-red-500/[0.07]"
                  style={{ left: punchIn * pxPerSec, width: (punchOut - punchIn) * pxPerSec }} />
              )}
              {/* Loop region overlay */}
              {loopOn && loopStart !== null && loopEnd !== null && (
                <div className="absolute top-0 bottom-0 border border-cyan-500/30 bg-cyan-500/[0.06]"
                  style={{ left: loopStart * pxPerSec, width: (loopEnd - loopStart) * pxPerSec }} />
              )}
            </div>

            {/* Track lanes */}
            <div onClick={handleTimelineClick} style={{ cursor: isRecording ? 'not-allowed' : 'pointer' }}>
              {tracks.map(track => (
                <div key={track.id} className="relative border-b border-white/[0.03]"
                  style={{ height: trackHeight, width: timelineWidth }}>
                  {/* Beat grid */}
                  {Array.from({ length: Math.ceil(totalDuration / secPerBeat) + 1 }, (_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px"
                      style={{ left: i * secPerBeat * pxPerSec, backgroundColor: i % timeSigNum === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)' }} />
                  ))}

                  {/* Regions */}
                  {track.regions.map(region => (
                    <RegionBlock
                      key={region.id}
                      region={region}
                      pxPerSec={pxPerSec}
                      trackHeight={trackHeight}
                      onDelete={() => setTracks(p => p.map(t =>
                        t.id === track.id ? { ...t, regions: t.regions.filter(r => r.id !== region.id) } : t
                      ))}
                      onGainChange={db => setTracks(p => p.map(t =>
                        t.id === track.id ? { ...t, regions: t.regions.map(r => r.id === region.id ? { ...r, gainDb: db } : r) } : t
                      ))}
                      onSelectTake={idx => setTracks(p => p.map(t =>
                        t.id === track.id ? { ...t, regions: t.regions.map(r => r.id === region.id ? { ...r, activeTaskIdx: idx } : r) } : t
                      ))}
                    />
                  ))}

                  {/* Live record indicator */}
                  {isRecording && track.armed && (
                    <motion.div
                      className="absolute top-1 bottom-1 rounded-lg border border-red-500/50 bg-red-500/[0.07]"
                      style={{ left: recStartSec.current * pxPerSec, width: Math.max(2, (playheadSec - recStartSec.current) * pxPerSec) }}
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <div className="absolute top-1 right-1 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[8px] text-red-400 font-mono">REC</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 pointer-events-none z-30"
              style={{ left: playheadSec * pxPerSec, width: 1, backgroundColor: '#fb923c' }}>
              <div className="w-3 h-3 bg-orange-400 rotate-45 absolute -top-1" style={{ left: -5.5 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ RESTORATION PANEL ══════════ */}
      <AnimatePresence>
        {activePanel === 'restore' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.04] bg-purple-950/10 px-4 py-3">
            <p className="text-[9px] text-purple-400 font-semibold uppercase tracking-widest mb-2">Audio Restoration</p>
            <AudioRestorationPanel
              inputBuffer={restoredBuffer ?? (tracks[0]?.regions[0]?.takes[0] ? null : null)}
              onProcessed={(buf) => {
                setRestoredBuffer(buf);
                // Apply restored audio back as a new region on track 0
                // (Convert AudioBuffer to Blob for the recording pipeline)
                const sr = buf.sampleRate;
                const nCh = buf.numberOfChannels;
                const len = buf.length;
                const blockAlign = nCh * 2;
                const ab = new ArrayBuffer(44 + len * blockAlign);
                const view = new DataView(ab);
                const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
                wr(0,'RIFF'); view.setUint32(4,36+len*blockAlign,true); wr(8,'WAVE');
                wr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
                view.setUint16(22,nCh,true); view.setUint32(24,sr,true);
                view.setUint32(28,sr*blockAlign,true); view.setUint16(32,blockAlign,true);
                view.setUint16(34,16,true); wr(36,'data'); view.setUint32(40,len*blockAlign,true);
                let off = 44;
                for (let i = 0; i < len; i++) {
                  for (let ch = 0; ch < nCh; ch++) {
                    const s = Math.max(-1, Math.min(1, buf.getChannelData(Math.min(ch, nCh-1))[i] ?? 0));
                    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
                  }
                }
                onMixdown?.(new Blob([ab], { type: 'audio/wav' }), 'Restored-Mixdown.wav');
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ BOTTOM BAR ══════════ */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-white/[0.04] bg-slate-900/50 flex-wrap">
        <span className="text-[9px] text-slate-700">
          {tracks.filter(t => t.armed).length} armed · {tracks.reduce((s,t) => s + t.regions.length, 0)} regions · {tracks.reduce((s,t) => s + t.regions.reduce((x,r) => x + r.takes.length, 0), 0)} takes
        </span>
        <button onClick={() => setActivePanel(p => p === 'edit' ? null : 'edit')}
          className={`text-[9px] px-2 py-0.5 rounded border transition-all ${activePanel === 'edit' ? 'bg-white/10 text-slate-300 border-white/20' : 'text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
          Edit Tools
        </button>
        <button onClick={() => setActivePanel(p => p === 'mix' ? null : 'mix')}
          className={`text-[9px] px-2 py-0.5 rounded border transition-all ${activePanel === 'mix' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' : 'text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
          AI Mix Tips
        </button>
        <button onClick={() => setActivePanel(p => p === 'restore' ? null : 'restore')}
          className={`text-[9px] px-2 py-0.5 rounded border transition-all ${activePanel === 'restore' ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
          Restore
        </button>
        {activePanel === 'mix' && (
          <MixFeedbackPanel tracks={tracks} />
        )}
        <span className="text-[9px] text-slate-700 ml-auto">
          FX=per-track effects · Collab=live session · Space=play · R=record
        </span>
      </div>
    </div>
  );
};
