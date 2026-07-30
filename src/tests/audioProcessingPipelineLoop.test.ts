import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AudioProcessingPipeline } from '../services/audioProcessingPipeline';
import { audioEngine } from '../services/audioEngine';

const renderCalls: any[] = [];

function makeBuffer(label: string, dr: number, lufs: number, peakDb: number): any {
  const left = Float32Array.from([0.25, -0.15, 0.08]);
  const right = Float32Array.from([0.2, -0.1, 0.05]);
  return {
    label,
    __dr: dr,
    __lufs: lufs,
    __metrics: {
      rms: -18,
      peak: peakDb,
      duration: 1,
      spectralCentroid: 0,
      spectralRolloff: 0,
      crestFactor: dr,
    },
    numberOfChannels: 2,
    sampleRate: 48000,
    length: left.length,
    duration: 1,
    getChannelData(channel: number) {
      return channel === 0 ? left : right;
    },
  };
}

vi.mock('../services/audioEngine', () => ({
  audioEngine: {
    setBuffer: vi.fn(),
    setProcessedBuffer: vi.fn(),
    renderProcessedAudio: vi.fn(async (config: any, sourceBuffer: any) => {
      renderCalls.push({ config, sourceBuffer });
      if (renderCalls.length === 1) {
        return makeBuffer('attempt-1', 4.8, -17.8, -0.15);
      }
      return makeBuffer('attempt-2', 7.2, -14.2, -0.7);
    }),
  },
}));

vi.mock('../services/processingActionUtils', () => ({
  actionsToConfig: vi.fn(() => ({
    compression: { threshold: -22, ratio: 3.4, attack: 0.01, release: 0.2, makeupGain: 2 },
    limiter: { threshold: -0.2, release: 0.12, ratio: 4 },
    saturation: { type: 'tube', amount: 0.45, mix: 0.85 },
    motionReverb: { mix: 0.18, decay: 1.4, preDelay: 0.02 },
    delay: { time: 0.24, feedback: 0.35, mix: 0.16 },
    stereoImager: { lowWidth: 1.15, midWidth: 1.15, highWidth: 1.15, crossovers: [300, 5000] },
  })),
}));

vi.mock('../services/dsp/analysisUtils', () => ({
  calculateLoudnessRange: vi.fn((buffer: any) => buffer.__dr),
}));

vi.mock('../services/mixAnalysis', () => ({
  mixAnalysisService: {
    analyzeStaticMetrics: vi.fn((buffer: any) => buffer.__metrics),
  },
}));

vi.mock('../services/lufsMetering', () => ({
  lufsMeteringService: {
    calculateIntegratedLUFS: vi.fn(async (buffer: any) => buffer.__lufs),
  },
}));

