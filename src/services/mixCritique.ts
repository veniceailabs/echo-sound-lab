/**
 * AI Mix Critique — Pre-mastering audio analysis
 *
 * Analyses an AudioBuffer and returns plain-English feedback about what
 * needs attention BEFORE mastering: frequency imbalances, dynamic issues,
 * clipping, stereo problems, low-end mud, harsh highs, etc.
 *
 * All DSP runs offline so it never touches the playback graph.
 */

export interface MixIssue {
  severity: 'info' | 'warning' | 'critical';
  category: 'loudness' | 'dynamics' | 'frequency' | 'stereo' | 'clipping' | 'noise';
  title: string;
  description: string;
  suggestion: string;
  value?: string; // numeric readout to show alongside the issue
}

export interface MixCritiqueResult {
  overallScore: number;       // 0–100 (100 = mastering-ready)
  grade: string;              // e.g. "B+" or "Needs work"
  issues: MixIssue[];
  strengths: string[];        // things that are actually good
  readyToMaster: boolean;
  headroomDb: number;
  estimatedLUFS: number;
  peakDb: number;
  stereoWidth: number;        // 0–1
  lowEndBalance: number;      // 0–1 (1 = perfect), <0.4 = too bassy, >0.8 = thin
  dynamicRange: number;       // dB
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rmsDb(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const rms = Math.sqrt(sum / data.length);
  return rms > 0 ? 20 * Math.log10(rms) : -96;
}

function peakDb(data: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -96;
}

function countClips(data: Float32Array, threshold = 0.99): number {
  let clips = 0;
  let inClip = false;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= threshold) {
      if (!inClip) { clips++; inClip = true; }
    } else {
      inClip = false;
    }
  }
  return clips;
}

/** Simple FFT-based band energy using OfflineAudioContext biquad filters */
async function getBandEnergies(buffer: AudioBuffer): Promise<{
  sub: number; bass: number; lowMid: number; mid: number; highMid: number; air: number;
}> {
  const sr = buffer.sampleRate;
  const len = buffer.length;

  const measureBand = async (loFreq: number | null, hiFreq: number | null): Promise<number> => {
    const ctx = new OfflineAudioContext(1, len, sr);
    const src = ctx.createBufferSource();
    // Mix to mono
    const mono = ctx.createChannelMerger(1);
    src.buffer = buffer;
    src.connect(mono, 0, 0);
    if (buffer.numberOfChannels > 1) src.connect(mono, 1, 0);

    let node: AudioNode = mono;

    if (loFreq !== null) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = loFreq;
      hp.Q.value = 0.707;
      node.connect(hp);
      node = hp;
    }
    if (hiFreq !== null) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = hiFreq;
      lp.Q.value = 0.707;
      node.connect(lp);
      node = lp;
    }

    node.connect(ctx.destination);
    src.start();
    const out = await ctx.startRendering();
    const data = out.getChannelData(0);
    return rmsDb(data);
  };

  const [sub, bass, lowMid, mid, highMid, air] = await Promise.all([
    measureBand(null, 80),
    measureBand(80, 250),
    measureBand(250, 500),
    measureBand(500, 2000),
    measureBand(2000, 8000),
    measureBand(8000, null),
  ]);

  return { sub, bass, lowMid, mid, highMid, air };
}

/** Stereo width: correlation between L and R (-1 to +1, 1 = mono, -1 = out of phase) */
function stereoCorrelation(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 2) return 1; // mono
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const len = Math.min(L.length, R.length);

  let sumLR = 0, sumL2 = 0, sumR2 = 0;
  for (let i = 0; i < len; i++) {
    sumLR += L[i] * R[i];
    sumL2 += L[i] * L[i];
    sumR2 += R[i] * R[i];
  }
  const denom = Math.sqrt(sumL2 * sumR2);
  return denom > 0 ? sumLR / denom : 1;
}

/** Mid/side decomposition — returns width as 0-1 (0=mono, 1=wide) */
function stereoWidth(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 2) return 0;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const len = Math.min(L.length, R.length);

  let sumMid2 = 0, sumSide2 = 0;
  for (let i = 0; i < len; i++) {
    const m = (L[i] + R[i]) * 0.5;
    const s = (L[i] - R[i]) * 0.5;
    sumMid2 += m * m;
    sumSide2 += s * s;
  }
  const midRms = Math.sqrt(sumMid2 / len);
  const sideRms = Math.sqrt(sumSide2 / len);
  const total = midRms + sideRms;
  return total > 0 ? sideRms / total : 0;
}

