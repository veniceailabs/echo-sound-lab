/**
 * Session Share Service — Sprint 4B
 * Serialize session state → gzip → base64url → URL hash
 * Decode on load → restore state in viewer mode
 */

import { ProcessingConfig, AudioMetrics } from '../types';

export interface ShareableSession {
  fileName: string;
  currentConfig: ProcessingConfig;
  originalMetrics: AudioMetrics | null;
  echoReportSummary: string | null;
  sharedAt: number;
  version: number;
}

const SHARE_VERSION = 1;
const HASH_PREFIX = '#share=';

/**
 * Check if CompressionStream is available (Chrome 80+, Firefox 113+)
 */
function isCompressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * Gzip compress a string using CompressionStream API
 */
async function gzipCompress(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Gzip decompress a Uint8Array using DecompressionStream API
 */
async function gzipDecompress(input: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(input);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

/**
 * Convert Uint8Array to base64url string
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert base64url string to Uint8Array
 */
function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const padded2 = remainder > 0 ? padded + '='.repeat(4 - remainder) : padded;
  const binary = atob(padded2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Serialize session state to URL hash string
 */
export async function encodeSessionToHash(session: ShareableSession): Promise<string> {
  const json = JSON.stringify({ ...session, version: SHARE_VERSION });

  let encoded: string;
  if (isCompressionSupported()) {
    const compressed = await gzipCompress(json);
    encoded = toBase64Url(compressed);
  } else {
    // Fallback: plain base64
    encoded = btoa(encodeURIComponent(json));
  }

  return `${HASH_PREFIX}${encoded}`;
}

/**
 * Decode a URL hash to session state
 * Returns null if hash is not a valid share link
 */
export async function decodeHashToSession(hash: string): Promise<ShareableSession | null> {
  if (!hash.startsWith(HASH_PREFIX)) return null;

  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;

  try {
    let json: string;
    if (isCompressionSupported()) {
      const bytes = fromBase64Url(encoded);
      json = await gzipDecompress(bytes);
    } else {
      json = decodeURIComponent(atob(encoded));
    }

    const parsed = JSON.parse(json);
    if (!parsed || parsed.version !== SHARE_VERSION) return null;
    return parsed as ShareableSession;
  } catch (err) {
    console.warn('[sessionShareService] Failed to decode share hash:', err);
    return null;
  }
}

/**
 * Check current page URL for a share hash and decode it
 */
export async function loadShareFromCurrentURL(): Promise<ShareableSession | null> {
  if (typeof window === 'undefined') return null;
  return decodeHashToSession(window.location.hash);
}

/**
 * Generate a shareable URL for the current session
 */
export async function generateShareURL(
  fileName: string,
  currentConfig: ProcessingConfig,
  originalMetrics: AudioMetrics | null,
  echoReportSummary: string | null
): Promise<string> {
  const session: ShareableSession = {
    fileName,
    currentConfig,
    originalMetrics,
    echoReportSummary,
    sharedAt: Date.now(),
    version: SHARE_VERSION,
  };

  const hash = await encodeSessionToHash(session);
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `${baseUrl}${hash}`;
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

// ─── Rich Share (with audio) ──────────────────────────────────────────────────
import { supabase } from '../lib/supabase';

export interface RichShare {
  id: string;
  fileName: string;
  audioUrl: string | null;
  originalAudioUrl: string | null;
  config: ProcessingConfig;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  echoSummary: string | null;
  sharedAt: number;
}

const SHARE_BUCKET = 'shares';

/**
 * Upload audio buffer to Supabase storage and get public URL
 */
async function uploadAudioBuffer(
  buffer: AudioBuffer,
  shareId: string,
  label: 'original' | 'processed'
): Promise<string | null> {
  try {
    // Encode to WAV
    const wav = audioBufferToWav(buffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const path = `${shareId}/${label}.wav`;

    const { error } = await supabase.storage
      .from(SHARE_BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'audio/wav' });

    if (error) return null;

    const { data } = supabase.storage.from(SHARE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

/**
 * Generate rich share URL with audio stored in Supabase
 */
export async function generateRichShareURL(
  fileName: string,
  config: ProcessingConfig,
  originalMetrics: AudioMetrics | null,
  processedMetrics: AudioMetrics | null,
  echoSummary: string | null,
  originalBuffer: AudioBuffer | null,
  processedBuffer: AudioBuffer | null
): Promise<string> {
  const shareId = crypto.randomUUID();

  // Upload audio in parallel
  const [audioUrl, originalAudioUrl] = await Promise.all([
    processedBuffer ? uploadAudioBuffer(processedBuffer, shareId, 'processed') : Promise.resolve(null),
    originalBuffer ? uploadAudioBuffer(originalBuffer, shareId, 'original') : Promise.resolve(null),
  ]);

  // Store share metadata as JSON in storage
  const share: RichShare = {
    id: shareId,
    fileName,
    audioUrl,
    originalAudioUrl,
    config,
    originalMetrics,
    processedMetrics,
    echoSummary,
    sharedAt: Date.now(),
  };

  const metaBlob = new Blob([JSON.stringify(share)], { type: 'application/json' });
  await supabase.storage
    .from(SHARE_BUCKET)
    .upload(`${shareId}/meta.json`, metaBlob, { upsert: true, contentType: 'application/json' });

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return `${baseUrl}#richshare=${shareId}`;
}

/**
 * Load a rich share by ID
 */
export async function loadRichShare(shareId: string): Promise<RichShare | null> {
  try {
    const { data: url } = supabase.storage
      .from(SHARE_BUCKET)
      .getPublicUrl(`${shareId}/meta.json`);

    const resp = await fetch(url.publicUrl + '?t=' + Date.now());
    if (!resp.ok) return null;
    return await resp.json() as RichShare;
  } catch {
    return null;
  }
}

/**
 * Detect rich share ID in current URL
 */
export function getRichShareIdFromURL(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith('#richshare=')) {
    return hash.slice('#richshare='.length) || null;
  }
  return null;
}

// ─── Minimal WAV encoder ──────────────────────────────────────────────────────
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = Math.min(buffer.numberOfChannels, 2);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = numCh * (bitsPerSample / 8);
  const byteRate = sr * blockAlign;
  const dataLen = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);

  const write = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  write(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return ab;
}
