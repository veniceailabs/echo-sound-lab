/**
 * eqAdvisor.ts — Automated EQ analysis and recommendations
 *
 * Analyses the full-band spectrum of an AudioBuffer and returns
 * specific EQ suggestions (frequency, gain, Q, shelf/bell) based on
 * detected issues like mud, boxiness, harshness, or missing air.
 *
 * Uses a windowed DFT to get per-octave energy readings, then
 * compares against a target "balanced" reference curve.
 */

export interface EqSuggestion {
  frequency: number;       // Center frequency in Hz
  gainDb: number;          // Positive = boost, negative = cut
  q: number;               // Q factor (narrowness)
  type: 'bell' | 'highShelf' | 'lowShelf' | 'highpass' | 'lowpass';
  label: string;           // Human-readable label
  severity: 'info' | 'warning' | 'critical';
  rationale: string;
  category: 'mud' | 'boxiness' | 'harshness' | 'air' | 'bass' | 'rumble' | 'balance';
}

export interface EqAnalysisResult {
  suggestions: EqSuggestion[];
  overallBalance: 'dark' | 'balanced' | 'bright';
  bassEnergy: number;      // 0-1
  midEnergy: number;       // 0-1
  highEnergy: number;      // 0-1
  score: number;           // 0-100 (100 = perfectly balanced)
  summary: string;
}

// Target octave-band energy ratios (reference: balanced full-mix)
// Based on typical mastered material RMS per band
const TARGET_RATIOS: Array<{ label: string; low: number; high: number; target: number }> = [
  { label: 'sub',         low: 20,    high: 80,    target: 0.08 },
  { label: 'bass',        low: 80,    high: 250,   target: 0.22 },
  { label: 'low_mid',     low: 250,   high: 700,   target: 0.18 },
  { label: 'mid',         low: 700,   high: 2500,  target: 0.20 },
  { label: 'upper_mid',   low: 2500,  high: 7000,  target: 0.18 },
  { label: 'presence',    low: 7000,  high: 12000, target: 0.09 },
  { label: 'air',         low: 12000, high: 20000, target: 0.05 },
];

