/**
 * Frequency Splitter using Linkwitz-Riley 4th-order crossovers (24dB/oct).
 * 
 * A 4th-order Linkwitz-Riley crossover is created by cascading two 2nd-order 
 * Butterworth filters (Q = 0.7071). This ensures that the two adjacent bands 
 * sum together perfectly in phase (360 degrees phase shift at the crossover 
 * frequency, meaning they remain in phase).
 */

export interface MultibandSplit {
  lowBand: GainNode;
  midBand: GainNode;
  highBand: GainNode;
}

export function createMultibandSplit(
  audioContext: BaseAudioContext,
  sourceNode: AudioNode
): MultibandSplit {
  const Q_BUTTERWORTH = Math.SQRT1_2; // 0.7071
  const LOW_CROSSOVER = 250;
  const HIGH_CROSSOVER = 4000;

  // --- LOW BAND (Lowpass at 250Hz) ---
  const lowFilter1 = audioContext.createBiquadFilter();
  lowFilter1.type = 'lowpass';
  lowFilter1.frequency.value = LOW_CROSSOVER;
  lowFilter1.Q.value = Q_BUTTERWORTH;

  const lowFilter2 = audioContext.createBiquadFilter();
  lowFilter2.type = 'lowpass';
  lowFilter2.frequency.value = LOW_CROSSOVER;
  lowFilter2.Q.value = Q_BUTTERWORTH;

  const lowGain = audioContext.createGain();
  
  sourceNode.connect(lowFilter1);
  lowFilter1.connect(lowFilter2);
  lowFilter2.connect(lowGain);


  // --- MID BAND (Highpass at 250Hz + Lowpass at 4000Hz) ---
  const midHighpass1 = audioContext.createBiquadFilter();
  midHighpass1.type = 'highpass';
  midHighpass1.frequency.value = LOW_CROSSOVER;
  midHighpass1.Q.value = Q_BUTTERWORTH;

  const midHighpass2 = audioContext.createBiquadFilter();
  midHighpass2.type = 'highpass';
  midHighpass2.frequency.value = LOW_CROSSOVER;
  midHighpass2.Q.value = Q_BUTTERWORTH;

  const midLowpass1 = audioContext.createBiquadFilter();
  midLowpass1.type = 'lowpass';
  midLowpass1.frequency.value = HIGH_CROSSOVER;
  midLowpass1.Q.value = Q_BUTTERWORTH;

  const midLowpass2 = audioContext.createBiquadFilter();
  midLowpass2.type = 'lowpass';
  midLowpass2.frequency.value = HIGH_CROSSOVER;
  midLowpass2.Q.value = Q_BUTTERWORTH;

  const midGain = audioContext.createGain();

  sourceNode.connect(midHighpass1);
  midHighpass1.connect(midHighpass2);
  midHighpass2.connect(midLowpass1);
  midLowpass1.connect(midLowpass2);
  midLowpass2.connect(midGain);


  // --- HIGH BAND (Highpass at 4000Hz) ---
  const highFilter1 = audioContext.createBiquadFilter();
  highFilter1.type = 'highpass';
  highFilter1.frequency.value = HIGH_CROSSOVER;
  highFilter1.Q.value = Q_BUTTERWORTH;

  const highFilter2 = audioContext.createBiquadFilter();
  highFilter2.type = 'highpass';
  highFilter2.frequency.value = HIGH_CROSSOVER;
  highFilter2.Q.value = Q_BUTTERWORTH;

  const highGain = audioContext.createGain();

  sourceNode.connect(highFilter1);
  highFilter1.connect(highFilter2);
  highFilter2.connect(highGain);

  return {
    lowBand: lowGain,
    midBand: midGain,
    highBand: highGain
  };
}
