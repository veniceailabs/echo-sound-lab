/**
 * Arrangement Analyzer - Understands song structure and energy flow
 * Provides context-aware feedback about mix decisions per section
 */

export interface SectionAnalysis {
  name: string;           // intro, verse, pre-chorus, chorus, bridge, outro
  startTime: number;      // seconds
  endTime: number;        // seconds
  energy: number;         // 0-1 relative energy level
  density: number;        // 0-1 how "full" the section is
  rmsDb: number;          // average loudness
  peakDb: number;         // peak loudness
  dynamics: number;       // crest factor
}

export interface ArrangementAnalysis {
  sections: SectionAnalysis[];
  energyCurve: number[];           // energy over time (per second)
  dynamicRange: number;            // overall dynamic range
  loudestSection: string;
  quietestSection: string;
  suggestedFocus: string[];        // "verse feels too dense", "hook needs more lift"
  overallFlow: 'building' | 'steady' | 'dynamic' | 'flat';
}

export interface ArrangementFeedback {
  sectionName: string;
  issue: string;
  suggestion: string;
  emotionalContext: string;
}

/**
 * Analyze audio buffer to extract arrangement/section information
 */
export const analyzeArrangement = (buffer: AudioBuffer): ArrangementAnalysis => {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const duration = buffer.duration;

  // Calculate energy per second
  const energyCurve: number[] = [];
  const samplesPerSecond = sampleRate;

  for (let sec = 0; sec < Math.floor(duration); sec++) {
    const start = sec * samplesPerSecond;
    const end = Math.min(start + samplesPerSecond, channelData.length);

    let sum = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(channelData[i]);
      sum += abs * abs;
      if (abs > peak) peak = abs;
    }

    const rms = Math.sqrt(sum / (end - start));
    energyCurve.push(rms);
  }

  // Normalize energy curve
  const maxEnergy = Math.max(...energyCurve);
  const normalizedEnergy = energyCurve.map(e => e / (maxEnergy || 1));

  // Detect sections based on energy changes
  const sections = detectSections(normalizedEnergy, energyCurve, sampleRate, channelData);

  // Calculate overall metrics
  const dynamicRange = calculateDynamicRange(energyCurve);

  // Find loudest/quietest sections
  let loudestSection = sections[0]?.name || 'unknown';
  let quietestSection = sections[0]?.name || 'unknown';
  let maxRms = -Infinity;
  let minRms = Infinity;

  for (const section of sections) {
    if (section.rmsDb > maxRms) {
      maxRms = section.rmsDb;
      loudestSection = section.name;
    }
    if (section.rmsDb < minRms) {
      minRms = section.rmsDb;
      quietestSection = section.name;
    }
  }

  // Determine overall flow
  const overallFlow = determineFlow(normalizedEnergy);

  // Generate focus suggestions
  const suggestedFocus = generateFocusSuggestions(sections, normalizedEnergy);

  return {
    sections,
    energyCurve: normalizedEnergy,
    dynamicRange,
    loudestSection,
    quietestSection,
    suggestedFocus,
    overallFlow,
  };
};

/**
 * Detect sections based on energy changes
 */