function getBandEnergy(
  fftData: Float32Array,
  sampleRate: number,
  fftSize: number,
  lowHz: number,
  highHz: number
): number {
  const binWidth = sampleRate / fftSize;
  const lowBin = Math.max(0, Math.floor(lowHz / binWidth));
  const highBin = Math.min(fftData.length - 1, Math.ceil(highHz / binWidth));

  let sum = 0;
  let count = 0;
  for (let i = lowBin; i <= highBin; i++) {
    // fftData is in dB — convert to linear
    const linear = Math.pow(10, fftData[i] / 20);
    sum += linear * linear;
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

export async function analyzeEq(buffer: AudioBuffer): Promise<EqAnalysisResult> {
  const fftSize = 4096;
  const sampleRate = buffer.sampleRate;

  // Run offline FFT via AnalyserNode on a short offline context
  const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);

  // Mono mix
  const src = offlineCtx.createBufferSource();
  src.buffer = buffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;

  src.connect(analyser);
  analyser.connect(offlineCtx.destination);
  src.start();

  await offlineCtx.startRendering();

  const fftData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(fftData);

  // Get energy per band
  const bandEnergies = TARGET_RATIOS.map(b => ({
    ...b,
    energy: getBandEnergy(fftData, sampleRate, fftSize, b.low, b.high),
  }));

  // Normalize energies to sum to 1
  const totalEnergy = bandEnergies.reduce((s, b) => s + b.energy, 0) || 1;
  const normalized = bandEnergies.map(b => ({ ...b, ratio: b.energy / totalEnergy }));

  const suggestions: EqSuggestion[] = [];

  // Analyze each band
  for (const band of normalized) {
    const diff = band.ratio - band.target;
    const relDiff = diff / band.target;

    if (band.label === 'sub' && band.ratio > band.target * 1.8) {
      suggestions.push({
        frequency: 40,
        gainDb: -Math.round(Math.abs(relDiff) * 8),
        q: 0.7,
        type: 'highpass',
        label: 'Remove sub rumble',
        severity: 'warning',
        rationale: `Sub bass (20–80 Hz) is ${(relDiff * 100).toFixed(0)}% above target. A high-pass filter at 40–60 Hz will clean up the mix without losing bass punch.`,
        category: 'rumble',
      });
    }

    if (band.label === 'bass' && band.ratio > band.target * 1.5) {
      suggestions.push({
        frequency: 150,
        gainDb: -Math.round(relDiff * 6),
        q: 1.2,
        type: 'bell',
        label: 'Cut muddy bass',
        severity: 'warning',
        rationale: `Bass region (80–250 Hz) is overloaded by ${(relDiff * 100).toFixed(0)}%. A cut around 120–200 Hz will reduce muddiness and reveal clarity in the mids.`,
        category: 'mud',
      });
    }

    if (band.label === 'bass' && band.ratio < band.target * 0.6) {
      suggestions.push({
        frequency: 100,
        gainDb: Math.round(Math.abs(relDiff) * 5),
        q: 0.9,
        type: 'bell',
        label: 'Add bass warmth',
        severity: 'info',
        rationale: `Bass is ${(Math.abs(relDiff) * 100).toFixed(0)}% below target. A gentle boost around 80–120 Hz adds warmth and low-end presence.`,
        category: 'bass',
      });
    }

    if (band.label === 'low_mid' && band.ratio > band.target * 1.4) {
      suggestions.push({
        frequency: 400,
        gainDb: -Math.round(relDiff * 7),
        q: 1.5,
        type: 'bell',
        label: 'Cut boxy mids',
        severity: relDiff > 0.4 ? 'critical' : 'warning',
        rationale: `Low mids (250–700 Hz) are ${(relDiff * 100).toFixed(0)}% above target — this is the "boxiness" zone. A cut around 300–500 Hz is one of the most effective clarity moves in mixing.`,
        category: 'boxiness',
      });
    }

    if (band.label === 'upper_mid' && band.ratio > band.target * 1.4) {
      suggestions.push({
        frequency: 4000,
        gainDb: -Math.round(relDiff * 6),
        q: 1.8,
        type: 'bell',
        label: 'Reduce harshness',
        severity: relDiff > 0.4 ? 'critical' : 'warning',
        rationale: `Upper mids (2.5–7 kHz) are ${(relDiff * 100).toFixed(0)}% above target. This is the harshness zone — a narrow cut at 3–4 kHz will reduce ear fatigue significantly.`,
        category: 'harshness',
      });
    }

    if (band.label === 'air' && band.ratio < band.target * 0.5) {
      const boost = Math.min(6, Math.round(Math.abs(relDiff) * 4));
      suggestions.push({
        frequency: 14000,
        gainDb: boost,
        q: 0.7,
        type: 'highShelf',
        label: 'Add air',
        severity: 'info',
        rationale: `High frequencies (12–20 kHz) are ${(Math.abs(relDiff) * 100).toFixed(0)}% below target. A high-shelf boost above 12–14 kHz adds "air" — the quality that separates expensive-sounding recordings.`,
        category: 'air',
      });
    }

    if (band.label === 'presence' && band.ratio < band.target * 0.6) {
      suggestions.push({
        frequency: 9000,
        gainDb: Math.round(Math.abs(relDiff) * 4),
        q: 0.8,
        type: 'bell',
        label: 'Add presence',
        severity: 'info',
        rationale: `Presence range (7–12 kHz) is ${(Math.abs(relDiff) * 100).toFixed(0)}% below target. A gentle boost here adds clarity, definition, and makes the mix sound "awake."`,
        category: 'air',
      });
    }
  }

  // Calculate overall balance
  const bassRatio = normalized.find(b => b.label === 'bass')?.ratio ?? 0;
  const midRatio = normalized.find(b => b.label === 'mid')?.ratio ?? 0;
  const highRatio = (normalized.find(b => b.label === 'air')?.ratio ?? 0) +
                    (normalized.find(b => b.label === 'presence')?.ratio ?? 0);

  let overallBalance: 'dark' | 'balanced' | 'bright' = 'balanced';
  if (highRatio < 0.08 && bassRatio > 0.2) overallBalance = 'dark';
  else if (highRatio > 0.18) overallBalance = 'bright';

  // Score: 100 = all bands within 20% of target
  const deviations = normalized.map(b => Math.abs(b.ratio - b.target) / b.target);
  const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const score = Math.max(0, Math.round(100 - avgDev * 100));

  const summary =
    suggestions.length === 0
      ? 'Frequency balance looks good — no significant EQ corrections needed.'
      : `Found ${suggestions.length} area${suggestions.length > 1 ? 's' : ''} to address. The mix sounds ${overallBalance}. Apply the suggested moves for a more polished result.`;

  return {
    suggestions: suggestions.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    }),
    overallBalance,
    bassEnergy: bassRatio,
    midEnergy: midRatio,
    highEnergy: highRatio,
    score,
    summary,
  };
}
