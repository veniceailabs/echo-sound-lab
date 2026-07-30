/**
 * BatchDropZone — Sprint 4D
 * Standalone drag-and-drop batch processor.
 * Accepts audio files, processes each via audioEngine, downloads zip.
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProcessingConfig } from '../types';
import { audioEngine } from '../services/audioEngine';

type TrackStatus = 'queued' | 'processing' | 'done' | 'error';

interface BatchTrack {
  id: string;
  file: File;
  status: TrackStatus;
  errorMessage?: string;
  processedBuffer?: AudioBuffer;
}

interface BatchDropZoneProps {
  config?: ProcessingConfig;
  onClose?: () => void;
}

const STATUS_COLORS: Record<TrackStatus, string> = {
  queued: 'bg-slate-700/70 text-slate-300',
  processing: 'bg-amber-500/15 text-amber-300',
  done: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-rose-500/15 text-rose-300',
};

const ACCEPT_TYPES = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/mp3', 'audio/x-wav', 'audio/x-flac'];

async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }
}

async function renderWithConfig(buffer: AudioBuffer, config: ProcessingConfig): Promise<AudioBuffer> {
  return audioEngine.renderProcessedAudio(config, buffer);
}

async function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): Promise<ArrayBuffer> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const audioFormat = bitDepth === 32 ? 3 : 1; // 3 = IEEE_FLOAT, 1 = PCM

  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wavBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
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
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
  }

  return wavBuffer;
}

async function downloadAsZip(tracks: BatchTrack[]): Promise<void> {
  const doneTracks = tracks.filter(t => t.status === 'done' && t.processedBuffer);

  if (doneTracks.length === 0) return;

  // Try CompressionStream zip (not natively available) — use concatenated downloads as fallback
  // Web platform doesn't have a native zip API, so we use multiple individual downloads
  // or a simple uncompressed ZIP using manual construction

  // Manual ZIP construction (PKZIP format, no compression = store)
  async function buildZip(files: Array<{ name: string; data: ArrayBuffer }>): Promise<Uint8Array> {
    const localHeaders: Uint8Array[] = [];
    const centralDirs: Uint8Array[] = [];
    const offsets: number[] = [];
    let offset = 0;

    function uint16LE(n: number): number[] {
      return [n & 0xFF, (n >> 8) & 0xFF];
    }
    function uint32LE(n: number): number[] {
      return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF];
    }

    function crc32(buffer: Uint8Array): number {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < buffer.length; i++) {
        crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const fileData = new Uint8Array(file.data);
      const crc = crc32(fileData);
      const fileSize = fileData.length;

      // Local file header
      const localHeader = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, // signature
        ...uint16LE(20),         // version needed
        ...uint16LE(0),          // flags
        ...uint16LE(0),          // compression (store)
        ...uint16LE(0),          // mod time
        ...uint16LE(0),          // mod date
        ...uint32LE(crc),
        ...uint32LE(fileSize),   // compressed size
        ...uint32LE(fileSize),   // uncompressed size
        ...uint16LE(nameBytes.length),
        ...uint16LE(0),          // extra field length
        ...Array.from(nameBytes),
      ]);

      offsets.push(offset);
      localHeaders.push(localHeader);
      localHeaders.push(fileData);
      offset += localHeader.length + fileData.length;

      // Central directory
      const centralDir = new Uint8Array([
        0x50, 0x4B, 0x01, 0x02, // signature
        ...uint16LE(20),         // version made by
        ...uint16LE(20),         // version needed
        ...uint16LE(0),          // flags
        ...uint16LE(0),          // compression
        ...uint16LE(0),          // mod time
        ...uint16LE(0),          // mod date
        ...uint32LE(crc),
        ...uint32LE(fileSize),
        ...uint32LE(fileSize),
        ...uint16LE(nameBytes.length),
        ...uint16LE(0),          // extra
        ...uint16LE(0),          // comment
        ...uint16LE(0),          // disk
        ...uint16LE(0),          // internal attr
        ...uint32LE(0),          // external attr
        ...uint32LE(offsets[offsets.length - 1]), // offset of local header
        ...Array.from(nameBytes),
      ]);
      centralDirs.push(centralDir);
    }

    const centralDirOffset = offset;
    const centralDirSize = centralDirs.reduce((s, d) => s + d.length, 0);

    // End of central directory
    const eocd = new Uint8Array([
      0x50, 0x4B, 0x05, 0x06,
      ...uint16LE(0),            // disk number
      ...uint16LE(0),            // disk with central dir
      ...uint16LE(files.length), // entries on disk
      ...uint16LE(files.length), // total entries
      ...uint32LE(centralDirSize),
      ...uint32LE(centralDirOffset),
      ...uint16LE(0),            // comment length
    ]);

    // Concatenate everything
    const parts = [...localHeaders, ...centralDirs, eocd];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let writeOffset = 0;
    for (const part of parts) {
      result.set(part, writeOffset);
      writeOffset += part.length;
    }
    return result;
  }

  const fileEntries: Array<{ name: string; data: ArrayBuffer }> = [];
  for (const track of doneTracks) {
    if (!track.processedBuffer) continue;
    const wav = await audioBufferToWav(track.processedBuffer);
    const baseName = track.file.name.replace(/\.[^.]+$/, '');
    fileEntries.push({ name: `${baseName}_mastered.wav`, data: wav });
  }

  if (fileEntries.length === 0) return;

  if (fileEntries.length === 1) {
    // Single file — direct download
    const blob = new Blob([fileEntries[0].data], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileEntries[0].name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }

  // Multiple files — build zip
  const zipData = await buildZip(fileEntries);
  const blob = new Blob([zipData], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'echo_mastered_tracks.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const BatchDropZone: React.FC<BatchDropZoneProps> = ({ config = {}, onClose }) => {
  const [tracks, setTracks] = useState<BatchTrack[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const audioFiles = files.filter(f =>
      ACCEPT_TYPES.includes(f.type) || f.name.match(/\.(wav|mp3|flac|aac|m4a)$/i)
    );
    const newTracks: BatchTrack[] = audioFiles.map(f => ({
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      status: 'queued',
    }));
    setTracks(prev => [...prev, ...newTracks]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  }, [addFiles]);

  const processTrack = async (trackId: string): Promise<void> => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'processing' } : t));

    try {
      const track = tracks.find(t => t.id === trackId);
      if (!track) throw new Error('Track not found');

      const buffer = await decodeFile(track.file);
      const processed = await renderWithConfig(buffer, config);

      setTracks(prev => prev.map(t =>
        t.id === trackId ? { ...t, status: 'done', processedBuffer: processed } : t
      ));
    } catch (err: any) {
      setTracks(prev => prev.map(t =>
        t.id === trackId ? { ...t, status: 'error', errorMessage: err.message ?? 'Processing failed' } : t
      ));
    }
  };

  const handleProcessAll = async () => {
    if (isProcessingAll) return;
    setIsProcessingAll(true);

    const queued = tracks.filter(t => t.status === 'queued' || t.status === 'error');
    for (const track of queued) {
      await processTrack(track.id);
    }

    setIsProcessingAll(false);
  };

  const handleDownloadAll = async () => {
    await downloadAsZip(tracks);
  };

  const handleRemoveTrack = (trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const handleClear = () => {
    setTracks([]);
  };

  const doneCount = tracks.filter(t => t.status === 'done').length;
  const queuedCount = tracks.filter(t => t.status === 'queued').length;
  const errorCount = tracks.filter(t => t.status === 'error').length;
  const processingCount = tracks.filter(t => t.status === 'processing').length;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/55 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Batch processing</p>
          <h3 className="mt-1 text-lg font-bold text-white">Drop Files to Master</h3>
        </div>
        <div className="flex items-center gap-2">
          {tracks.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Clear all
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-cyan-500/60 bg-cyan-500/10'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-sm text-slate-400">
          {isDragging ? 'Drop audio files here' : 'Drag audio files here, or click to browse'}
        </p>
        <p className="text-xs text-slate-600 mt-1">WAV, MP3, FLAC supported</p>
      </div>

      {/* Stats */}
      {tracks.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Queued', value: queuedCount, color: 'text-slate-300' },
            { label: 'Processing', value: processingCount, color: 'text-amber-300' },
            { label: 'Done', value: doneCount, color: 'text-emerald-300' },
            { label: 'Errors', value: errorCount, color: 'text-rose-300' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{stat.label}</div>
              <div className={`mt-1 text-lg font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Track List */}
      <AnimatePresence>
        {tracks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2 max-h-64 overflow-y-auto pr-1"
          >
            {tracks.map(track => (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="rounded-xl border border-white/10 bg-slate-900/70 p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{track.file.name}</div>
                  {track.errorMessage && (
                    <div className="text-xs text-rose-400 mt-0.5">{track.errorMessage}</div>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${STATUS_COLORS[track.status]}`}>
                  {track.status}
                </span>
                <button
                  onClick={() => handleRemoveTrack(track.id)}
                  className="text-slate-600 hover:text-slate-300 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      {tracks.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcessAll}
            disabled={isProcessingAll || queuedCount === 0 && errorCount === 0}
            className="flex-1 px-4 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-sm hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessingAll
              ? `Processing… (${processingCount} active)`
              : `Process All (${queuedCount + errorCount} tracks)`}
          </button>
          {doneCount > 0 && (
            <button
              onClick={handleDownloadAll}
              className="flex-1 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm hover:bg-emerald-500/30 transition-colors"
            >
              {doneCount === 1 ? 'Download WAV' : `Download All (${doneCount}) as ZIP`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BatchDropZone;