const detectSections = (
  normalizedEnergy: number[],
  rawEnergy: number[],
  sampleRate: number,
  channelData: Float32Array
): SectionAnalysis[] => {
  const sections: SectionAnalysis[] = [];
  const minSectionLength = 8; // minimum 8 seconds per section

  // Simple section detection based on energy thresholds
  let currentSectionStart = 0;
  let currentEnergy = normalizedEnergy[0] || 0;
  let sectionIndex = 0;

  const thresholds = {
    low: 0.3,
    mid: 0.6,
    high: 0.8,
  };

  for (let i = 1; i < normalizedEnergy.length; i++) {
    const energy = normalizedEnergy[i];
    const energyChange = Math.abs(energy - currentEnergy);
    const sectionLength = i - currentSectionStart;

    // Detect significant energy change
    if (energyChange > 0.2 && sectionLength >= minSectionLength) {
      // Close current section
      const sectionName = getSectionName(currentEnergy, sectionIndex, normalizedEnergy.length, currentSectionStart);

      const sectionRms = calculateSectionRms(rawEnergy, currentSectionStart, i);
      const sectionPeak = calculateSectionPeak(channelData, currentSectionStart * sampleRate, i * sampleRate);

      sections.push({
        name: sectionName,
        startTime: currentSectionStart,
        endTime: i,
        energy: currentEnergy,
        density: calculateDensity(normalizedEnergy.slice(currentSectionStart, i)),
        rmsDb: 20 * Math.log10(sectionRms || 0.0001),
        peakDb: 20 * Math.log10(sectionPeak || 0.0001),
        dynamics: sectionPeak / (sectionRms || 0.0001),
      });

      currentSectionStart = i;
      currentEnergy = energy;
      sectionIndex++;
    }
  }

  // Add final section
  if (currentSectionStart < normalizedEnergy.length - 1) {
    const sectionName = getSectionName(currentEnergy, sectionIndex, normalizedEnergy.length, currentSectionStart);
    const sectionRms = calculateSectionRms(rawEnergy, currentSectionStart, normalizedEnergy.length);
    const sectionPeak = calculateSectionPeak(channelData, currentSectionStart * sampleRate, channelData.length);

    sections.push({
      name: sectionName,
      startTime: currentSectionStart,
      endTime: normalizedEnergy.length,
      energy: currentEnergy,
      density: calculateDensity(normalizedEnergy.slice(currentSectionStart)),
      rmsDb: 20 * Math.log10(sectionRms || 0.0001),
      peakDb: 20 * Math.log10(sectionPeak || 0.0001),
      dynamics: sectionPeak / (sectionRms || 0.0001),
    });
  }

  // If no sections detected, create one for entire track
  if (sections.length === 0) {
    const avgEnergy = normalizedEnergy.reduce((a, b) => a + b, 0) / normalizedEnergy.length;
    const avgRms = rawEnergy.reduce((a, b) => a + b, 0) / rawEnergy.length;

    sections.push({
      name: 'main',
      startTime: 0,
      endTime: normalizedEnergy.length,
      energy: avgEnergy,
      density: calculateDensity(normalizedEnergy),
      rmsDb: 20 * Math.log10(avgRms || 0.0001),
      peakDb: 0,
      dynamics: 1,
    });
  }

  return sections;
};

/**
 * Guess section name based on energy and position
 */
const getSectionName = (energy: number, index: number, totalLength: number, startTime: number): string => {
  const positionRatio = startTime / totalLength;

  // Intro/Outro detection
  if (positionRatio < 0.1 && energy < 0.5) return 'intro';
  if (positionRatio > 0.85 && energy < 0.6) return 'outro';

  // Energy-based naming
  if (energy > 0.75) return index === 0 ? 'drop' : 'chorus';
  if (energy > 0.5) return 'verse';
  if (energy > 0.3) return 'pre-chorus';

  return 'breakdown';
};

/**
 * Calculate average RMS for a section
 */
const calculateSectionRms = (rawEnergy: number[], start: number, end: number): number => {
  const slice = rawEnergy.slice(start, end);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
};

/**
 * Calculate peak for a section
 */
const calculateSectionPeak = (channelData: Float32Array, startSample: number, endSample: number): number => {
  let peak = 0;
  const start = Math.floor(startSample);
  const end = Math.min(Math.floor(endSample), channelData.length);

  for (let i = start; i < end; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
};

/**
 * Calculate density (how consistent the energy is)
 */
const calculateDensity = (energySlice: number[]): number => {
  if (energySlice.length < 2) return 0.5;

  const avg = energySlice.reduce((a, b) => a + b, 0) / energySlice.length;
  const variance = energySlice.reduce((sum, e) => sum + Math.pow(e - avg, 2), 0) / energySlice.length;

  // Lower variance = higher density (more consistent)
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 2));
};

/**
 * Calculate overall dynamic range
 */
const calculateDynamicRange = (energyCurve: number[]): number => {
  if (energyCurve.length === 0) return 0;

  const sorted = [...energyCurve].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const high = sorted[Math.floor(sorted.length * 0.9)] || 0;

  if (low === 0) return 20;
  return 20 * Math.log10(high / low);
};

/**
 * Determine overall energy flow pattern
 */
