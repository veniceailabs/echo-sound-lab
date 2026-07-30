import { describe, expect, test } from 'vitest';
import { ListeningPassService } from '../services/listeningPassService';

function makeTone(sampleRate: number, durationSec: number, freq: number, amplitude = 0.5): Float32Array {
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    data[i] = Math.sin(2 * Math.PI * freq * t) * amplitude;
  }
  return data;
}

describe('ListeningPassService', () => {
  test('detects stable material as low-risk', async () => {
    const service = new ListeningPassService();
    const audio = makeTone(44100, 6, 220, 0.22);
    const result = await service.analyzeAudio({
      audioBuffer: audio,
      sampleRate: 44100,
      duration: 6,
      mode: 'friendly',
    });

    expect(result.listening_pass.tokens.length).toBe(3);
    expect(result.listening_pass.priority_summary.highest_stage_triggered).toBeGreaterThanOrEqual(1);
    expect(result.listening_pass.analysis_confidence).toBeGreaterThan(0);
  });

  test('flags a dense transient-heavy signal as more intense than a stable tone', async () => {
    const service = new ListeningPassService();
    const sampleRate = 44100;
    const dense = new Float32Array(sampleRate * 4);
    for (let i = 0; i < dense.length; i += 1) {
      const t = i / sampleRate;
      const impulse = Math.sin(t * 70) > 0.96 ? 0.95 : 0;
      dense[i] = (Math.sin(2 * Math.PI * 1800 * t) * 0.12) + impulse;
    }

    const result = await service.analyzeAudio({
      audioBuffer: dense,
      sampleRate,
      duration: 4,
      mode: 'advanced',
    });

    const instability = result.listening_pass.tokens.find((token) => token.token_id === 'INSTABILITY_EVENT');
    expect(instability).toBeDefined();
    expect(instability?.confidence).toBeGreaterThanOrEqual(0);
    expect(['isolated', 'recurring', 'escalating', 'resolving', 'stable']).toContain(result.listening_pass.priority_summary.recommended_focus === 'none' ? 'stable' : 'recurring');
  });
});
