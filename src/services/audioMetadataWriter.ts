/**
 * audioMetadataWriter — Embed professional metadata into WAV exports
 *
 * Writes two metadata layers:
 *
 * 1. RIFF INFO chunk — standard WAV metadata (title, artist, software, date)
 *    Uses LIST/INFO sub-chunks: INAM, IART, IPRD, ICRD, ISFT, ICMT
 *
 * 2. ID3v2 tag block appended after RIFF data — picked up by iTunes, VLC, Rekordbox
 *    Frames written: TIT2, TPE1, TCON, TDRC, TXXX (ReplayGain gain + peak),
 *    TXXX (iTunNORM), TXXX (Loudness) per EBU R128.
 *
 * ReplayGain values are computed from the measured integrated LUFS:
 *   RG gain = -18 - integratedLufs   (targets -18 LUFS for ReplayGain reference)
 *
 * All writes go into a new ArrayBuffer — the input WAV ArrayBuffer is not mutated.
 */

export interface AudioMetadataTags {
  title?:          string;
  artist?:         string;
  album?:          string;
  genre?:          string;
  year?:           string;
  comment?:        string;
  integratedLufs?: number;   // e.g. -14.2
  truePeakDb?:     number;   // e.g. -0.3
  lra?:            number;   // e.g. 8.1
  software?:       string;   // defaults to "Echo Sound Lab 2.5"
}

// ── RIFF INFO chunk helpers ──────────────────────────────────────────────────

function encodeAscii(str: string, maxLen?: number): Uint8Array {
  const s = maxLen ? str.slice(0, maxLen) : str;
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function writeU32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i) & 0xff);
  }
}

/** Build a RIFF LIST/INFO chunk as a Uint8Array */
function buildRiffInfoChunk(tags: AudioMetadataTags): Uint8Array {
  const software = tags.software ?? 'Echo Sound Lab 2.5';
  const comment = [
    tags.comment ?? '',
    tags.integratedLufs != null ? `LUFS=${tags.integratedLufs.toFixed(1)}` : '',
    tags.truePeakDb    != null ? `TP=${tags.truePeakDb.toFixed(1)}dBTP`   : '',
    tags.lra           != null ? `LRA=${tags.lra.toFixed(1)}LU`           : '',
  ].filter(Boolean).join(' | ');

  const pairs: [string, string][] = [
    ['INAM', tags.title   ?? ''],
    ['IART', tags.artist  ?? ''],
    ['IPRD', tags.album   ?? ''],
    ['IGNR', tags.genre   ?? ''],
    ['ICRD', tags.year    ?? new Date().getFullYear().toString()],
    ['ISFT', software],
    ['ICMT', comment],
  ].filter(([, v]) => v.length > 0) as [string, string][];

  // Each sub-chunk: 4-byte tag + 4-byte size + data (padded to even)
  let dataSize = 4; // 'INFO'
  for (const [, val] of pairs) {
    const len = val.length + 1; // +1 for null terminator
    dataSize += 8 + len + (len % 2); // tag + size + data + optional pad byte
  }

  const buf = new ArrayBuffer(8 + dataSize); // 'LIST' + size + content
  const view = new DataView(buf);
  writeString(view, 0, 'LIST');
  writeU32LE(view, 4, dataSize);
  writeString(view, 8, 'INFO');

  let off = 12;
  for (const [tag, val] of pairs) {
    const bytes = encodeAscii(val);
    const payloadLen = bytes.length + 1; // +1 null byte
    writeString(view, off, tag);
    writeU32LE(view, off + 4, payloadLen);
    off += 8;
    for (let i = 0; i < bytes.length; i++) view.setUint8(off + i, bytes[i]);
    view.setUint8(off + bytes.length, 0); // null terminator
    off += payloadLen;
    if (payloadLen % 2 !== 0) off++; // RIFF pad byte
  }

  return new Uint8Array(buf);
}

// ── ID3v2.3 helpers ──────────────────────────────────────────────────────────

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function syncsafeInt(n: number): number[] {
  return [
    (n >> 21) & 0x7f,
    (n >> 14) & 0x7f,
    (n >>  7) & 0x7f,
     n        & 0x7f,
  ];
}

/** Build a single ID3v2.3 frame (encoding byte 0x03 = UTF-8) */
function id3Frame(frameId: string, content: string): Uint8Array {
  const enc = encodeUtf8(content);
  const size = 1 + enc.length; // encoding byte + content
  const frame = new Uint8Array(10 + size);
  const view = new DataView(frame.buffer);
  writeString(view, 0, frameId);
  writeU32LE(view, 4, size); // ID3v2.3 uses plain 32-bit, not syncsafe
  // bytes 8-9: flags (both 0)
  frame[10] = 0x03; // UTF-8 encoding byte
  frame.set(enc, 11);
  return frame;
}

/** Build a TXXX (user text) frame: description\0value */
function id3TxxxFrame(description: string, value: string): Uint8Array {
  const descBytes = encodeUtf8(description);
  const valBytes  = encodeUtf8(value);
  const size = 1 + descBytes.length + 1 + valBytes.length;
  const frame = new Uint8Array(10 + size);
  const view = new DataView(frame.buffer);
  writeString(view, 0, 'TXXX');
  writeU32LE(view, 4, size);
  frame[10] = 0x03; // UTF-8
  frame.set(descBytes, 11);
  frame[11 + descBytes.length] = 0x00; // null separator
  frame.set(valBytes, 11 + descBytes.length + 1);
  return frame;
}

