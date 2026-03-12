import { AudioBufferLike, AudioContextLike, AudioPlaybackEngine } from './AudioPlaybackEngine';
import { ReplayState } from './deterministicReplayService';
import { assetRegistry } from './AssetRegistry';
import { createSignedRenderManifest, SignedRenderManifest } from './provenanceManifestService';
import {
  buildEmbeddedProvenanceReference,
  embedProvenanceReferenceInAudio,
} from './provenanceMetadataService';

interface RenderedAudioBufferLike extends AudioBufferLike {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

interface OfflineAudioContextLike extends AudioContextLike {
  startRendering(): Promise<RenderedAudioBufferLike>;
}

export interface OfflineRenderRequest {
  timelineState: ReplayState;
  audioFileName?: string;
  creatorId?: string;
  fallbackRegionBuffers?: Record<string, AudioBufferLike>;
  autoDownload?: boolean;
}

export interface OfflineRenderResult {
  audioFileName: string;
  manifestFileName: string;
  signedManifest: SignedRenderManifest;
  audioBlob: Blob;
  manifestBlob: Blob;
  durationSec: number;
}

export interface OfflineRenderServiceOptions {
  createOfflineAudioContext?: (channelCount: number, frameCount: number, sampleRate: number) => OfflineAudioContextLike;
}

function getOfflineContextFactory():
  (channelCount: number, frameCount: number, sampleRate: number) => OfflineAudioContextLike {
  return (channelCount, frameCount, sampleRate) => {
    const globalScope = globalThis as unknown as {
      OfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => OfflineAudioContextLike;
      webkitOfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => OfflineAudioContextLike;
    };
    const Ctor = globalScope.OfflineAudioContext || globalScope.webkitOfflineAudioContext;
    if (!Ctor) {
      throw new Error('OFFLINE_AUDIO_CONTEXT_UNAVAILABLE');
    }
    return new Ctor(channelCount, frameCount, sampleRate);
  };
}

function sanitizeExportName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return 'timeline-export.wav';
  return trimmed.toLowerCase().endsWith('.wav') ? trimmed : `${trimmed}.wav`;
}

function splitFileName(fileName: string): { baseName: string; extension: string } {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx === fileName.length - 1) {
    return { baseName: fileName, extension: 'wav' };
  }
  return {
    baseName: fileName.slice(0, idx),
    extension: fileName.slice(idx + 1).toLowerCase(),
  };
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clampSample(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function encodeAudioBufferToWav(buffer: RenderedAudioBufferLike): Blob {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const sampleRate = Math.max(8000, Math.floor(buffer.sampleRate || 44100));
  const length = Math.max(1, Math.floor(buffer.length || sampleRate));
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const fileSize = 44 + dataSize;
  const out = new ArrayBuffer(fileSize);
  const view = new DataView(out);

  let offset = 0;
  const writeAscii = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  };

  writeAscii('RIFF');
  view.setUint32(offset, fileSize - 8, true); offset += 4;
  writeAscii('WAVE');
  writeAscii('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitsPerSample, true); offset += 2;
  writeAscii('data');
  view.setUint32(offset, dataSize, true); offset += 4;

  const channelData = Array.from({ length: channels }, (_, idx) => buffer.getChannelData(Math.min(idx, buffer.numberOfChannels - 1)));
  for (let frame = 0; frame < length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clampSample(channelData[channel]?.[frame] ?? 0);
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}

export class OfflineRenderService {
  private readonly createOfflineAudioContext: (channelCount: number, frameCount: number, sampleRate: number) => OfflineAudioContextLike;

  constructor(options: OfflineRenderServiceOptions = {}) {
    this.createOfflineAudioContext = options.createOfflineAudioContext || getOfflineContextFactory();
  }

  async renderTimelineToWav(request: OfflineRenderRequest): Promise<OfflineRenderResult> {
    const state = request.timelineState;
    const sampleRate = Number((state.metadata as Record<string, unknown> | undefined)?.sampleRate || 44100);
    const channelCount = Math.max(1, Math.min(8, Number((state.metadata as Record<string, unknown> | undefined)?.channelCount || 2)));
    const durationSec = state.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 0);
    const safeDurationSec = durationSec > 0 ? durationSec : 0.1;
    const frameCount = Math.max(1, Math.ceil(safeDurationSec * sampleRate));

    const offlineContext = this.createOfflineAudioContext(channelCount, frameCount, sampleRate);
    const engine = new AudioPlaybackEngine({
      createAudioContext: async () => offlineContext,
    });

    try {
      await engine.init();

      const fallbackBuffers = request.fallbackRegionBuffers || {};
      for (const [sourceId, buffer] of Object.entries(fallbackBuffers)) {
        engine.setRegionBuffer(sourceId, buffer);
      }

      const uniqueSourceIds = Array.from(new Set(state.regions.map((region) => region.sourceId)));
      for (const sourceId of uniqueSourceIds) {
        if (!sourceId || fallbackBuffers[sourceId]) continue;
        const cached = assetRegistry.getDecodedBuffer(sourceId);
        if (cached) {
          engine.setRegionBuffer(sourceId, cached);
          continue;
        }
        const decoded = await assetRegistry.ensureDecodedBuffer(sourceId, offlineContext);
        if (decoded) {
          engine.setRegionBuffer(sourceId, decoded);
        }
      }

      await engine.syncState(state);
      engine.playFrom(0);
      const rendered = await offlineContext.startRendering();
      const audioBlob = encodeAudioBufferToWav(rendered);

      const audioFileName = sanitizeExportName(request.audioFileName || `timeline-export-${Date.now()}.wav`);
      const parsed = splitFileName(audioFileName);
      const manifestFileName = `${parsed.baseName}.manifest.json`;
      const signedManifest = await createSignedRenderManifest(audioFileName, 'wav', request.creatorId);
      const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);
      const embeddedAudioBlob = await embedProvenanceReferenceInAudio(audioBlob, audioFileName, reference);
      const manifestBlob = new Blob([JSON.stringify(signedManifest, null, 2)], { type: 'application/json' });

      if (request.autoDownload !== false) {
        triggerDownload(embeddedAudioBlob, audioFileName);
        triggerDownload(manifestBlob, manifestFileName);
      }

      return {
        audioFileName,
        manifestFileName,
        signedManifest,
        audioBlob: embeddedAudioBlob,
        manifestBlob,
        durationSec: safeDurationSec,
      };
    } finally {
      engine.dispose();
    }
  }
}

export const offlineRenderService = new OfflineRenderService();