const determineFlow = (energyCurve: number[]): 'building' | 'steady' | 'dynamic' | 'flat' => {
  if (energyCurve.length < 10) return 'steady';

  const firstHalf = energyCurve.slice(0, Math.floor(energyCurve.length / 2));
  const secondHalf = energyCurve.slice(Math.floor(energyCurve.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  // Calculate variance
  const variance = energyCurve.reduce((sum, e) => {
    const avg = energyCurve.reduce((a, b) => a + b, 0) / energyCurve.length;
    return sum + Math.pow(e - avg, 2);
  }, 0) / energyCurve.length;

  if (variance < 0.02) return 'flat';
  if (variance > 0.1) return 'dynamic';
  if (avgSecond > avgFirst * 1.2) return 'building';

  return 'steady';
};

/**
 * Generate focus suggestions based on arrangement analysis
 */
const generateFocusSuggestions = (sections: SectionAnalysis[], energyCurve: number[]): string[] => {
  const suggestions: string[] = [];

  // Check for flat dynamics
  const variance = calculateDensity(energyCurve);
  if (variance > 0.8) {
    suggestions.push('Track feels very consistent - consider adding more dynamic contrast between sections');
  }

  // Check for weak hooks
  const choruses = sections.filter(s => s.name === 'chorus' || s.name === 'drop');
  const verses = sections.filter(s => s.name === 'verse');

  if (choruses.length > 0 && verses.length > 0) {
    const avgChorusEnergy = choruses.reduce((a, b) => a + b.energy, 0) / choruses.length;
    const avgVerseEnergy = verses.reduce((a, b) => a + b.energy, 0) / verses.length;

    if (avgChorusEnergy < avgVerseEnergy * 1.15) {
      suggestions.push('Chorus/hook needs more lift - try pulling back verse energy or boosting hook');
    }
  }

  // Check for dense verses
  for (const section of sections) {
    if (section.name === 'verse' && section.density > 0.85) {
      suggestions.push(`Verse at ${Math.floor(section.startTime)}s feels dense - consider stripping back for contrast`);
    }
  }

  // Check for abrupt transitions
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1];
    const curr = sections[i];
    const energyJump = Math.abs(curr.energy - prev.energy);

    if (energyJump > 0.5) {
      suggestions.push(`Large energy jump at ${Math.floor(curr.startTime)}s - consider a transition/build`);
    }
  }

  return suggestions;
};

/**
 * Get arrangement-aware processing suggestions
 */
export const getArrangementFeedback = (
  analysis: ArrangementAnalysis,
  genreContext?: string
): ArrangementFeedback[] => {
  const feedback: ArrangementFeedback[] = [];

  for (const section of analysis.sections) {
    // Check for section-specific issues
    if (section.name === 'verse' && section.energy > 0.7) {
      feedback.push({
        sectionName: section.name,
        issue: 'Verse energy is high',
        suggestion: 'Pull back compression/limiting in verse to give chorus more impact',
        emotionalContext: 'Verses should create anticipation - save the full energy for the hook',
      });
    }

    if (section.name === 'chorus' && section.dynamics < 1.5) {
      feedback.push({
        sectionName: section.name,
        issue: 'Chorus feels compressed',
        suggestion: 'Ease off limiting to let the chorus breathe and hit harder',
        emotionalContext: 'The hook should feel like a release - dynamics create emotional impact',
      });
    }

    if (section.name === 'intro' && section.density > 0.7) {
      feedback.push({
        sectionName: section.name,
        issue: 'Intro feels busy',
        suggestion: 'Strip back the intro - let elements enter gradually',
        emotionalContext: 'Intros should build curiosity, not overwhelm immediately',
      });
    }

    if (section.name === 'breakdown' && section.energy > 0.5) {
      feedback.push({
        sectionName: section.name,
        issue: 'Breakdown lacks contrast',
        suggestion: 'Drop more elements, reduce low end, create space',
        emotionalContext: 'Breakdowns need tension - the drop hits harder when you pull back first',
      });
    }
  }

  // Overall flow feedback
  if (analysis.overallFlow === 'flat') {
    feedback.push({
      sectionName: 'overall',
      issue: 'Track lacks dynamic movement',
      suggestion: 'Automate levels between sections - verse 2-3dB quieter than chorus',
      emotionalContext: 'Great mixes breathe - they have quiet moments that make loud moments hit',
    });
  }

  return feedback;
};

export default analyzeArrangement;
