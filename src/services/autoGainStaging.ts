/**
 * autoGainStaging.ts — Intelligent per-track gain staging
 *
 * Analyses each track's RMS and peak, then calculates how much gain
 * to apply so all tracks hit the target headroom window (-18 to -12 dBFS RMS)
 * while leaving enough headroom for the mix bus.
 *
 * Target: each track's RMS between -18 and -12 dBFS. Peak never above -6 dBFS.
 * Returns per-track gain recommendations in dB.
 */

export interface TrackGainSuggestion {
  trackId: string;
  trackName: string;
  currentRmsDb: number;
  currentPeakDb: number;
  suggestedGainDb: number;  // positive = boost, negative = cut
  rationale: string;
  status: 'boost' | 'cut' | 'ok';
}

export interface GainStagingResult {
  suggestions: TrackGainSuggestion[];
  globalLoudestTrack: string;
  globalQuietestTrack: string;
  averageRmsDb: number;
  readyToMix: boolean;
  overallRationale: string;
}

const TARGET_RMS_LOW = -18;   // dBFS — target floor
const TARGET_RMS_HIGH = -12;  // dBFS — target ceiling
const MAX_PEAK = -6;          // dBFS — never let peaks exceed this

function measureBuffer(buffer: AudioBuffer): { rmsDb: number; peakDb: number } {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let sum = 0;
  let peak = 0;
  const n = L.length;

  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    sum += l * l + r * r;
    const abs = Math.max(Math.abs(l), Math.abs(r));
    if (abs > peak) peak = abs;
  }

  const rms = Math.sqrt(sum / (n * 2));
  return {
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -96,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -96,
  };
}

function gainRationale(
  rmsDb: number, peakDb: number, gainDb: number
): { rationale: string; status: 'boost' | 'cut' | 'ok' } {
  if (Math.abs(gainDb) < 0.5) {
    return { rationale: 'Already in the ideal gain staging window. No adjustment needed.', status: 'ok' };
  }
  if (gainDb > 0) {
    return {
      rationale: `Track is ${Math.abs(rmsDb - TARGET_RMS_HIGH).toFixed(0)} dB quieter than target. Boost by ${gainDb.toFixed(1)} dB to bring it into the ideal window for mixing.`,
      status: 'boost',
    };
  }
  if (peakDb > MAX_PEAK) {
    return {
      rationale: `Peak is ${peakDb.toFixed(1)} dBFS — too close to 0 dB. Cut by ${Math.abs(gainDb).toFixed(1)} dB to give the mix bus headroom.`,
      status: 'cut',
    };
  }
  return {
    rationale: `Track RMS of ${rmsDb.toFixed(1)} dBFS is slightly hot. Cut by ${Math.abs(gainDb).toFixed(1)} dB for better headroom.`,
    status: 'cut',
  };
}

export function analyzeGainStaging(
  tracks: Array<{ id: string; name: string; buffer: AudioBuffer }>
): GainStagingResult {
  if (tracks.length === 0) {
    return {
      suggestions: [],
      globalLoudestTrack: '',
      globalQuietestTrack: '',
      averageRmsDb: -20,
      readyToMix: false,
      overallRationale: 'No tracks to analyze.',
    };
  }

  const measurements = tracks.map(t => {
    const m = measureBuffer(t.buffer);
    return { ...t, ...m };
  });

  const suggestions: TrackGainSuggestion[] = measurements.map(m => {
    // Calculate suggested gain
    let suggestedGainDb = 0;

    if (m.rmsDb < TARGET_RMS_LOW) {
      // Too quiet — boost to target floor
      suggestedGainDb = TARGET_RMS_LOW - m.rmsDb;
    } else if (m.rmsDb > TARGET_RMS_HIGH) {
      // Too hot — cut to target ceiling
      suggestedGainDb = TARGET_RMS_HIGH - m.rmsDb;
    }

    // Never let peak exceed MAX_PEAK after gain
    const projectedPeak = m.peakDb + suggestedGainDb;
    if (projectedPeak > MAX_PEAK) {
      suggestedGainDb -= (projectedPeak - MAX_PEAK);
    }

    // Round to 0.5 dB steps
    suggestedGainDb = Math.round(suggestedGainDb * 2) / 2;

    const { rationale, status } = gainRationale(m.rmsDb, m.peakDb, suggestedGainDb);

    return {
      trackId: m.id,
      trackName: m.name,
      currentRmsDb: m.rmsDb,
      currentPeakDb: m.peakDb,
      suggestedGainDb,
      rationale,
      status,
    };
  });

  const loudest = measurements.reduce((a, b) => b.rmsDb > a.rmsDb ? b : a);
  const quietest = measurements.reduce((a, b) => b.rmsDb < a.rmsDb ? b : a);
  const avgRms = measurements.reduce((s, m) => s + m.rmsDb, 0) / measurements.length;
  const allOk = suggestions.every(s => s.status === 'ok');
  const criticalCount = suggestions.filter(s => s.status === 'cut' && s.suggestedGainDb < -3).length;

  let overallRationale = '';
  if (allOk) {
    overallRationale = 'All tracks are well gain-staged. The mix should have plenty of headroom.';
  } else if (criticalCount > 0) {
    overallRationale = `${criticalCount} track${criticalCount > 1 ? 's are' : ' is'} peaking too hot — these need to be cut before mixing to prevent the mix bus from clipping.`;
  } else {
    const boosts = suggestions.filter(s => s.status === 'boost').length;
    overallRationale = `${boosts} track${boosts > 1 ? 's need' : ' needs'} a boost to sit properly in the mix. Apply the suggested gains for optimal headroom.`;
  }

  return {
    suggestions,
    globalLoudestTrack: loudest.name,
    globalQuietestTrack: quietest.name,
    averageRmsDb: avgRms,
    readyToMix: allOk,
    overallRationale,
  };
}
