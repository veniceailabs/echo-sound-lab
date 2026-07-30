/**
 * Audio Feedback Service
 * Uses Web Audio API to generate celebratory synth sounds for key moments
 */

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

const playOscillator = (
  frequency: number,
  duration: number,
  waveType: OscillatorType = 'sine',
  gain: number = 0.2
) => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = waveType;
  osc.frequency.value = frequency;

  gainNode.gain.setValueAtTime(gain, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
};

/**
 * Celebration chord: C major ascending (C → E → G → C)
 * 261.63 → 329.63 → 392 → 523.25 Hz
 */
export const playCelebration = () => {
  const frequencies = [261.63, 329.63, 392, 523.25];
  frequencies.forEach((freq, i) => {
    setTimeout(() => {
      playOscillator(freq, 0.3, 'sine', 0.15);
    }, i * 100);
  });
};

/**
 * Error sound: Minor chord descending
 * A4 → F#4 → D4 (440 → 369.99 → 293.66 Hz)
 */
export const playError = () => {
  const frequencies = [440, 369.99, 293.66];
  frequencies.forEach((freq, i) => {
    setTimeout(() => {
      playOscillator(freq, 0.2, 'sine', 0.12);
    }, i * 80);
  });
};

/**
 * Proof reveal: Ethereal pad swell
 * Plays bell-like tones with longer sustain
 */
export const playProofReveal = () => {
  const ctx = getAudioContext();
  // G5, B5, D6 (ethereal bell chord)
  const frequencies = [783.99, 987.77, 1174.66];

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime + i * 0.05);
    osc.stop(ctx.currentTime + 2);
  });
};

/**
 * Milestone unlock: Rising chord glissando
 */
export const playMilestoneUnlock = () => {
  const frequencies = [392, 440, 494, 523.25, 587.33];
  frequencies.forEach((freq, i) => {
    setTimeout(() => {
      playOscillator(freq, 0.15, 'square', 0.08);
    }, i * 60);
  });
};