/** Rough integrated LUFS estimate (simplified — not BS.1770 compliant but close) */
function estimateLUFS(buffer: AudioBuffer): number {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const len = Math.min(L.length, R.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sum / (len * 2));
  // Apply rough K-weighting correction (+3.5 dB for typical music)
  return rms > 0 ? 20 * Math.log10(rms) - 0.691 : -70;
}

/** Dynamic range: difference between loud peaks and quiet sections */
function dynamicRange(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const blockSize = Math.floor(buffer.sampleRate * 0.4); // 400ms blocks
  const blocks: number[] = [];

  for (let i = 0; i < data.length - blockSize; i += blockSize) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) sum += data[i + j] * data[i + j];
    const rms = Math.sqrt(sum / blockSize);
    if (rms > 0.001) blocks.push(20 * Math.log10(rms));
  }

  if (blocks.length < 4) return 0;
  blocks.sort((a, b) => b - a);
  const loud = blocks.slice(0, Math.ceil(blocks.length * 0.1));
  const quiet = blocks.slice(Math.floor(blocks.length * 0.9));
  const loudAvg = loud.reduce((a, b) => a + b, 0) / loud.length;
  const quietAvg = quiet.reduce((a, b) => a + b, 0) / quiet.length;
  return loudAvg - quietAvg;
}

// ─── Main Analysis ─────────────────────────────────────────────────────────────

