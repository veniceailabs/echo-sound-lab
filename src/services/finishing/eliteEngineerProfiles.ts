export type EliteEngineerProfileId = 'dre_punch' | '40_submerged' | 'ryan_macro' | 'manny_color' | 'none';

export interface EliteEngineerProfile {
  id: EliteEngineerProfileId;
  name: string;
  engineer: string;
  philosophy: string;
  heuristics: {
    targetLufs: number;
    subMonoAnchorFreqHz: number | null;
    parallelTransientExpansionDb: number | null;
    vocalPocketCutDb: number | null;
    vocalPocketFreqHz: number | null;
    midSideSaturationSideBoostDb: number | null;
    lpfInstrumentalFreqHz: number | null;
    glueCompression: {
      thresholdDb: number;
      ratio: number;
      attackMs: number;
      releaseMs: number;
    } | null;
  };
}

export const eliteProfiles: Record<Exclude<EliteEngineerProfileId, 'none'>, EliteEngineerProfile> = {
  'dre_punch': {
    id: 'dre_punch',
    name: 'Surgical Punch & Anchor',
    engineer: 'Inspired by Dr. Dre',
    philosophy: 'Massive low-end anchored to mono. Crystal transients on the kick/snare. Carved vocal pocket.',
    heuristics: {
      targetLufs: -9.5, // Aggressive
      subMonoAnchorFreqHz: 80,
      parallelTransientExpansionDb: 3.5,
      vocalPocketCutDb: -1.5,
      vocalPocketFreqHz: 300, // Clear the mud for the rap vocal
      midSideSaturationSideBoostDb: null,
      lpfInstrumentalFreqHz: null,
      glueCompression: {
        thresholdDb: -4,
        ratio: 2,
        attackMs: 30, // Slow attack to let transients through
        releaseMs: 100, // Fast release to pump
      }
    }
  },
  '40_submerged': {
    id: '40_submerged',
    name: 'Submerged Beat / Present Vocal',
    engineer: 'Inspired by Noah "40" Shebib',
    philosophy: 'Low-passed atmospheric beat with immense synthetic sub-bass, contrasting with an upfront, intensely compressed vocal.',
    heuristics: {
      targetLufs: -11.0, // Moody, dynamic
      subMonoAnchorFreqHz: 40,
      parallelTransientExpansionDb: null,
      vocalPocketCutDb: -3.0,
      vocalPocketFreqHz: 1500, // Duck the mids of the beat
      midSideSaturationSideBoostDb: 1.5, // Wide ethereal pads
      lpfInstrumentalFreqHz: 4000, // The classic 40 underwater filter
      glueCompression: null, // Less master glue, more stem separation
    }
  },
  'ryan_macro': {
    id: 'ryan_macro',
    name: 'Macro-Dynamic Contrast',
    engineer: 'Inspired by Ryan Lewis',
    philosophy: 'Massive dynamic swings. Quiet, airy verses exploding into brickwall-limited, saturated hooks.',
    heuristics: {
      targetLufs: -8.0, // Punishing loud chorus
      subMonoAnchorFreqHz: null,
      parallelTransientExpansionDb: 2.0,
      vocalPocketCutDb: null,
      vocalPocketFreqHz: null,
      midSideSaturationSideBoostDb: 2.5, // Extremely wide hook brass/synths
      lpfInstrumentalFreqHz: null,
      glueCompression: {
        thresholdDb: -8,
        ratio: 4,
        attackMs: 10,
        releaseMs: 300,
      }
    }
  },
  'manny_color': {
    id: 'manny_color',
    name: 'Colorful Depth & Glue',
    engineer: 'Inspired by Manny Marroquin',
    philosophy: 'EQ as an effect. Lush mid-range saturation and perfect mix-bus VCA glue.',
    heuristics: {
      targetLufs: -10.0,
      subMonoAnchorFreqHz: 60,
      parallelTransientExpansionDb: null,
      vocalPocketCutDb: -1.0,
      vocalPocketFreqHz: 2500,
      midSideSaturationSideBoostDb: 3.0, // Rich side channel harmonics
      lpfInstrumentalFreqHz: null,
      glueCompression: {
        thresholdDb: -2.5,
        ratio: 1.5,
        attackMs: 30, // Classic SSL bus comp settings
        releaseMs: 100, // Auto/Fast
      }
    }
  }
};
