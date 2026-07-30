import type { ProcessingConfig } from '../types';
import { audioEngine } from './audioEngine';
import { downloadAudioWithManifest, type ExportWithManifestResult } from './audioExportService';
import { encoderService } from './encoderService';

export interface ResolveMasterExportBufferOptions {
  processedBuffer?: AudioBuffer | null;
  sourceBuffer?: AudioBuffer | null;
  config?: ProcessingConfig | null;
}

export interface ResolveMasterExportBufferResult {
  buffer: AudioBuffer;
  source: 'processed' | 'rerendered' | 'original';
}

export interface ExportMasterWithManifestOptions extends ResolveMasterExportBufferOptions {
  format: 'wav' | 'mp3';
  audioFileName: string;
  creatorId?: string;
}

export interface ExportMasterWithManifestResult extends ExportWithManifestResult {
  source: ResolveMasterExportBufferResult['source'];
}

function hasRenderableProcessing(config?: ProcessingConfig | null): boolean {
  return Boolean(config && Object.keys(config).length > 0);
}

export async function resolveMasterExportBuffer(
  options: ResolveMasterExportBufferOptions,
): Promise<ResolveMasterExportBufferResult> {
  if (options.processedBuffer) {
    return { buffer: options.processedBuffer, source: 'processed' };
  }

  if (options.sourceBuffer && hasRenderableProcessing(options.config)) {
    const rerendered = await audioEngine.renderProcessedAudio(options.config as ProcessingConfig, options.sourceBuffer);
    return { buffer: rerendered, source: 'rerendered' };
  }

  if (options.sourceBuffer) {
    return { buffer: options.sourceBuffer, source: 'original' };
  }

  throw new Error('No audio buffer available for export.');
}

export async function exportMasterWithManifest(
  options: ExportMasterWithManifestOptions,
): Promise<ExportMasterWithManifestResult> {
  const resolved = await resolveMasterExportBuffer(options);
  const audioBlob = options.format === 'mp3'
    ? await encoderService.exportAsMp3(resolved.buffer, 320)
    : await encoderService.exportAsWav(resolved.buffer);

  const result = await downloadAudioWithManifest({
    audioBlob,
    audioFileName: options.audioFileName,
    creatorId: options.creatorId,
  });

  return {
    ...result,
    source: resolved.source,
  };
}
