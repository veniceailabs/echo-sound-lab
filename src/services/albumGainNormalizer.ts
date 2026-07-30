/**
 * albumGainNormalizer — ReplayGain 2.0 album-level loudness normalization
 *
 * Track-by-track mastering targets each track independently to -14 LUFS.
 * Album normalization does something more sophisticated:
 *
 *   1. Measure each track's integrated LUFS (BS.1770-4 K-weighted, gated)
 *   2. Compute album gain = target - album_loudness, where album_loudness
 *      is the loudness of all tracks concatenated (not the average)
 *   3. For each track, compute:
 *        track_gain = target - track_loudness
 *        album_gain = target - album_loudness
 *   4. Apply gains to output buffers
 *
 * This ensures:
 *   • Each track sounds right on its own (track gain applied for shuffle play)
 *   • All tracks sound consistent within the album (album gain for sequential play)
 *   • Dynamic tracks that are intentionally quiet stay quiet relative to louder ones
 *
 * Reference: https://wiki.hydrogenaud.io/index.php?title=ReplayGain_2.0_specification
 */

export interface TrackGainResult {
  trackIndex:   number;
  trackTitle:   string;
  measuredLufs: number;
  trackGainDb:  number;    // gain to apply for track-normalized playback
  albumGainDb:  number;    // gain to apply for album-normalized playback
  peakDb:       number;    // true peak dBFS
  clipsAfterGain: boolean; // would album gain cause clipping?
}

export interface AlbumGainResult {
  albumLufs:    number;         // integrated loudness of entire album
  albumGainDb:  number;         // gain to apply to all tracks for album mode
  targetLufs:   number;
  tracks:       TrackGainResult[];
  replayGainTag: string;        // ready-to-embed TXXX value
}

// K-weighting: high-shelf pre-filter + RLB high-pass (BS.1770-4)
function kWeight(data: Float32Array, sr: number): Float32Array {
  const out = new Float32Array(data.length);
  // Stage 1: high-shelf
  const Vh = Math.pow(10, 4.0 / 20);
  const K1 = Math.tan(Math.PI * 1500 / sr);
  const Vb = Math.sqrt(Vh);
  const a0 = 1 + Vb / 0.7072 * K1 + Vh * K1 * K1;
  const b0 = (Vh + Vh / 0.7072 * K1 + K1 * K1) / a0;
  const b1 = 2 * (K1 * K1 - Vh) / a0;
  const b2 = (Vh - Vh / 0.7072 * K1 + K1 * K1) / a0;
  const a1 = 2 * (K1 * K1 - 1) / a0;
  const a2 = (1 - Vb / 0.7072 * K1 + K1 * K1) / a0;
  let x1=0,x2=0,y1=0,y2=0;
  for (let i = 0; i < data.length; i++) {
    const x0=data[i]; const y0=b0*x0+b1*x1+b2*x2-a1*y1-a2*y2;
    x2=x1;x1=x0;y2=y1;y1=y0; out[i]=y0;
  }
  // Stage 2: RLB high-pass
  const K2=Math.tan(Math.PI*38.135/sr); const Q2=0.5012;
  const a0h=1+K2/Q2+K2*K2;
  const b0h=1/a0h; const b1h=-2/a0h; const b2h=1/a0h;
  const a1h=2*(K2*K2-1)/a0h; const a2h=(1-K2/Q2+K2*K2)/a0h;
  x1=0;x2=0;y1=0;y2=0;
  for (let i = 0; i < out.length; i++) {
    const x0=out[i]; const y0=b0h*x0+b1h*x1+b2h*x2-a1h*y1-a2h*y2;
    x2=x1;x1=x0;y2=y1;y1=y0; out[i]=y0;
  }
  return out;
}

function integratedLufs(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const kL = kWeight(L, sr);
  const kR = kWeight(R, sr);

  // Mean square per 400ms block, 100ms hop
  const blockSz = Math.floor(0.4 * sr);
  const hopSz   = Math.floor(0.1 * sr);
  const blocks: number[] = [];
  for (let s = 0; s + blockSz <= kL.length; s += hopSz) {
    let sum = 0;
    for (let i = s; i < s + blockSz; i++) sum += kL[i]*kL[i] + kR[i]*kR[i];
    const m = sum / (blockSz * 2);
    const lu = m > 0 ? -0.691 + 10 * Math.log10(m) : -Infinity;
    if (lu > -70) blocks.push(m);
  }
  if (blocks.length === 0) return -70;
  // Relative gate: -10 LU below first-pass mean
  const firstMean = blocks.reduce((a,b)=>a+b,0) / blocks.length;
  const relThresh = Math.pow(10, ((-0.691 + 10*Math.log10(firstMean)) - 10 + 0.691) / 10);
  const gated = blocks.filter(m => m >= relThresh);
  if (gated.length === 0) return -70;
  const gatedMean = gated.reduce((a,b)=>a+b,0) / gated.length;
  return -0.691 + 10 * Math.log10(gatedMean);
}

