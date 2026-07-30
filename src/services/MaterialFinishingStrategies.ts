/**
 * MaterialFinishingStrategies — Phase 2D
 * Named processing chains for 6 core genres with real parameter values
 */

import { ProcessingConfig } from '../types';

export interface FinishingStrategy {
  id: string;
  name: string;
  description: string;
  genreAliases: string[];
  config: ProcessingConfig;
}

export const FINISHING_STRATEGIES: Record<string, FinishingStrategy> = {
  TRAP: {
    id: 'TRAP',
    name: 'Trap / Atlanta',
    description: 'Hard 808s, parallel compression, tape saturation, -14 LUFS target',
    genreAliases: ['atlanta-trap', 'trap', 'drill', 'hyperpop'],
    config: {
      compression: {
        threshold: -18,
        ratio: 8,
        attack: 3,
        release: 80,
        makeupGain: 6,
        knee: 2,
      },
      saturation: {
        type: 'tape',
        drive: 18,
        wet: 0.4,
        color: 0.5,
      },
      limiter: {
        threshold: -1,
        attack: 0.001,
        release: 0.05,
        enabled: true,
      },
      targetGainDb: -2,
      eq: [
        { frequency: 50, gain: 2.0, type: 'lowshelf' },
        { frequency: 200, gain: -1.5, type: 'peaking' },
        { frequency: 800, gain: -1.0, type: 'peaking' },
        { frequency: 5000, gain: 1.5, type: 'peaking' },
        { frequency: 12000, gain: 2.0, type: 'highshelf' },
      ],
    },
  },

  POP: {
    id: 'POP',
    name: 'Modern Pop',
    description: 'Clean compression, presence lift, -1dBTP clean limit',
    genreAliases: ['pop', 'bedroom-pop', 'indie-pop'],
    config: {
      compression: {
        threshold: -20,
        ratio: 3,
        attack: 8,
        release: 120,
        makeupGain: 4,
        knee: 6,
      },
      saturation: {
        type: 'tube',
        drive: 6,
        wet: 0.2,
        color: 0.2,
      },
      limiter: {
        threshold: -1,
        attack: 0.0005,
        release: 0.03,
        enabled: true,
      },
      eq: [
        { frequency: 80, gain: -0.5, type: 'lowshelf' },
        { frequency: 300, gain: -0.8, type: 'peaking' },
        { frequency: 5000, gain: 1.5, type: 'peaking' },
        { frequency: 14000, gain: 1.0, type: 'highshelf' },
      ],
    },
  },

  JAZZ: {
    id: 'JAZZ',
    name: 'Jazz',
    description: 'Gentle threshold, long attack to preserve transients, minimal saturation',
    genreAliases: ['jazz', 'blues', 'swing', 'bebop'],
    config: {
      compression: {
        threshold: -24,
        ratio: 1.5,
        attack: 20,
        release: 200,
        makeupGain: 2,
        knee: 10,
      },
      saturation: {
        type: 'tube',
        drive: 5,
        wet: 0.08,
        color: 0.15,
      },
      limiter: {
        threshold: -1,
        attack: 0.002,
        release: 0.1,
        enabled: true,
      },
      eq: [
        { frequency: 60, gain: -1.0, type: 'lowshelf' },
        { frequency: 200, gain: 0.5, type: 'peaking' },
        { frequency: 3000, gain: 0.5, type: 'peaking' },
        { frequency: 10000, gain: 0.8, type: 'highshelf' },
      ],
    },
  },

  CLASSICAL: {
    id: 'CLASSICAL',
    name: 'Classical',
    description: 'No compression, no saturation, transparent limit only, mono-safe',
    genreAliases: ['classical', 'orchestral-chamber', 'acoustic'],
    config: {
      // ratio 1.1:1 = effectively no compression
      compression: {
        threshold: -6,
        ratio: 1.1,
        attack: 30,
        release: 300,
        makeupGain: 0,
        knee: 12,
      },
      // No saturation
      limiter: {
        threshold: -1,
        attack: 0.003,
        release: 0.15,
        enabled: true,
      },
      eq: [
        { frequency: 30, gain: -2.0, type: 'lowshelf' },
        { frequency: 8000, gain: 0.3, type: 'highshelf' },
      ],
    },
  },

  ORCHESTRAL: {
    id: 'ORCHESTRAL',
    name: 'Orchestral',
    description: 'Surgical EQ, reverb tail preserved, phase-coherent limiter',
    genreAliases: ['orchestral', 'cinematic', 'film-score', 'classical'],
    config: {
      compression: {
        threshold: -8,
        ratio: 1.2,
        attack: 40,
        release: 400,
        makeupGain: 0,
        knee: 14,
      },
      limiter: {
        threshold: -1,
        attack: 0.003,
        release: 0.2,
        enabled: true,
      },
      eq: [
        { frequency: 25, gain: -3.0, type: 'highpass' },
        { frequency: 300, gain: 0.5, type: 'peaking' },
        { frequency: 2000, gain: 0.3, type: 'peaking' },
        { frequency: 7000, gain: 0.5, type: 'highshelf' },
      ],
    },
  },

  R_AND_B: {
    id: 'R_AND_B',
    name: 'R&B / Soul',
    description: 'Smooth 2:1 comp, subtle tape saturation, slight presence dip',
    genreAliases: ['rnb-ballad', 'rnb', 'soul', 'neo-soul', 'ovo-toronto'],
    config: {
      compression: {
        threshold: -22,
        ratio: 2,
        attack: 12,
        release: 160,
        makeupGain: 3,
        knee: 8,
      },
      saturation: {
        type: 'tape',
        drive: 8,
        wet: 0.15,
        color: 0.3,
      },
      limiter: {
        threshold: -1,
        attack: 0.001,
        release: 0.06,
        enabled: true,
      },
      eq: [
        { frequency: 60, gain: 1.0, type: 'lowshelf' },
        { frequency: 250, gain: -0.5, type: 'peaking' },
        { frequency: 4000, gain: -0.5, type: 'peaking' },
        { frequency: 12000, gain: 0.8, type: 'highshelf' },
      ],
    },
  },
};

/**
 * Select the best finishing strategy for a detected genre string.
 * Falls back to POP if no match found.
 */
export function selectStrategy(genre: string): FinishingStrategy {
  const normalizedGenre = genre.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Direct key match
  const directKey = Object.keys(FINISHING_STRATEGIES).find(
    k => k.toLowerCase() === normalizedGenre
  );
  if (directKey) return FINISHING_STRATEGIES[directKey];

  // Alias match
  for (const strategy of Object.values(FINISHING_STRATEGIES)) {
    if (strategy.genreAliases.some(alias => alias === normalizedGenre || normalizedGenre.includes(alias))) {
      return strategy;
    }
  }

  // Partial match
  for (const strategy of Object.values(FINISHING_STRATEGIES)) {
    if (strategy.genreAliases.some(alias => normalizedGenre.includes(alias.split('-')[0]))) {
      return strategy;
    }
  }

  // Default to POP
  return FINISHING_STRATEGIES.POP;
}

export default FINISHING_STRATEGIES;
