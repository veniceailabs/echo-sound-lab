import { AudioBufferLike, AudioContextLike, AudioPlaybackEngine } from './AudioPlaybackEngine';
import { ReplayState } from './deterministicReplayService';
import { assetRegistry } from './AssetRegistry';
import { createSignedRenderManifest, SignedRenderManifest } from './provenanceManifestService';
import { applySoftClipper, applyTruePeakLimiter } from './postProcessing';
import { TransparentCompressor } from './transparentCompressor';
import { renderQueueService } from './renderQueueService';
import {
  buildEmbeddedProvenanceReference,
  embedProvenanceReferenceInAudio,
} from './provenanceMetadataService';
import { verifyPreviewExportParity, PreviewExportParityReport } from './previewExportParityService';

interface RenderedAudioBufferLike extends AudioBufferLike {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

interface OfflineAudioContextLike extends AudioContextLike {
  startRendering(): Promise<RenderedAudioBufferLike>;
  decodeAudioData(audioData: ArrayBuffer): Promise<RenderedAudioBufferLike>;
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
  parityReport?: PreviewExportParityReport;
}

export interface OfflineRenderServiceOptions {
  createOfflineAudioContext?: (channelCount: number, frameCount: number, sampleRate: number) => OfflineAudioContextLike;
}

const EXPORT_SAMPLE_PEAK_CEILING_DB = -3;
const EXPORT_SAMPLE_PEAK_CEILING_LINEAR = Math.pow(10, EXPORT_SAMPLE_PEAK_CEILING_DB / 20);
const MAX_NORMALIZATION_TRIM_DB = 12;
const MIN_ADAPTIVE_MASTERING_GAP_DB = 1.25;

function updateExportLog(update: Record<string, unknown>) {
  if (typeof window !== 'undefined') {
    const log = (window as unknown as Record<string, unknown>).__eslExportLog as Record<string, unknown> | undefined;
    (window as unknown as Record<string, unknown>).__eslExportLog = { ...log, ...update };
  }
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

function getExportTrimGain(buffer: RenderedAudioBufferLike): number {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const length = Math.max(1, Math.floor(buffer.length || 0));
  let peakAbs = 0;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
    for (let frame = 0; frame < length; frame += 1) {
      const abs = Math.abs(data?.[frame] ?? 0);
      if (abs > peakAbs) peakAbs = abs;
    }
  }

  if (peakAbs <= 0 || peakAbs <= EXPORT_SAMPLE_PEAK_CEILING_LINEAR) {
    return 1;
  }

  return EXPORT_SAMPLE_PEAK_CEILING_LINEAR / peakAbs;
}

function applyGainToBuffer(buffer: RenderedAudioBufferLike, gainLinear: number): void {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const length = Math.max(1, Math.floor(buffer.length || 0));

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
    for (let frame = 0; frame < length; frame += 1) {
      data[frame] *= gainLinear;
    }
  }
}

function copyChannelData(
  source: Float32Array,
  target: Float32Array,
): void {
  const limit = Math.min(source.length, target.length);
  target.set(source.subarray(0, limit), 0);
}

function getSamplePeakDb(buffer: RenderedAudioBufferLike): number {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const length = Math.max(1, Math.floor(buffer.length || 0));
  let peakAbs = 0;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
    for (let frame = 0; frame < length; frame += 1) {
      const abs = Math.abs(data?.[frame] ?? 0);
      if (abs > peakAbs) peakAbs = abs;
    }
  }

  if (peakAbs <= 0) return -Infinity;
  return 20 * Math.log10(peakAbs);
}

function getIntegratedRmsDb(buffer: RenderedAudioBufferLike): number {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const length = Math.max(1, Math.floor(buffer.length || 0));
  let sumSquares = 0;
  let samples = 0;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
    for (let frame = 0; frame < length; frame += 1) {
      const sample = data?.[frame] ?? 0;
      sumSquares += sample * sample;
      samples += 1;
    }
  }

  if (samples === 0 || sumSquares <= 0) return -Infinity;
  return 10 * Math.log10(sumSquares / samples);
}

