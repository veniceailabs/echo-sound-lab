import { describe, expect, test } from 'vitest';
import {
  analyzeProofTrainerTrack,
  buildProofTrainerSessionManifest,
  buildProofTrainerSessionManifestFromTracks,
  estimateProofTrainerWaveformOffset,
  type ProofTrainerDecodedTrack,
} from '../services/sessionAlignmentService';

function createBuffer(sampleRate: number, leadInSeconds: number, toneSeconds: number): AudioBuffer {
  const totalSamples = Math.floor(sampleRate * (leadInSeconds + toneSeconds));
  const samples = new Float32Array(totalSamples);
  const startIndex = Math.floor(sampleRate * leadInSeconds);
  for (let index = startIndex; index < totalSamples; index += 1) {
    samples[index] = 0.65;
  }

  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function createPatternBuffer(sampleRate: number, leadInSeconds: number, patternOffsetSeconds: number): AudioBuffer {
  const totalSeconds = leadInSeconds + patternOffsetSeconds + 1.2;
  const totalSamples = Math.floor(sampleRate * totalSeconds);
  const samples = new Float32Array(totalSamples);
  const startIndex = Math.floor(sampleRate * (leadInSeconds + patternOffsetSeconds));
  const pulseLength = Math.floor(sampleRate * 0.05);
  const gapLength = Math.floor(sampleRate * 0.04);
  const pulseLevels = [0.9, 0.25, 0.8, 0.4, 0.7, 0.18];

  let cursor = startIndex;
  for (const level of pulseLevels) {
    for (let index = 0; index < pulseLength && cursor + index < samples.length; index += 1) {
      samples[cursor + index] = level;
    }
    cursor += pulseLength + gapLength;
  }

  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function createFragmentedBuffer(sampleRate: number, segments: Array<{ startSeconds: number; durationSeconds: number; level: number }>): AudioBuffer {
  const totalSeconds = segments.reduce((max, segment) => Math.max(max, segment.startSeconds + segment.durationSeconds), 0) + 0.2;
  const samples = new Float32Array(Math.floor(sampleRate * totalSeconds));

  for (const segment of segments) {
    const start = Math.floor(segment.startSeconds * sampleRate);
    const end = Math.min(samples.length, Math.floor((segment.startSeconds + segment.durationSeconds) * sampleRate));
    for (let index = start; index < end; index += 1) {
      samples[index] = segment.level;
    }
  }

  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function createTrack(
  trackId: string,
  fileName: string,
  role: string,
  kind: ProofTrainerDecodedTrack['kind'],
  sampleRate: number,
  leadInSeconds: number,
  toneSeconds: number,
): ProofTrainerDecodedTrack {
  return {
    trackId,
    fileName,
    role,
    kind,
    buffer: createBuffer(sampleRate, leadInSeconds, toneSeconds),
  };
}

describe('sessionAlignmentService', () => {
  test('detects lead-in silence and builds a local multi-file manifest', () => {
    const sampleRate = 48_000;
    const beat = createTrack('beat-1', 'dontHoldback beat.wav', 'beat', 'beat', sampleRate, 1.1, 1.2);
    const vocal = createTrack('vocal-1', 'Verse Take 2.wav', 'lead', 'vocal', sampleRate, 1.8, 1.0);
    const reference = createTrack('reference-1', 'dontHoldback master.wav', 'reference', 'reference', sampleRate, 0.45, 1.4);

    const manifest = buildProofTrainerSessionManifest({
      beatFile: beat,
      vocalFiles: [vocal],
      referenceFile: reference,
      referenceStyle: 'proof_mix_trainer',
      requestText: 'Line up the raw stem against the master.',
      acceptToVault: true,
    });

    expect(manifest.format).toBe('esl-proof-trainer-session-manifest');
    expect(manifest.summary.track_count).toBe(3);
    expect(manifest.summary.beat_count).toBe(1);
    expect(manifest.summary.vocal_count).toBe(1);
    expect(manifest.summary.reference_count).toBe(1);
    expect(manifest.anchor_track_id).toBe('beat-1');

    const beatAnalysis = analyzeProofTrainerTrack(beat);
    const referenceTrack = manifest.tracks.find((track) => track.trackId === 'reference-1');
    const beatTrack = manifest.tracks.find((track) => track.trackId === 'beat-1');
    const vocalTrack = manifest.tracks.find((track) => track.trackId === 'vocal-1');

    expect(beatAnalysis.alignment_score).toBeGreaterThan(0);
    expect(referenceTrack).toBeDefined();
    expect(beatTrack).toBeDefined();
    expect(vocalTrack).toBeDefined();
    expect(referenceTrack?.start_timestamp_ms).toBe(0);
    expect(beatTrack?.start_timestamp_ms).toBeGreaterThan(referenceTrack?.start_timestamp_ms ?? 0);
    expect(vocalTrack?.start_timestamp_ms).toBeGreaterThan(beatTrack?.start_timestamp_ms ?? 0);
    expect(manifest.duration_ms).toBeGreaterThan(vocalTrack?.start_timestamp_ms ?? 0);
    expect(manifest.tracks[0]?.start_timestamp_ms).toBeLessThanOrEqual(manifest.tracks[1]?.start_timestamp_ms ?? 0);
  });

  test('aligns arbitrary stem tracks on the local timing grid', () => {
    const sampleRate = 48_000;
    const drums = createTrack('stem-drums', 'Drums Print.wav', 'beat', 'beat', sampleRate, 1.25, 1.1);
    const bass = createTrack('stem-bass', 'Bass Print.wav', 'bass', 'other', sampleRate, 0.6, 1.0);
    const vocals = createTrack('stem-vocals', 'Lead Vocal.wav', 'lead', 'vocal', sampleRate, 0.85, 1.0);

    const manifest = buildProofTrainerSessionManifestFromTracks([drums, bass, vocals], {
      referenceStyle: 'multistem_workspace_local',
      requestText: 'Align the loaded stems locally.',
      acceptToVault: false,
    });

    expect(manifest.format).toBe('esl-proof-trainer-session-manifest');
    expect(manifest.summary.track_count).toBe(3);
    expect(manifest.anchor_track_id).toBe('stem-drums');
    expect(manifest.tracks[0]?.start_timestamp_ms).toBe(0);
    expect(manifest.tracks[1]?.start_timestamp_ms).toBeGreaterThanOrEqual(manifest.tracks[0]?.start_timestamp_ms ?? 0);
    expect(manifest.tracks[2]?.start_timestamp_ms).toBeGreaterThanOrEqual(manifest.tracks[1]?.start_timestamp_ms ?? 0);
  });

  test('estimates waveform offsets from matching material with different timing', () => {
    const sampleRate = 48_000;
    const anchor = createTrack('anchor', 'Lead.wav', 'lead', 'vocal', sampleRate, 0.25, 1.0);
    const shifted = {
      ...anchor,
      trackId: 'shifted',
      fileName: 'Lead Shifted.wav',
      buffer: createPatternBuffer(sampleRate, 0.25, 0.14),
    };
    anchor.buffer = createPatternBuffer(sampleRate, 0.25, 0);

    const estimate = estimateProofTrainerWaveformOffset(anchor, shifted);

    expect(estimate.usedFallback).toBe(false);
    expect(estimate.confidence).toBeGreaterThan(0.2);
    expect(estimate.offset_ms).toBeGreaterThan(90);
    expect(estimate.offset_ms).toBeLessThan(180);
  });

  test('refines manifest timing when identical stems arrive with different offsets', () => {
    const sampleRate = 48_000;
    const anchor: ProofTrainerDecodedTrack = {
      trackId: 'beat-anchor',
      fileName: 'Beat Anchor.wav',
      role: 'beat',
      kind: 'beat',
      buffer: createPatternBuffer(sampleRate, 0.2, 0),
    };
    const shifted: ProofTrainerDecodedTrack = {
      trackId: 'beat-shifted',
      fileName: 'Beat Shifted.wav',
      role: 'beat',
      kind: 'beat',
      buffer: createPatternBuffer(sampleRate, 0.2, 0.14),
    };

    const manifest = buildProofTrainerSessionManifestFromTracks([anchor, shifted], {
      referenceStyle: 'multistem_workspace_local',
      requestText: 'Refine offset from waveform evidence.',
      acceptToVault: false,
    });

    const anchorTrack = manifest.tracks.find((track) => track.trackId === 'beat-anchor');
    const shiftedTrack = manifest.tracks.find((track) => track.trackId === 'beat-shifted');

    expect(anchorTrack?.start_timestamp_ms).toBe(0);
    expect(shiftedTrack?.start_timestamp_ms).toBeGreaterThan(90);
    expect(shiftedTrack?.start_timestamp_ms).toBeLessThan(180);
    expect(shiftedTrack?.notes.join(' ')).toContain('Waveform alignment refined offset');
  });

  test('captures internal activity regions for fragmented takes', () => {
    const sampleRate = 48_000;
    const fragmented: ProofTrainerDecodedTrack = {
      trackId: 'vox-comp',
      fileName: 'Verse Comp.wav',
      role: 'lead',
      kind: 'vocal',
      buffer: createFragmentedBuffer(sampleRate, [
        { startSeconds: 0.18, durationSeconds: 0.12, level: 0.7 },
        { startSeconds: 0.44, durationSeconds: 0.12, level: 0.55 },
        { startSeconds: 1.24, durationSeconds: 0.18, level: 0.88 },
      ]),
    };

    const analysis = analyzeProofTrainerTrack(fragmented);
    const manifest = buildProofTrainerSessionManifestFromTracks([fragmented], {
      referenceStyle: 'proof_mix_trainer',
      requestText: 'Inspect phrase-level edits.',
      acceptToVault: false,
    });

    expect(analysis.activity_regions).toHaveLength(3);
    expect(analysis.edit_density).toBeGreaterThan(1);
    expect(analysis.notes.join(' ')).toContain('active regions');
    expect(analysis.activity_regions[1]?.start_ms).toBeGreaterThan(analysis.activity_regions[0]?.end_ms ?? 0);
    expect(analysis.activity_regions[0]?.section_name).toBe('intro');
    expect(analysis.activity_regions[0]?.lane_role).toBe('intro');
    expect(analysis.activity_regions[1]?.section_name).toBe('verse');
    expect(analysis.activity_regions[1]?.lane_role).toBe('lead-verse');
    expect(analysis.activity_regions[2]?.section_name).toBe('hook');
    expect(analysis.activity_regions[2]?.lane_role).toBe('lead-hook');
    expect(analysis.activity_regions[2]?.label_confidence).toBeGreaterThan(0.6);
    expect(manifest.summary.fragmented_track_count).toBe(1);
    expect(manifest.summary.max_regions_on_track).toBe(3);
  });

  test('builds comp lanes and ranks candidate takes across matching sections', () => {
    const sampleRate = 48_000;
    const leadA: ProofTrainerDecodedTrack = {
      trackId: 'lead-a',
      fileName: 'Lead A.wav',
      role: 'lead',
      kind: 'vocal',
      buffer: createFragmentedBuffer(sampleRate, [
        { startSeconds: 0.28, durationSeconds: 0.18, level: 0.62 },
        { startSeconds: 1.18, durationSeconds: 0.24, level: 0.93 },
      ]),
    };
    const leadB: ProofTrainerDecodedTrack = {
      trackId: 'lead-b',
      fileName: 'Lead B.wav',
      role: 'lead',
      kind: 'vocal',
      buffer: createFragmentedBuffer(sampleRate, [
        { startSeconds: 0.3, durationSeconds: 0.16, level: 0.58 },
        { startSeconds: 1.2, durationSeconds: 0.19, level: 0.72 },
      ]),
    };
    const dbl: ProofTrainerDecodedTrack = {
      trackId: 'dbl-hook',
      fileName: 'Hook Double.wav',
      role: 'double',
      kind: 'vocal',
      buffer: createFragmentedBuffer(sampleRate, [
        { startSeconds: 1.22, durationSeconds: 0.2, level: 0.66 },
      ]),
    };

    const manifest = buildProofTrainerSessionManifestFromTracks([leadA, leadB, dbl], {
      referenceStyle: 'proof_mix_trainer',
      requestText: 'Reconstruct comp lanes from matching hook takes.',
      acceptToVault: false,
    });

    const hookLeadLane = manifest.comp_lanes.find((lane) => lane.lane_role === 'lead-hook' && lane.section_name === 'hook');
    const hookDoubleLane = manifest.comp_lanes.find((lane) => lane.lane_role === 'double' && lane.section_name === 'hook');

    expect(manifest.summary.comp_lane_count).toBeGreaterThanOrEqual(2);
    expect(manifest.summary.candidate_take_count).toBeGreaterThanOrEqual(3);
    expect(manifest.summary.assembled_segment_count).toBeGreaterThanOrEqual(2);
    expect(hookLeadLane).toBeDefined();
    expect(hookLeadLane?.candidates.length).toBe(2);
    expect(hookLeadLane?.primary_candidate_id).toContain('lead-a');
    expect(hookLeadLane?.candidates[0]?.track_id).toBe('lead-a');
    expect(hookLeadLane?.candidates[1]?.track_id).toBe('lead-b');
    expect(hookLeadLane?.candidates[0]?.score ?? 0).toBeGreaterThanOrEqual(hookLeadLane?.candidates[1]?.score ?? 0);
    expect(hookLeadLane?.candidates[0]?.reasons.join(' ')).toContain('lead lane priority');
    expect(hookLeadLane?.assembled_segments.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(hookLeadLane?.assembled_segments[0]?.candidate_id).toContain('lead-a');
    expect(hookLeadLane?.assembled_segments[0]?.comp_start_ms ?? 0).toBeGreaterThanOrEqual(hookLeadLane?.start_ms ?? 0);
    expect(hookLeadLane?.assembled_segments[0]?.comp_end_ms ?? 0).toBeLessThanOrEqual(hookLeadLane?.end_ms ?? 0);
    if ((hookLeadLane?.assembled_segments.length ?? 0) > 1) {
      expect(hookLeadLane?.assembled_segments[1]?.comp_start_ms ?? 0).toBeGreaterThanOrEqual(hookLeadLane?.assembled_segments[0]?.comp_end_ms ?? 0);
    }
    expect(hookDoubleLane).toBeDefined();
    expect(hookDoubleLane?.candidates[0]?.track_id).toBe('dbl-hook');
    expect(hookDoubleLane?.assembled_segments).toHaveLength(1);
  });
});