export async function analyzeMix(buffer: AudioBuffer): Promise<MixCritiqueResult> {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  // Core measurements
  const peakL = peakDb(L);
  const peakR = peakDb(R);
  const peakOverall = Math.max(peakL, peakR);
  const headroom = -peakOverall; // positive = headroom, negative = already clipped

  const lufsDiff = estimateLUFS(buffer);
  const dr = dynamicRange(buffer);
  const width = stereoWidth(buffer);
  const correlation = stereoCorrelation(buffer);
  const clipCountL = countClips(L);
  const clipCountR = countClips(R);
  const totalClips = clipCountL + clipCountR;

  const bands = await getBandEnergies(buffer);

  const issues: MixIssue[] = [];
  const strengths: string[] = [];
  let penalty = 0;

  // ── Clipping ────────────────────────────────────────────────────────────────
  if (totalClips > 20) {
    issues.push({
      severity: 'critical',
      category: 'clipping',
      title: 'Digital clipping detected',
      description: `Found ${totalClips} clipping regions — the signal is hitting 0 dBFS and distorting. This cannot be fixed in mastering; it needs to be fixed in the mix.`,
      suggestion: 'Lower your master fader by at least 3 dB and check any channel that might be pushing hot. Mastering will make clipping worse, not better.',
      value: `${totalClips} clips`,
    });
    penalty += 30;
  } else if (totalClips > 0) {
    issues.push({
      severity: 'warning',
      category: 'clipping',
      title: 'Minor clipping present',
      description: `${totalClips} brief clipping event${totalClips > 1 ? 's' : ''} detected. These are likely just transient peaks.`,
      suggestion: 'Add a true-peak limiter on your master bus set to −1 dBTP before exporting.',
      value: `${totalClips} clip${totalClips > 1 ? 's' : ''}`,
    });
    penalty += 8;
  }

  // ── Headroom ─────────────────────────────────────────────────────────────────
  if (peakOverall > -0.5 && totalClips === 0) {
    issues.push({
      severity: 'warning',
      category: 'loudness',
      title: 'Very little headroom left',
      description: `Peak is ${peakOverall.toFixed(1)} dBFS — almost at 0 dB. The mastering limiter will have almost nothing to work with and may introduce pumping.`,
      suggestion: 'Lower the master bus output by 2–3 dB so there is room for the mastering chain to breathe.',
      value: `${headroom.toFixed(1)} dB headroom`,
    });
    penalty += 10;
  } else if (headroom > 12) {
    issues.push({
      severity: 'info',
      category: 'loudness',
      title: 'Mix is very quiet',
      description: `Peak is only ${peakOverall.toFixed(1)} dBFS — there is a lot of unused dynamic range. This is fine for mastering, but double-check it isn't because of an error.`,
      suggestion: 'Use a gain plugin on the master bus to bring peaks up to around −6 dBFS before exporting for mastering. This is just for reference; the mastering engine will set final loudness.',
      value: `${headroom.toFixed(1)} dB headroom`,
    });
    penalty += 3;
  } else {
    strengths.push(`Good export level — ${headroom.toFixed(1)} dB headroom gives the mastering chain room to work`);
  }

  // ── Dynamic Range ────────────────────────────────────────────────────────────
  if (dr < 4) {
    issues.push({
      severity: 'critical',
      category: 'dynamics',
      title: 'Over-compressed / brickwalled',
      description: `Dynamic range is only ${dr.toFixed(0)} dB — the mix is already crushed flat. Mastering cannot add dynamics back once they are gone.`,
      suggestion: 'Back off bus compression significantly. Aim for at least 6–8 dB of dynamic range in the mix before mastering.',
      value: `DR ${dr.toFixed(0)} dB`,
    });
    penalty += 25;
  } else if (dr < 7) {
    issues.push({
      severity: 'warning',
      category: 'dynamics',
      title: 'Heavy compression — limited dynamics',
      description: `Dynamic range of ${dr.toFixed(0)} dB is quite compressed. There is not much for mastering to enhance.`,
      suggestion: 'Try easing the bus compressor ratio down to 2:1 or 4:1 with a slower attack to let transients through.',
      value: `DR ${dr.toFixed(0)} dB`,
    });
    penalty += 10;
  } else if (dr > 20) {
    issues.push({
      severity: 'info',
      category: 'dynamics',
      title: 'Very wide dynamic range',
      description: `Dynamic range is ${dr.toFixed(0)} dB — great for classical or acoustic, but may sound quiet on streaming if it is an EDM or hip-hop track.`,
      suggestion: 'If this is commercial music, consider adding a light bus compressor (2:1, slow attack, medium release) to glue elements together before mastering.',
      value: `DR ${dr.toFixed(0)} dB`,
    });
  } else {
    strengths.push(`Healthy dynamic range (${dr.toFixed(0)} dB) — mastering will enhance this nicely`);
  }

  // ── Low End / Bass ───────────────────────────────────────────────────────────
  const subBassRel = bands.sub - bands.mid;
  const bassRel = bands.bass - bands.mid;

  if (subBassRel > 6) {
    issues.push({
      severity: 'warning',
      category: 'frequency',
      title: 'Excessive sub-bass (below 80 Hz)',
      description: `Sub-bass energy is ${subBassRel.toFixed(0)} dB louder than the midrange. This causes problems on speakers without a subwoofer and will make the track sound muddy on earbuds.`,
      suggestion: 'Apply a high-pass filter at 30–40 Hz to roll off inaudible rumble. Check your kick and 808 bass. Consider a sub-bass shelf cut around 60 Hz.',
      value: `Sub ${subBassRel > 0 ? '+' : ''}${subBassRel.toFixed(0)} dB vs mid`,
    });
    penalty += 12;
  }

  if (bassRel > 8) {
    issues.push({
      severity: 'warning',
      category: 'frequency',
      title: 'Low-end heavy mix',
      description: `Bass (80–250 Hz) is ${bassRel.toFixed(0)} dB louder than the midrange. The mix may sound boomy on large speakers and completely disappear on laptop speakers.`,
      suggestion: 'Try a gentle low-shelf cut (−2 to −4 dB at 120 Hz) or check for bass channel buildup. A reference track comparison will help.',
      value: `Bass ${bassRel > 0 ? '+' : ''}${bassRel.toFixed(0)} dB vs mid`,
    });
    penalty += 8;
  }

  if (bassRel < -10) {
    issues.push({
      severity: 'warning',
      category: 'frequency',
      title: 'Thin low end',
      description: `Bass frequencies are very quiet compared to the midrange. The track may sound thin and hollow.`,
      suggestion: 'Check that your kick and bass are audible. Try a gentle low-shelf boost around 80–100 Hz.',
      value: `Bass ${bassRel.toFixed(0)} dB vs mid`,
    });
    penalty += 8;
  }

  // ── Harsh Highs ──────────────────────────────────────────────────────────────
  const airRel = bands.air - bands.mid;
  if (airRel > 5) {
    issues.push({
      severity: 'warning',
      category: 'frequency',
      title: 'Harsh high-frequency content',
      description: `Air frequencies (above 8 kHz) are prominent — ${airRel.toFixed(0)} dB above the midrange. This can cause listener fatigue and sibilance issues.`,
      suggestion: 'Check for harsh cymbals, whistling synth patches, or sibilant vocals. A gentle high-shelf cut (−2 to −3 dB above 10 kHz) may help.',
      value: `Air ${airRel > 0 ? '+' : ''}${airRel.toFixed(0)} dB vs mid`,
    });
    penalty += 8;
  }

  if (airRel < -12) {
    issues.push({
      severity: 'info',
      category: 'frequency',
      title: 'Dull or dark mix',
      description: `High-frequency content is quite low — the mix may sound muffled or like it is playing through a wall.`,
      suggestion: 'Check the air band (8 kHz+) on your mix bus EQ. A gentle high-shelf boost can add sparkle and definition. Also verify no accidental low-pass filter is engaged.',
      value: `Air ${airRel.toFixed(0)} dB vs mid`,
    });
    penalty += 5;
  }

  // ── Stereo ───────────────────────────────────────────────────────────────────
  if (correlation < 0.2) {
    issues.push({
      severity: 'critical',
      category: 'stereo',
      title: 'Phase cancellation problem',
      description: `Left and right channels are nearly out of phase (correlation: ${correlation.toFixed(2)}). The mix will nearly disappear when played in mono — on phones, Bluetooth speakers, and TV audio.`,
      suggestion: 'Check for flipped phase on any channel. Use a correlation meter on your master bus. A mono compatibility test is essential before mastering.',
      value: `Correlation ${correlation.toFixed(2)}`,
    });
    penalty += 30;
  } else if (correlation < 0.5) {
    issues.push({
      severity: 'warning',
      category: 'stereo',
      title: 'Low stereo correlation — mono compatibility risk',
      description: `Stereo correlation is ${correlation.toFixed(2)} — the mix may lose definition when summed to mono.`,
      suggestion: 'Fold to mono in your DAW and check that bass and vocals are still clear. High-frequency stereo widening is usually fine, but wide low-end causes this.',
      value: `Correlation ${correlation.toFixed(2)}`,
    });
    penalty += 12;
  } else if (correlation > 0.98 && buffer.numberOfChannels > 1) {
    issues.push({
      severity: 'info',
      category: 'stereo',
      title: 'Mix is nearly mono',
      description: `Left and right channels are almost identical. The mastering widener may help, but consider adding stereo width in your mix.`,
      suggestion: 'Use stereo reverb, delay, or a Haas effect on elements like pads and guitars. Keep bass and kick in mono, but spread mid and high elements.',
      value: `Width ${(width * 100).toFixed(0)}%`,
    });
    penalty += 5;
  } else {
    strengths.push(`Good stereo image — ${(width * 100).toFixed(0)}% width with healthy mono compatibility`);
  }

  // ── Low-mid mud ──────────────────────────────────────────────────────────────
  const lowMidRel = bands.lowMid - bands.mid;
  if (lowMidRel > 4) {
    issues.push({
      severity: 'warning',
      category: 'frequency',
      title: 'Low-mid buildup (the "mud" zone)',
      description: `The 250–500 Hz range is ${lowMidRel.toFixed(0)} dB boosted relative to the midrange. This is the most common cause of muffled, muddy mixes.`,
      suggestion: 'Make a narrow cut around 300–400 Hz on your busiest channels (drums, guitar, piano). Reducing this range usually makes a dramatic clarity improvement.',
      value: `Low-mid ${lowMidRel > 0 ? '+' : ''}${lowMidRel.toFixed(0)} dB`,
    });
    penalty += 10;
  }

  // ── Positives ────────────────────────────────────────────────────────────────
  if (lufsDiff > -18 && lufsDiff < -8) {
    strengths.push('Good overall loudness level — right in the range mastering works best with');
  }
  if (Math.abs(peakL - peakR) < 1.5) {
    strengths.push('Stereo balance is even — left and right peak within 1.5 dB of each other');
  }
  if (totalClips === 0 && headroom >= 2) {
    strengths.push('Clean signal — no clipping, with adequate headroom for mastering');
  }

  // ── Score ─────────────────────────────────────────────────────────────────────
  const rawScore = Math.max(0, 100 - penalty);
  const overallScore = rawScore;

  let grade: string;
  if (overallScore >= 90) grade = 'A — Mastering ready';
  else if (overallScore >= 80) grade = 'B — Minor tweaks recommended';
  else if (overallScore >= 65) grade = 'C — Needs attention before mastering';
  else if (overallScore >= 50) grade = 'D — Significant mix issues';
  else grade = 'F — Fix the mix first';

  const readyToMaster = overallScore >= 65 && totalClips < 5;

  // Sort: critical first, then warnings, then info
  issues.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return {
    overallScore,
    grade,
    issues,
    strengths,
    readyToMaster,
    headroomDb: headroom,
    estimatedLUFS: lufsDiff,
    peakDb: peakOverall,
    stereoWidth: width,
    lowEndBalance: 0.5 + (bassRel * 0.05),
    dynamicRange: dr,
  };
}
