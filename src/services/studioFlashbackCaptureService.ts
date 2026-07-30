export interface StudioFlashbackCaptureSnapshot {
  id: string;
  capturedAt: number;
  label: string;
  sourceFileName: string | null;
  playheadSeconds: number;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
  chainSignature: string | null;
  renderPath: string | null;
  isPlaying: boolean;
  buffer: AudioBuffer;
}

export interface StudioFlashbackCaptureManifestEntry {
  id: string;
  capturedAt: number;
  label: string;
  sourceFileName: string | null;
  playheadSeconds: number;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
  chainSignature: string | null;
  renderPath: string | null;
  isPlaying: boolean;
}

const MAX_FLASHBACK_SNAPSHOTS = 12;

let flashbackSnapshots: StudioFlashbackCaptureSnapshot[] = [];

function buildSnapshotId(): string {
  return `flashback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function captureStudioFlashbackSnapshot(input: {
  buffer: AudioBuffer | null;
  label: string;
  sourceFileName: string | null;
  playheadSeconds: number;
  chainSignature: string | null;
  renderPath: string | null;
  isPlaying: boolean;
}): StudioFlashbackCaptureSnapshot | null {
  if (!input.buffer) return null;
  const snapshot: StudioFlashbackCaptureSnapshot = {
    id: buildSnapshotId(),
    capturedAt: Date.now(),
    label: input.label.trim() || 'Flashback Capture',
    sourceFileName: input.sourceFileName,
    playheadSeconds: Number.isFinite(input.playheadSeconds) ? input.playheadSeconds : 0,
    durationSec: Number.isFinite(input.buffer.duration) ? input.buffer.duration : 0,
    sampleRate: Number.isFinite(input.buffer.sampleRate) ? input.buffer.sampleRate : 44100,
    channelCount: Number.isFinite(input.buffer.numberOfChannels) ? input.buffer.numberOfChannels : 2,
    chainSignature: input.chainSignature,
    renderPath: input.renderPath,
    isPlaying: input.isPlaying,
    buffer: input.buffer,
  };
  flashbackSnapshots = [snapshot, ...flashbackSnapshots].slice(0, MAX_FLASHBACK_SNAPSHOTS);
  return snapshot;
}

export function getStudioFlashbackSnapshots(): StudioFlashbackCaptureSnapshot[] {
  return [...flashbackSnapshots];
}

export function getLatestStudioFlashbackSnapshot(): StudioFlashbackCaptureSnapshot | null {
  return flashbackSnapshots[0] ?? null;
}

export function clearStudioFlashbackSnapshots(): StudioFlashbackCaptureSnapshot[] {
  flashbackSnapshots = [];
  return [];
}

export function serializeStudioFlashbackManifestJson(snapshots: StudioFlashbackCaptureSnapshot[]): string {
  const manifest: StudioFlashbackCaptureManifestEntry[] = snapshots.map((snapshot) => ({
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    label: snapshot.label,
    sourceFileName: snapshot.sourceFileName,
    playheadSeconds: snapshot.playheadSeconds,
    durationSec: snapshot.durationSec,
    sampleRate: snapshot.sampleRate,
    channelCount: snapshot.channelCount,
    chainSignature: snapshot.chainSignature,
    renderPath: snapshot.renderPath,
    isPlaying: snapshot.isPlaying,
  }));
  return JSON.stringify({
    exportedAt: Date.now(),
    snapshots: manifest,
  }, null, 2);
}

