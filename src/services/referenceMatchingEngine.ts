/**
 * Reference Matching Engine
 * Analyzes reference audio to extract and apply mastering characteristics
 */

export interface ReferenceAnalysis {
  referenceName: string;
  lufs: number;
  loudnessRange: number;
  truePeak: number;
  stereoWidth: number;
  spectralBalance: {
    low: number; // 20-250 Hz
    mid: number; // 250-2k Hz
    high: number; // 2k-8k Hz
    air: number; // 8k+ Hz
  };
  characteristics: string[];
  appliedEQCurve: {
    low: number; // dB adjustment
    mid: number;
    high: number;
    air: number;
  };
}

export interface ReferenceMatch {
  trackName: string;
  timestamp: string;
  referenceAnalysis: ReferenceAnalysis;
  appliedChanges: {
    lufsAdjustment: number;
    eqAdjustments: {
      low: number;
      mid: number;
      high: number;
      air: number;
    };
    compressionCharacter: string;
    saturationAmount: number;
  };
}

/**
 * Analyze reference audio to extract mastering characteristics
 */
export const analyzeReference = (
  referenceMetrics: any,
  referenceName: string = 'Reference'
): ReferenceAnalysis => {
  const lufs = referenceMetrics?.lufs?.integrated ?? -14;
  const loudnessRange = referenceMetrics?.lufs?.loudnessRange ?? 8;
  const truePeak = referenceMetrics?.lufs?.truePeak ?? -1;
  const stereoWidth = referenceMetrics?.advancedMetrics?.stereoWidth ?? 80;

  // Estimate spectral balance from metrics (simplified heuristic)
  // In production, use actual FFT analysis
  const lowEnergy = Math.max(0, stereoWidth - 20) / 100;
  const midEnergy = 0.6;
  const highEnergy = Math.min(1, (truePeak + 5) / 5);
  const airEnergy = loudnessRange / 15;

  const spectralBalance = {
    low: lowEnergy * 100,
    mid: midEnergy * 100,
    high: highEnergy * 100,
    air: airEnergy * 100,
  };

  // Derive EQ curve from spectral balance
  const appliedEQCurve = {
    low: (lowEnergy - 0.5) * 3, // -1.5 to +1.5 dB
    mid: 0, // Reference mid as neutral
    high: (highEnergy - 0.5) * 2.5,
    air: (airEnergy - 0.5) * 2,
  };

  const characteristics: string[] = [];
  if (lowEnergy > 0.6) characteristics.push('Warm bass');
  if (highEnergy > 0.7) characteristics.push('Bright highs');
  if (loudnessRange > 10) characteristics.push('Dynamic');
  if (loudnessRange < 5) characteristics.push('Aggressive');
  if (stereoWidth > 90) characteristics.push('Wide stereo');
  if (truePeak > -2) characteristics.push('Punchy peaks');

  return {
    referenceName,
    lufs,
    loudnessRange,
    truePeak,
    stereoWidth,
    spectralBalance,
    characteristics: characteristics.length > 0 ? characteristics : ['Neutral'],
    appliedEQCurve,
  };
};

/**
 * Apply reference analysis to user's track
 */
export const applyReferenceMatch = (
  userLUFS: number,
  userMetrics: any,
  referenceAnalysis: ReferenceAnalysis
): ReferenceMatch => {
  const lufsAdjustment = referenceAnalysis.lufs - userLUFS;
  const compressionRatio = Math.max(1, 10 / referenceAnalysis.loudnessRange);
  const saturationAmount = referenceAnalysis.truePeak > -1 ? 0.3 : 0.1;

  return {
    trackName: 'User Track',
    timestamp: new Date().toISOString(),
    referenceAnalysis,
    appliedChanges: {
      lufsAdjustment,
      eqAdjustments: referenceAnalysis.appliedEQCurve,
      compressionCharacter:
        compressionRatio > 4 ? 'Aggressive' : compressionRatio > 2 ? 'Moderate' : 'Gentle',
      saturationAmount,
    },
  };
};

/**
 * Generate readable summary of reference match
 */
export const generateReferenceReport = (match: ReferenceMatch): string => {
  const { appliedChanges, referenceAnalysis } = match;
  const lufsStr =
    appliedChanges.lufsAdjustment > 0
      ? `+${appliedChanges.lufsAdjustment.toFixed(1)}`
      : appliedChanges.lufsAdjustment.toFixed(1);

  return `
Applied "${referenceAnalysis.referenceName}" reference characteristics:

🎯 Loudness: ${lufsStr} dB
📊 Compression: ${appliedChanges.compressionCharacter}
✨ Saturation: ${Math.round(appliedChanges.saturationAmount * 100)}%

📈 EQ Adjustments:
   • Low (20-250 Hz): ${appliedChanges.eqAdjustments.low > 0 ? '+' : ''}${appliedChanges.eqAdjustments.low.toFixed(1)} dB
   • Mid (250-2k Hz): ${appliedChanges.eqAdjustments.mid > 0 ? '+' : ''}${appliedChanges.eqAdjustments.mid.toFixed(1)} dB
   • High (2k-8k Hz): ${appliedChanges.eqAdjustments.high > 0 ? '+' : ''}${appliedChanges.eqAdjustments.high.toFixed(1)} dB
   • Air (8k+ Hz): ${appliedChanges.eqAdjustments.air > 0 ? '+' : ''}${appliedChanges.eqAdjustments.air.toFixed(1)} dB

🎨 Reference characteristics: ${referenceAnalysis.characteristics.join(', ')}
  `.trim();
};