describe('AudioProcessingPipeline quality loop', () => {
  beforeEach(() => {
    renderCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders, measures, relaxes, and commits the first safe attempt', async () => {
    const pipeline = new AudioProcessingPipeline();
    const original = makeBuffer('original', 8.4, -13.8, -3.5);
    await pipeline.loadAudio(original as AudioBuffer);

    const result = await pipeline.processAudio([{ id: 'dummy', description: 'dummy', reversibility: 'Fully' } as any], {
      preservationMode: 'balanced',
    });

    expect(renderCalls.length).toBe(2);
    expect(result.qualityLoop?.enabled).toBe(true);
    expect(result.qualityLoop?.attempts).toHaveLength(2);
    expect(result.qualityLoop?.attempts[0]?.accepted).toBe(false);
    expect(result.qualityLoop?.attempts[1]?.accepted).toBe(true);
    expect(result.qualityLoop?.selectedAttempt).toBe(2);
    expect(result.preservation.blocked).toBe(false);
    expect((result.processedBuffer as any).label).toBe('attempt-2');
  });

  test('searches perceptual and reference candidates before falling back to broader safety relaxation', async () => {
    const pipeline = new AudioProcessingPipeline();
    const original = makeBuffer('original', 8.4, -13.8, -3.5);
    await pipeline.loadAudio(original as AudioBuffer);

    (audioEngine.renderProcessedAudio as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (config: any, sourceBuffer: any) => {
      renderCalls.push({ config, sourceBuffer });
      if ((config.compression?.ratio ?? 0) > 2.3) {
        return makeBuffer('perceptual-fit', 7.1, -14.1, -0.7);
      }
      return makeBuffer('baseline-fail', 4.3, -17.9, -0.12);
    });

    const result = await pipeline.processAudio([{ id: 'dummy', description: 'dummy', reversibility: 'Fully' } as any], {
      preservationMode: 'balanced',
      perceptualField: {
        clarity: 0.82,
        density: 0.38,
        motion: 0.77,
        width: 0.71,
        depth: 0.68,
        punch: 0.74,
        restraint: 0.48,
        lift: 0.79,
        risk: 0.5,
        targetLufs: -13.4,
        targetDynamicRange: 6.1,
        peakCeilingDb: -0.7,
        stabilityScore: 0.5,
        rationale: ['high lift', 'controlled motion'],
      },
      referenceWorldAnalysis: {
        shouldApply: true,
        analysisFingerprint: 'ref-123',
        bestProfileId: 'balanced_modern_release',
        bestProfile: {
          id: 'balanced_modern_release',
          label: 'Balanced Modern Release',
          aliases: ['General release lane'],
          description: 'A neutral release lane.',
          vocalForwardnessTarget: 0.67,
          brightnessCorridor: [0.44, 0.62],
          dynamicTolerance: [0.5, 0.72],
          hookLiftTarget: [0.52, 0.72],
          widthTarget: [0.35, 0.6],
          adlibDepthStyle: 'supportive',
          lowEndWeight: [0.42, 0.66],
          translationPriority: 'maximum',
          finishAggression: [0.5, 0.74],
          pitchPreset: { enabled: true, mode: 'chromatic', key: 'C', scale: 'chromatic', strength: 22, retuneSpeed: 46, humanize: 78, formantPreserve: true },
          studioNotes: ['neutral lane'],
        },
        profileScores: [],
        recommendedPitchPreset: { enabled: true, mode: 'chromatic', key: 'C', scale: 'chromatic', strength: 22, retuneSpeed: 46, humanize: 78, formantPreserve: true },
        summary: 'Balanced Modern Release is the strongest lane match.',
        rationale: 'reference lane',
        riskNotes: [],
        interactionNotes: [],
      } as any,
    });

    expect(renderCalls.length).toBeGreaterThanOrEqual(2);
    expect(renderCalls[1].config.compression?.ratio).not.toBe(renderCalls[0].config.compression?.ratio);
    expect(result.qualityLoop?.attempts[0]?.candidate).toBe('bounded baseline');
    expect(result.qualityLoop?.attempts[1]?.candidate).toBe('perceptual target');
    expect((result.processedBuffer as any).label).toBe('perceptual-fit');
  });

  test('uses reference delta shaping when EQ and stereo deltas need a different lane', async () => {
    const pipeline = new AudioProcessingPipeline();
    const original = makeBuffer('original', 8.4, -13.8, -3.5);
    await pipeline.loadAudio(original as AudioBuffer);

    const actionsToConfig = await import('../services/processingActionUtils');
    (actionsToConfig.actionsToConfig as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      compression: { threshold: -22, ratio: 2.0, attack: 0.01, release: 0.2, makeupGain: 2 },
      limiter: { threshold: -0.2, release: 0.12, ratio: 4 },
      saturation: { type: 'tube', amount: 0.25, mix: 0.75 },
      motionReverb: { mix: 0.12, decay: 1.2, preDelay: 0.02 },
      delay: { time: 0.24, feedback: 0.25, mix: 0.1 },
      stereoImager: { lowWidth: 1.02, midWidth: 1.02, highWidth: 1.02, crossovers: [300, 5000] },
      eq: [
        { frequency: 90, gain: 0, type: 'lowshelf', q: 0.7 },
        { frequency: 800, gain: 0, type: 'peaking', q: 1 },
        { frequency: 7800, gain: 0, type: 'highshelf', q: 0.7 },
      ],
    }));

    (audioEngine.renderProcessedAudio as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (config: any, sourceBuffer: any) => {
      renderCalls.push({ config, sourceBuffer });
      if (config.eq?.some((band: any) => Math.abs(band.gain ?? 0) > 0.01)) {
        return makeBuffer('reference-delta-fit', 7.4, -13.9, -0.68);
      }
      return makeBuffer('reference-delta-fail', 4.1, -17.8, -0.12);
    });

    const result = await pipeline.processAudio([{ id: 'dummy', description: 'dummy', reversibility: 'Fully' } as any], {
      preservationMode: 'balanced',
      perceptualField: {
        clarity: 0.68,
        density: 0.46,
        motion: 0.42,
        width: 0.43,
        depth: 0.56,
        punch: 0.55,
        restraint: 0.63,
        lift: 0.48,
        risk: 0.42,
        targetLufs: -13.7,
        targetDynamicRange: 6.3,
        peakCeilingDb: -0.75,
        stabilityScore: 0.57,
        rationale: ['broad correction'],
      },
      referenceDeltaAnalysis: {
        shouldApply: true,
        analysisFingerprint: 'delta-123',
        matchScore: 63,
        loudness: { current: -13.8, reference: -14.2, delta: 0.4, severity: 'low' },
        dynamics: { crestFactorCurrent: 8.4, crestFactorReference: 7.9, delta: 0.5, severity: 'low' },
        tonal: {
          low: -0.18,
          lowMid: 0.02,
          mid: -0.03,
          highMid: 0.14,
          high: -0.11,
          current: { low: 0.28, lowMid: 0.25, mid: 0.22, highMid: 0.14, high: 0.11 },
          reference: { low: 0.46, lowMid: 0.23, mid: 0.25, highMid: 0.0, high: 0.22 },
        },
        stereo: {
          low: -0.02,
          mid: 0.08,
          high: 0.11,
          current: { low: 0.48, mid: 0.49, high: 0.52 },
          reference: { low: 0.5, mid: 0.41, high: 0.41 },
        },
        summary: 'Delta is still open.',
        recommendations: ['Tighten the upper-band width and restore the tonal tilt.'],
        riskNotes: [],
        interactionNotes: [],
      } as any,
    });

    expect(renderCalls.length).toBeGreaterThanOrEqual(3);
    expect(result.qualityLoop?.attempts[0]?.candidate).toBe('bounded baseline');
    expect(result.qualityLoop?.attempts[1]?.candidate).toBe('perceptual target');
    expect(result.qualityLoop?.attempts[2]?.candidate).toBe('reference delta correction');
    expect((result.processedBuffer as any).label).toBe('reference-delta-fit');
  });
});
