import { AlbumCohesionProfile, BatchState, CohesionTrackReport, PreservationMode } from '../types';
import { CohesionEngine } from './cohesionEngine';

const MODE_GAIN_LIMIT_DB: Record<PreservationMode, number> = {
  preserve: 1.2,
  balanced: 1.6,
  competitive: 2.0,
};

export interface BatchTrackDirective {
  trackId: string;
  trackName: string;
  targetGainDb: number;
  harmonicsShift: number;
  vibeMatch: number;
}

export interface HarmonizePlan {
  profile: AlbumCohesionProfile;
  directives: BatchTrackDirective[];
}

export const batchMasterService = {
  createInitialState(profile: AlbumCohesionProfile | null = null): BatchState {
    return {
      isBatching: false,
      profile,
      progress: {},
    };
  },

  buildHarmonizePlan(
    tracks: CohesionTrackReport[],
    profile: AlbumCohesionProfile,
    mode: PreservationMode
  ): HarmonizePlan {
    const gainLimit = MODE_GAIN_LIMIT_DB[mode];
    const directives = tracks.map((track) => {
      const loudnessDelta = profile.targetLoudness - track.lufs;
      const targetGainDb = Math.max(-gainLimit, Math.min(gainLimit, loudnessDelta));
      const harmonicsShift = Math.max(
        -0.2,
        Math.min(0.2, profile.harmonicWeight - track.harmonicWeight)
      );
      return {
        trackId: track.id,
        trackName: track.trackName,
        targetGainDb,
        harmonicsShift,
        vibeMatch: CohesionEngine.calculateTrackVibeMatch(track, profile),
      };
    });

    return { profile, directives };
  },
};

