/**
 * Synthetic stress stem for doctrine diagnostics.
 * Generates high-transiency material to pressure limiter + preservation guards.
 */
export async function generateStressStem(sampleRate: number = 44100): Promise<AudioBuffer> {
  const durationSeconds = 5;
  const length = Math.floor(sampleRate * durationSeconds);
  const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineContext = new OfflineContextClass(2, length, sampleRate);
  const buffer = offlineContext.createBuffer(2, length, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;

    // Kick pulse every 500ms with quick exponential drop.
    const kickPhase = t % 0.5;
    const kickTrigger = kickPhase < 0.05;
    const kickFreq = 60 * Math.exp(-20 * kickPhase);
    const kick = kickTrigger ? Math.sin(2 * Math.PI * kickFreq * t) * 0.95 : 0;

    // Out-of-phase noise burst every 1s (offset by 250ms) to stress spatial guards.
    const snarePhase = (t + 0.25) % 1.0;
    const snareTrigger = snarePhase < 0.1;
    const noise = (Math.random() * 2 - 1) * 0.8;
    const snareLeft = snareTrigger ? noise : 0;
    const snareRight = snareTrigger ? -noise : 0;

    // Fast hat-like texture to increase transient density.
    const hatTrigger = (t % 0.125) < 0.02;
    const hatNoise = hatTrigger ? (Math.random() * 2 - 1) * 0.25 : 0;

    left[i] = kick + snareLeft + hatNoise;
    right[i] = kick + snareRight - hatNoise;
  }

  return buffer;
}