function applyAdaptiveMasterCompression(
  buffer: RenderedAudioBufferLike,
  measuredProgramDb: number,
  targetProgramDb: number,
): void {
  const loudnessGap = targetProgramDb - measuredProgramDb;
  if (!Number.isFinite(loudnessGap) || loudnessGap < MIN_ADAPTIVE_MASTERING_GAP_DB) {
    return;
  }

  const samplePeakDb = getSamplePeakDb(buffer);
  const crestDb = Number.isFinite(samplePeakDb) ? samplePeakDb - measuredProgramDb : loudnessGap;
  if (crestDb < 9.5 && loudnessGap < 2.5) {
    return;
  }

  const ratio = Math.max(2.5, Math.min(8, 2.4 + loudnessGap * 0.85 + Math.max(0, crestDb - 10) * 0.18));
  const threshold = Math.max(-30, Math.min(-11, measuredProgramDb + 1.25));
  const compressor = new TransparentCompressor({
    threshold,
    ratio,
    attack: 8,
    release: 110,
    kneeWidth: 8,
    lookahead: 5,
  }, buffer.sampleRate);

  if (buffer.numberOfChannels <= 1) {
    const processed = compressor.process(buffer.getChannelData(0));
    copyChannelData(processed, buffer.getChannelData(0));
    return;
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const linked = compressor.processStereo(left, right);
  copyChannelData(linked.left, left);
  copyChannelData(linked.right, right);

  for (let channel = 2; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const processed = compressor.process(data);
    copyChannelData(processed, data);
  }
}

function getTimelineMasteringIntent(state: ReplayState): { targetLUFS: number | null; limiterCeilingDb: number } {
  const normalizedTrack = [...state.tracks].reverse().find((track) => Number.isFinite(track.normalizedTargetLUFS));
  const limitedTrack = [...state.tracks].reverse().find((track) => Number.isFinite(track.limiterThresholdDb));

  const targetLUFS = normalizedTrack && Number.isFinite(normalizedTrack.normalizedTargetLUFS)
    ? Number(normalizedTrack.normalizedTargetLUFS)
    : null;
  const limiterCeilingDb = limitedTrack && Number.isFinite(limitedTrack.limiterThresholdDb)
    ? Math.min(Number(limitedTrack.limiterThresholdDb), EXPORT_SAMPLE_PEAK_CEILING_DB)
    : EXPORT_SAMPLE_PEAK_CEILING_DB;

  return { targetLUFS, limiterCeilingDb };
}

async function applyTimelineMasteringTargets(buffer: RenderedAudioBufferLike, state: ReplayState): Promise<void> {
  const { targetLUFS, limiterCeilingDb } = getTimelineMasteringIntent(state);
  const renderedAudioBuffer = buffer as unknown as AudioBuffer;

  if (targetLUFS !== null) {
    const measuredRmsDb = getIntegratedRmsDb(buffer);
    const targetRmsDb = targetLUFS - 2.6;
    const rmsGapDb = Number.isFinite(measuredRmsDb) ? targetRmsDb - measuredRmsDb : 0;
    const samplePeakDb = getSamplePeakDb(buffer);
    const crestDb = Number.isFinite(samplePeakDb) && Number.isFinite(measuredRmsDb)
      ? samplePeakDb - measuredRmsDb
      : 0;

    if (Number.isFinite(measuredRmsDb)) {
      if (rmsGapDb > MIN_ADAPTIVE_MASTERING_GAP_DB || (crestDb > 14 && rmsGapDb > 0.75)) {
        applyAdaptiveMasterCompression(buffer, measuredRmsDb, targetRmsDb);
      }
      const postCompressionRmsDb = getIntegratedRmsDb(buffer);
      const postRmsGapDb = Number.isFinite(postCompressionRmsDb) ? targetRmsDb - postCompressionRmsDb : rmsGapDb;
      const gainDb = Math.max(
        -MAX_NORMALIZATION_TRIM_DB,
        Math.min(MAX_NORMALIZATION_TRIM_DB, postRmsGapDb)
      );

      if (Math.abs(gainDb) > 0.1) {
        applyGainToBuffer(buffer, Math.pow(10, gainDb / 20));
      }
      if (crestDb > 12 && postRmsGapDb > 1.5) {
        applyGainToBuffer(buffer, Math.pow(10, Math.min(4, postRmsGapDb * 0.72) / 20));
        applySoftClipper(renderedAudioBuffer, {
          enabled: true,
          threshold: Math.max(-7, limiterCeilingDb - 0.5),
          softness: 0.88,
        });
      }
      if (gainDb > MIN_ADAPTIVE_MASTERING_GAP_DB || (crestDb > 14 && postRmsGapDb > 0.5)) {
        applySoftClipper(renderedAudioBuffer, {
          enabled: true,
          threshold: Math.max(-9, limiterCeilingDb - Math.min(3, Math.max(1, gainDb * 0.45))),
          softness: Math.max(0.42, Math.min(0.8, 0.46 + gainDb * 0.04)),
        });
      }
    }
  }

  applyTruePeakLimiter(renderedAudioBuffer, {
    enabled: true,
    ceiling: limiterCeilingDb,
    oversampleFactor: 4,
  });
}

function encodeAudioBufferToWav(buffer: RenderedAudioBufferLike, bitDepth: 16 | 24 | 32 = 16): Blob {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const sampleRate = Math.max(8000, Math.floor(buffer.sampleRate || 44100));
  const length = Math.max(1, Math.floor(buffer.length || sampleRate));
  const bitsPerSample = bitDepth;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const fileSize = 44 + dataSize;
  const audioFormat = bitDepth === 32 ? 3 : 1; // 3 = IEEE_FLOAT, 1 = PCM
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
  view.setUint16(offset, audioFormat, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitsPerSample, true); offset += 2;
  writeAscii('data');
  view.setUint32(offset, dataSize, true); offset += 4;

  const channelData = Array.from({ length: channels }, (_, idx) => buffer.getChannelData(Math.min(idx, buffer.numberOfChannels - 1)));
  const exportGain = getExportTrimGain(buffer);
  for (let frame = 0; frame < length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clampSample((channelData[channel]?.[frame] ?? 0) * exportGain);
      if (bitDepth === 32) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const int24 = Math.max(-8388608, Math.min(8388607, Math.round(sample * 8388607)));
        view.setUint8(offset,     int24 & 0xFF);
        view.setUint8(offset + 1, (int24 >> 8) & 0xFF);
        view.setUint8(offset + 2, (int24 >> 16) & 0xFF);
        offset += 3;
      } else {
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
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
    const jobId = `offline-render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return renderQueueService.enqueue({
      jobId,
      label: request.audioFileName || 'timeline-export',
      run: () => this.renderTimelineToWavInternal(request),
      cleanup: () => {
        updateExportLog({ status: 'queue_idle', jobId });
      },
    });
  }

  private async renderTimelineToWavInternal(request: OfflineRenderRequest): Promise<OfflineRenderResult> {
    const state = request.timelineState;
    const sampleRate = Number((state.metadata as Record<string, unknown> | undefined)?.sampleRate || 44100);
    const channelCount = Math.max(1, Math.min(8, Number((state.metadata as Record<string, unknown> | undefined)?.channelCount || 2)));
    const durationSec = state.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 0);
    const safeDurationSec = durationSec > 0 ? durationSec : 0.1;
    const frameCount = Math.max(1, Math.ceil(safeDurationSec * sampleRate));

    console.log('[OfflineRender] Export starting', { sampleRate, channelCount, durationSec: safeDurationSec, frameCount });
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__eslExportLog = {
        startTime: Date.now(),
        status: 'init',
      };
    }

    const offlineContext = this.createOfflineAudioContext(channelCount, frameCount, sampleRate);
    const engine = new AudioPlaybackEngine({
      createAudioContext: async () => offlineContext,
    });

    try {
      updateExportLog({ status: 'engine_init' });
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

      updateExportLog({ status: 'sync_state' });
      await engine.syncState(state);
      updateExportLog({ status: 'playing' });
      engine.playFrom(0);
      updateExportLog({ status: 'rendering' });
      console.log('[OfflineRender] Starting offline render...');
      const rendered = await offlineContext.startRendering();
      updateExportLog({ status: 'render_complete', renderedLength: rendered.length });
      console.log('[OfflineRender] Render complete, applying mastering...', { length: rendered.length, sr: rendered.sampleRate });

      // Capture a pre-mastering snapshot as the "preview" reference buffer before
      // mastering alters the signal. We snapshot up to 10 s to keep it fast.
      let parityReport: PreviewExportParityReport | undefined;
      const previewSnapshotLength = Math.min(rendered.length, rendered.sampleRate * 10);
      const previewSnapshot = new AudioBuffer({
        length: previewSnapshotLength,
        sampleRate: rendered.sampleRate,
        numberOfChannels: rendered.numberOfChannels,
      });
      for (let ch = 0; ch < rendered.numberOfChannels; ch += 1) {
        previewSnapshot.getChannelData(ch).set(
          rendered.getChannelData(Math.min(ch, rendered.numberOfChannels - 1)).subarray(0, previewSnapshotLength),
        );
      }

      await applyTimelineMasteringTargets(rendered, state);
      updateExportLog({ status: 'mastering_complete' });
      console.log('[OfflineRender] Mastering complete, running parity check...');

      // Build an equivalent post-mastering snapshot for comparison.
      const exportSnapshot = new AudioBuffer({
        length: previewSnapshotLength,
        sampleRate: rendered.sampleRate,
        numberOfChannels: rendered.numberOfChannels,
      });
      for (let ch = 0; ch < rendered.numberOfChannels; ch += 1) {
        exportSnapshot.getChannelData(ch).set(
          rendered.getChannelData(Math.min(ch, rendered.numberOfChannels - 1)).subarray(0, previewSnapshotLength),
        );
      }

      try {
        parityReport = await verifyPreviewExportParity(previewSnapshot, exportSnapshot);
        if (!parityReport.passed) {
          console.warn('[OfflineRenderService] Preview/export parity failed:', parityReport.reasons);
        } else {
          console.log('[OfflineRenderService] Preview/export parity OK.');
        }
      } catch (parityErr) {
        console.warn('[OfflineRenderService] Parity check threw an error (non-fatal):', parityErr);
      }

      updateExportLog({ status: 'parity_checked', parityPassed: parityReport?.passed ?? null });
      console.log('[OfflineRender] Encoding WAV...');
      const audioBlob = encodeAudioBufferToWav(rendered);
      updateExportLog({ status: 'wav_encoded', blobSize: audioBlob.size });
      console.log('[OfflineRender] WAV encoded', { size: audioBlob.size });

      const audioFileName = sanitizeExportName(request.audioFileName || `timeline-export-${Date.now()}.wav`);
      const parsed = splitFileName(audioFileName);
      const manifestFileName = `${parsed.baseName}.manifest.json`;
      updateExportLog({ status: 'signing_manifest' });
      console.log('[OfflineRender] Creating signed manifest...');
      const signedManifest = await createSignedRenderManifest(audioFileName, 'wav', request.creatorId);
      updateExportLog({ status: 'embedding_provenance' });
      console.log('[OfflineRender] Embedding provenance...');
      const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);
      const embeddedAudioBlob = await embedProvenanceReferenceInAudio(audioBlob, audioFileName, reference);
      updateExportLog({ status: 'manifest_blob_created', embeddedSize: embeddedAudioBlob.size });
      console.log('[OfflineRender] Creating manifest blob...', { audioFileName, manifestFileName });
      const manifestBlob = new Blob([JSON.stringify(signedManifest, null, 2)], { type: 'application/json' });
      updateExportLog({ status: 'ready_to_download', manifestSize: manifestBlob.size });

      if (request.autoDownload !== false) {
        updateExportLog({ status: 'downloading', audioFileName, manifestFileName });
        console.log('[OfflineRender] Triggering downloads...', { audioFileName, manifestFileName });
        triggerDownload(embeddedAudioBlob, audioFileName);
        triggerDownload(manifestBlob, manifestFileName);
        updateExportLog({ status: 'downloads_triggered' });
        console.log('[OfflineRender] Downloads triggered');
      }

      return {
        audioFileName,
        manifestFileName,
        signedManifest,
        audioBlob: embeddedAudioBlob,
        manifestBlob,
        durationSec: safeDurationSec,
        parityReport,
      };
    } finally {
      engine.dispose();
    }
  }
}

export const offlineRenderService = new OfflineRenderService();
