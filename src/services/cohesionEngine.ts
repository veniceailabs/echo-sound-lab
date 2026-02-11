import { AlbumCohesionProfile, AudioMetrics, CohesionTrackReport } from '../types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeBand = (value: number | undefined, floor = 0): number => {
  if (!Number.isFinite(value)) return floor;
  return Math.max(floor, value as number);
};

const average = (values: number[], fallback = 0): number => {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const distance3 = (
  a: [number, number, number],
  b: [number, number, number]
): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const deriveCohesionTrackReportFromMetrics = (
  id: string,
  trackName: string,
  metrics: AudioMetrics,
  humanIntentIndex?: number
): CohesionTrackReport => {
  const lufs = metrics.lufs?.integrated ?? metrics.rms + 3;
  const spectral = metrics.spectralBalance;
  const low = normalizeBand((spectral?.low ?? 0) + (spectral?.lowMid ?? 0), 0.0001);
  const mid = normalizeBand(spectral?.mid ?? 0, 0.0001);
  const high = normalizeBand((spectral?.highMid ?? 0) + (spectral?.high ?? 0), 0.0001);
  const total = low + mid + high || 1;
  const tonalCentroid: [number, number, number] = [
    low / total,
    mid / total,
    high / total,
  ];

  const harmonicDistortion = metrics.advancedMetrics?.harmonicDistortion ?? -18;
  const harmonicWeight = clamp01((harmonicDistortion + 30) / 24);
  const stereoWidth = clamp01((metrics.advancedMetrics?.stereoWidth ?? 50) / 100);
  const transientDensity = clamp01((metrics.advancedMetrics?.transientSharpness ?? 55) / 100);

  return {
    id,
    trackName,
    lufs,
    tonalCentroid,
    harmonicWeight,
    stereoWidth,
    transientDensity,
    humanIntentIndex,
  };
};

export const CohesionEngine = {
  generateProfile: (
    reports: CohesionTrackReport[],
    options: { name?: string } = {}
  ): AlbumCohesionProfile => {
    if (reports.length === 0) {
      throw new Error('Cannot generate cohesion profile without tracks.');
    }

    return {
      id: crypto.randomUUID(),
      name: options.name || `Album Cohesion ${new Date().toLocaleDateString()}`,
      targetLoudness: average(reports.map((r) => r.lufs), -14),
      tonalCentroid: [
        average(reports.map((r) => r.tonalCentroid[0]), 0.33),
        average(reports.map((r) => r.tonalCentroid[1]), 0.34),
        average(reports.map((r) => r.tonalCentroid[2]), 0.33),
      ],
      harmonicWeight: clamp01(average(reports.map((r) => r.harmonicWeight), 0.65)),
      stereoAnchor: clamp01(average(reports.map((r) => r.stereoWidth), 0.5)),
      transientTarget: clamp01(average(reports.map((r) => r.transientDensity), 0.55)),
      tracks: reports.map((r) => r.id),
    };
  },

  calculateTrackVibeMatch: (
    report: CohesionTrackReport,
    profile: AlbumCohesionProfile
  ): number => {
    const loudnessGap = Math.abs(report.lufs - profile.targetLoudness);
    const tonalGap = distance3(report.tonalCentroid, profile.tonalCentroid);
    const harmonicGap = Math.abs(report.harmonicWeight - profile.harmonicWeight);
    const stereoGap = Math.abs(report.stereoWidth - profile.stereoAnchor);
    const transientGap = Math.abs(report.transientDensity - profile.transientTarget);

    const loudnessScore = clamp01(1 - loudnessGap / 6);
    const tonalScore = clamp01(1 - tonalGap / 0.7);
    const harmonicScore = clamp01(1 - harmonicGap / 0.5);
    const stereoScore = clamp01(1 - stereoGap / 0.4);
    const transientScore = clamp01(1 - transientGap / 0.4);

    const weighted = (
      loudnessScore * 0.3
      + tonalScore * 0.25
      + harmonicScore * 0.15
      + stereoScore * 0.15
      + transientScore * 0.15
    );

    return Math.round(weighted * 100);
  },
};
