import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  stemSeparationService,
  type SeparatedStems,
  type StemTranscription,
} from '../services/stemSeparationService';

function createBuffer(sampleRate: number, leadInSeconds: number, toneSeconds: number): AudioBuffer {
  const totalSamples = Math.floor(sampleRate * (leadInSeconds + toneSeconds));
  const samples = new Float32Array(totalSamples);
  const startIndex = Math.floor(sampleRate * leadInSeconds);

  for (let index = startIndex; index < totalSamples; index += 1) {
    samples[index] = 0.6;
  }

  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function createSeparatedStems(sampleRate = 48_000): SeparatedStems {
  return {
    vocals: createBuffer(sampleRate, 0.9, 1.0),
    drums: createBuffer(sampleRate, 0.2, 1.3),
    bass: createBuffer(sampleRate, 0.55, 1.1),
    other: createBuffer(sampleRate, 0.7, 0.95),
    metadata: {
      mode: 'mock',
      duration: 1.5,
      sampleRate,
      processingTimeMs: 0,
    },
  };
}

function createTranscription(): StemTranscription {
  return {
    vocals: [{ pitch: 69, startTime: 0.1, endTime: 0.6, velocity: 96 }],
    drums: [],
    bass: [{ pitch: 45, startTime: 0.05, endTime: 0.5, velocity: 88 }],
    other: [],
  };
}

describe('stemSeparationService alignment manifest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    (stemSeparationService as unknown as { audioContext: AudioContext | null }).audioContext = null;
    stemSeparationService.dispose();
  });

  test('attaches a local alignment manifest when separation completes', async () => {
    const mockedStems = createSeparatedStems();
    const mockedTranscription = createTranscription();
    const service = stemSeparationService as unknown as {
      audioContext: AudioContext | null;
      separateAudio: (audioBuffer: AudioBuffer) => Promise<SeparatedStems>;
      transcribeStems: (stems: SeparatedStems) => StemTranscription;
    };

    service.audioContext = {} as AudioContext;
    vi.spyOn(service, 'separateAudio').mockResolvedValue(mockedStems);
    vi.spyOn(service, 'transcribeStems').mockReturnValue(mockedTranscription);

    const { stems, transcription } = await stemSeparationService.processAudioFile(mockedStems.vocals);

    expect(transcription).toBe(mockedTranscription);
    expect(stems.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(stems.metadata.alignmentManifest).toBeDefined();
    expect(stems.metadata.alignmentManifest?.format).toBe('esl-proof-trainer-session-manifest');
    expect(stems.metadata.alignmentManifest?.summary.track_count).toBe(4);
    expect(stems.metadata.alignmentManifest?.summary.vocal_count).toBe(1);
    expect(stems.metadata.alignmentManifest?.summary.beat_count).toBe(1);
    expect(stems.metadata.alignmentManifest?.anchor_track_id).toBe('separated-drums');
    expect(stems.metadata.alignmentManifest?.tracks.map((track) => track.trackId)).toEqual([
      'separated-drums',
      'separated-bass',
      'separated-other',
      'separated-vocals',
    ]);
  });
});