/** Build a full ID3v2.3 tag block */
function buildId3Tag(tags: AudioMetadataTags): Uint8Array {
  const software = tags.software ?? 'Echo Sound Lab 2.5';
  const frames: Uint8Array[] = [];

  if (tags.title)  frames.push(id3Frame('TIT2', tags.title));
  if (tags.artist) frames.push(id3Frame('TPE1', tags.artist));
  if (tags.album)  frames.push(id3Frame('TALB', tags.album));
  if (tags.genre)  frames.push(id3Frame('TCON', tags.genre));
  if (tags.year)   frames.push(id3Frame('TDRC', tags.year));
  frames.push(id3Frame('TSSE', software));

  // ReplayGain (track) — reference -18 LUFS
  if (tags.integratedLufs != null) {
    const rgGain = (-18.0 - tags.integratedLufs);
    frames.push(id3TxxxFrame(
      'replaygain_track_gain',
      `${rgGain >= 0 ? '+' : ''}${rgGain.toFixed(2)} dB`,
    ));
  }
  if (tags.truePeakDb != null) {
    const rgPeak = Math.pow(10, tags.truePeakDb / 20);
    frames.push(id3TxxxFrame('replaygain_track_peak', rgPeak.toFixed(6)));
  }

  // EBU R128 loudness (used by newer players: Rekordbox, djay)
  if (tags.integratedLufs != null) {
    frames.push(id3TxxxFrame('EBU R128 TRACK GAIN', `${tags.integratedLufs.toFixed(1)} LUFS`));
  }
  if (tags.lra != null) {
    frames.push(id3TxxxFrame('EBU R128 TRACK RANGE', `${tags.lra.toFixed(1)} LU`));
  }

  // Custom Echo Sound Lab tag
  frames.push(id3TxxxFrame('MASTERING_ENGINE', software));

  // Compute total frames size
  let framesSize = 0;
  for (const f of frames) framesSize += f.length;

  // ID3v2.3 header: 10 bytes
  const header = new Uint8Array(10);
  header[0] = 0x49; header[1] = 0x44; header[2] = 0x33; // 'ID3'
  header[3] = 0x03; header[4] = 0x00; // version 2.3.0
  header[5] = 0x00; // no flags
  const ss = syncsafeInt(framesSize);
  header[6] = ss[0]; header[7] = ss[1]; header[8] = ss[2]; header[9] = ss[3];

  const total = new Uint8Array(10 + framesSize);
  total.set(header, 0);
  let off = 10;
  for (const f of frames) { total.set(f, off); off += f.length; }
  return total;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inject RIFF INFO chunk and ID3v2.3 tag into a WAV ArrayBuffer.
 *
 * The input must be a valid RIFF/WAVE file.
 * Returns a new ArrayBuffer with metadata embedded.
 *
 * RIFF INFO is inserted before the `data` chunk (standard).
 * ID3v2 tag is prepended before the RIFF header (Apple/iTunes convention)
 * so iTunes, Finder, and iOS pick it up without breaking WAV compatibility.
 */
export function injectWavMetadata(
  wavBuffer: ArrayBuffer,
  tags: AudioMetadataTags,
): ArrayBuffer {
  const src = new Uint8Array(wavBuffer);
  const srcView = new DataView(wavBuffer);

  // Validate RIFF header
  const riffSig = String.fromCharCode(src[0], src[1], src[2], src[3]);
  if (riffSig !== 'RIFF') return wavBuffer; // not a WAV, return unmodified

  // Build metadata chunks
  const infoChunk = buildRiffInfoChunk(tags);
  const id3Tag    = buildId3Tag(tags);

  // Find `data` chunk offset to insert INFO before it
  let dataOffset = 12; // skip 'RIFF' + size + 'WAVE'
  while (dataOffset < src.length - 8) {
    const chunkId = String.fromCharCode(src[dataOffset], src[dataOffset+1], src[dataOffset+2], src[dataOffset+3]);
    const chunkSz = srcView.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') break;
    dataOffset += 8 + chunkSz + (chunkSz % 2); // RIFF pad
  }

  // New WAV: ID3 tag | RIFF header (updated size) | pre-data chunks | INFO | data chunk
  const preData    = src.slice(12, dataOffset);   // 'WAVE' + fmt chunk etc.
  const dataChunk  = src.slice(dataOffset);        // data chunk onwards

  const riffContentSize = 4 + preData.length + infoChunk.length + dataChunk.length;
  const newRiff = new Uint8Array(4 + 4 + riffContentSize);
  const newView = new DataView(newRiff.buffer);
  writeString(newView, 0, 'RIFF');
  writeU32LE(newView, 4, riffContentSize);
  writeString(newView, 8, 'WAVE');
  newRiff.set(preData,    12);
  newRiff.set(infoChunk,  12 + preData.length);
  newRiff.set(dataChunk,  12 + preData.length + infoChunk.length);

  // Prepend ID3 tag (iTunes/Apple convention — ID3 before RIFF)
  const out = new Uint8Array(id3Tag.length + newRiff.length);
  out.set(id3Tag,  0);
  out.set(newRiff, id3Tag.length);

  return out.buffer;
}

/**
 * Convenience: download a WAV with embedded metadata.
 */
export function downloadWavWithMetadata(
  wavBuffer: ArrayBuffer,
  tags: AudioMetadataTags,
  filename: string,
): void {
  const enhanced = injectWavMetadata(wavBuffer, tags);
  const blob = new Blob([enhanced], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  a.click();
  URL.revokeObjectURL(url);
}