function truePeakDb(buffer: AudioBuffer): number {
  let pk = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]);
  }
  return pk > 0 ? 20 * Math.log10(pk) : -100;
}

/**
 * Analyze all tracks and compute per-track + album-level ReplayGain values.
 * Does NOT modify any buffers — returns gain recommendations only.
 */
export function analyzeAlbumGain(
  tracks: Array<{ title: string; buffer: AudioBuffer }>,
  targetLufs = -14,
): AlbumGainResult {
  // Per-track measurements
  const measurements = tracks.map((t, i) => ({
    index: i,
    title: t.title,
    lufs:  integratedLufs(t.buffer),
    peak:  truePeakDb(t.buffer),
  }));

  // Album loudness = energy-weighted sum (not simple average)
  // Concatenate all K-weighted mean-square values
  let totalEnergy = 0, totalSamples = 0;
  for (const t of tracks) {
    const sr = t.buffer.sampleRate;
    const L = t.buffer.getChannelData(0);
    const R = t.buffer.numberOfChannels > 1 ? t.buffer.getChannelData(1) : L;
    const kL = kWeight(L, sr);
    const kR = kWeight(R, sr);
    for (let i = 0; i < kL.length; i++) totalEnergy += kL[i]*kL[i] + kR[i]*kR[i];
    totalSamples += kL.length * 2;
  }
  const albumMean = totalSamples > 0 ? totalEnergy / totalSamples : 0;
  const albumLufs = albumMean > 0 ? -0.691 + 10 * Math.log10(albumMean) : -70;
  const albumGainDb = targetLufs - albumLufs;

  const trackResults: TrackGainResult[] = measurements.map(m => {
    const trackGainDb = targetLufs - m.lufs;
    const peakAfterGain = m.peak + albumGainDb;
    return {
      trackIndex:     m.index,
      trackTitle:     m.title,
      measuredLufs:   parseFloat(m.lufs.toFixed(2)),
      trackGainDb:    parseFloat(trackGainDb.toFixed(2)),
      albumGainDb:    parseFloat(albumGainDb.toFixed(2)),
      peakDb:         parseFloat(m.peak.toFixed(2)),
      clipsAfterGain: peakAfterGain > -0.1,
    };
  });

  return {
    albumLufs:    parseFloat(albumLufs.toFixed(2)),
    albumGainDb:  parseFloat(albumGainDb.toFixed(2)),
    targetLufs,
    tracks:       trackResults,
    replayGainTag: `${albumGainDb >= 0 ? '+' : ''}${albumGainDb.toFixed(2)} dB`,
  };
}

/**
 * Apply album gain to a buffer (non-destructive copy).
 * Applies albumGainDb with optional hard clip protection at -0.1 dBFS.
 */
export function applyAlbumGain(
  buffer: AudioBuffer,
  gainDb: number,
  clipCeiling = -0.1,
): AudioBuffer {
  const gainLin = Math.pow(10, gainDb / 20);
  const ceilLin = Math.pow(10, clipCeiling / 20);
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = Math.max(-ceilLin, Math.min(ceilLin, src[i] * gainLin));
    }
  }
  return out;
}

/**
 * Generate a ReplayGain report as plain text (for inclusion in liner notes or delivery docs).
 */
export function generateReplayGainReport(result: AlbumGainResult, albumTitle: string): string {
  const lines = [
    `ReplayGain 2.0 Analysis Report`,
    `Album: ${albumTitle}`,
    `Generated: ${new Date().toISOString()}`,
    `Engine: Echo Sound Lab 2.5`,
    ``,
    `Album Loudness: ${result.albumLufs.toFixed(2)} LUFS`,
    `Album Gain:     ${result.replayGainTag}`,
    `Target:         ${result.targetLufs} LUFS`,
    ``,
    `Track Analysis:`,
    `${'#'.padEnd(4)} ${'Title'.padEnd(32)} ${'LUFS'.padEnd(8)} ${'Track Gain'.padEnd(12)} ${'Album Gain'.padEnd(12)} Peak     Clips?`,
    `${'-'.repeat(90)}`,
    ...result.tracks.map(t =>
      `${String(t.trackIndex + 1).padEnd(4)} ${t.trackTitle.slice(0, 31).padEnd(32)} ${t.measuredLufs.toFixed(2).padEnd(8)} ${(t.trackGainDb >= 0 ? '+' : '') + t.trackGainDb.toFixed(2) + ' dB'.padEnd(10)} ${(t.albumGainDb >= 0 ? '+' : '') + t.albumGainDb.toFixed(2) + ' dB'.padEnd(10)} ${t.peakDb.toFixed(2)} dBFS${t.clipsAfterGain ? '  ⚠ CLIP' : ''}`
    ),
    ``,
    `Notes:`,
    `  Track Gain: Apply per-track for shuffle/single play (each track at target LUFS).`,
    `  Album Gain: Apply for sequential album play (preserves relative dynamics between tracks).`,
    `  Embed both as TXXX frames in ID3v2 or Vorbis Comment tags for maximum compatibility.`,
  ];
  return lines.join('\n') + '\n';
}
