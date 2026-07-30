import type { AlbumCohesionProfile, CohesionTrackReport, PreservationMode } from '../../types';
import { clamp, mean } from '../lowend/lowEndUtils';
import { CohesionEngine } from '../cohesionEngine';

export type AlbumAuthorityVerdict = 'album_ready' | 'needs_consistency' | 'needs_balance' | 'needs_arc';

export interface AlbumAuthorityInput {
  profile: AlbumCohesionProfile;
  tracks: CohesionTrackReport[];
  currentTrack?: CohesionTrackReport | null;
  preservationMode?: PreservationMode;
}

export interface AlbumAuthorityAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  verdict: AlbumAuthorityVerdict;
  trackCount: number;
  consistencyScore: number;
  loudnessSpread: number;
  tonalSpread: number;
  transientSpread: number;
  currentTrackVibeMatch?: number;
  sequenceNotes: string[];
  recommendations: string[];
  riskNotes: string[];
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function spread(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

export class AlbumAuthorityEngine {
  public static analyze(input: AlbumAuthorityInput): AlbumAuthorityAnalysis {
    const { profile, tracks, currentTrack, preservationMode = 'balanced' } = input;
    const trackCount = tracks.length;
    const loudnessSpread = spread(tracks.map((track) => track.lufs));
    const tonalSpread = mean(tracks.map((track) => {
      return Math.sqrt(
        (track.tonalCentroid[0] - profile.tonalCentroid[0]) ** 2 +
        (track.tonalCentroid[1] - profile.tonalCentroid[1]) ** 2 +
        (track.tonalCentroid[2] - profile.tonalCentroid[2]) ** 2
      );
    }));
    const transientSpread = spread(tracks.map((track) => track.transientDensity));
    const vibeScores = tracks.map((track) => CohesionEngine.calculateTrackVibeMatch(track, profile));
    const consistencyScore = Math.round(mean(vibeScores));
    const currentTrackVibeMatch = currentTrack ? CohesionEngine.calculateTrackVibeMatch(currentTrack, profile) : undefined;

    const recommendations: string[] = [];
    if (trackCount < 2) recommendations.push('Add at least two tracks before treating the project as album-cohesive.');
    if (loudnessSpread > 1.5) recommendations.push('Level spread is wide enough to create sequencing imbalance. Normalize the outliers before final export.');
    if (tonalSpread > 0.08) recommendations.push('The album tonal center is drifting. Keep a shared palette across the batch.');
    if (transientSpread > 0.12) recommendations.push('Transient contrast is uneven. Use the same drum-pocket discipline across tracks.');
    if (currentTrackVibeMatch !== undefined && currentTrackVibeMatch < 75) {
      recommendations.push('The current track sits below the album DNA target. Re-check tonal balance and stereo anchor before export.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Album cohesion is stable enough to trust the current batch direction.');
    }

    const riskNotes: string[] = [];
    if (trackCount >= 2 && consistencyScore < 78) riskNotes.push('Album sequencing may feel inconsistent if the current track is exported unchanged.');
    if (loudnessSpread > 2) riskNotes.push('A large loudness spread can make adjacent tracks feel like different masters.');
    if (tonalSpread > 0.12) riskNotes.push('Broad tonal drift will be more obvious across a full project than on a single song.');

    const sequenceNotes: string[] = [];
    if (profile.tracks.length >= 3) sequenceNotes.push('Use the album DNA profile to keep opening, center, and closing tracks emotionally coherent.');
    if (preservationMode === 'competitive') sequenceNotes.push('Competitive mode should be used sparingly across an album to avoid fatigue between tracks.');
    if (currentTrackVibeMatch !== undefined) sequenceNotes.push(`Current track vibe match: ${currentTrackVibeMatch}% relative to the album DNA.`);

    const verdict: AlbumAuthorityVerdict = currentTrackVibeMatch !== undefined && currentTrackVibeMatch < 75
      ? 'needs_consistency'
      : loudnessSpread > 1.5
        ? 'needs_balance'
        : tonalSpread > 0.08 || transientSpread > 0.12
          ? 'needs_arc'
          : 'album_ready';

    const shouldApply = verdict !== 'album_ready' || trackCount < 2;

    const analysisFingerprint = fnv1aHex(stableSerialize({
      profileId: profile.id,
      trackCount,
      loudnessSpread,
      tonalSpread,
      transientSpread,
      currentTrackVibeMatch,
      preservationMode,
    }));

    return {
      shouldApply,
      analysisFingerprint,
      verdict,
      trackCount,
      consistencyScore,
      loudnessSpread,
      tonalSpread,
      transientSpread,
      currentTrackVibeMatch,
      sequenceNotes,
      recommendations,
      riskNotes,
    };
  }
}

export const analyzeAlbumAuthority = AlbumAuthorityEngine.analyze.bind(AlbumAuthorityEngine);
