import { describe, expect, test } from 'vitest';
import { APLProposalEngine, buildAplProposalsFromActions } from '../echo-sound-lab/apl/proposal-engine';
import { createSignalIntelligence } from '../echo-sound-lab/apl/signal-intelligence';

describe('APL Proposal Engine Determinism', () => {
  test('generates stable proposal IDs for identical signal intelligence', () => {
    const intel = createSignalIntelligence({
      trackId: 'track-main',
      trackName: 'Main',
      sessionId: 'session-track-main',
      analyzedAt: 1700000000000,
      metrics: {
        loudnessLUFS: -20,
        loudnessRange: 8,
        truePeakDB: 0.2,
        peakLevel: -0.3,
        crestFactor: 9,
        spectralCentroid: 1800,
        spectralSpread: 2200,
        clippingDetected: true,
        dcOffsetDetected: true,
        silenceDetected: false,
        duration: 180000,
        sampleRate: 44100,
        bitDepth: 24,
      },
      anomalies: [
        {
          type: 'CLIPPING',
          severity: 'CRITICAL',
          startMs: 0,
          endMs: 1000,
          description: 'clipping',
        },
        {
          type: 'LOUDNESS_OUT_OF_RANGE',
          severity: 'WARNING',
          startMs: 0,
          endMs: 1000,
          description: 'loudness out of range',
        },
        {
          type: 'DC_OFFSET',
          severity: 'INFO',
          startMs: 0,
          endMs: 1000,
          description: 'dc offset',
        },
      ],
    });

    const engine = new APLProposalEngine();
    const run1 = engine.generateProposals(intel);
    const run2 = engine.generateProposals(intel);

    const ids1 = run1.map((proposal) => proposal.proposalId);
    const ids2 = run2.map((proposal) => proposal.proposalId);

    expect(ids1).toEqual(ids2);
    expect(new Set(ids1).size).toBe(ids1.length);
  });

  test('buildAplProposalsFromActions is deterministic across equivalent parameter key ordering', () => {
    const actionsA = [
      {
        type: 'SET_PLUGIN_PARAM' as const,
        parameters: {
          trackId: 'track-main',
          instanceId: 'inst-1',
          paramId: 'threshold',
          value: -20,
        },
      },
    ];
    const actionsB = [
      {
        type: 'SET_PLUGIN_PARAM' as const,
        parameters: {
          value: -20,
          paramId: 'threshold',
          instanceId: 'inst-1',
          trackId: 'track-main',
        },
      },
    ];

    const proposalsA = buildAplProposalsFromActions(actionsA, {
      intent: 'make vocals aggressive',
      trackId: 'track-main',
      trackName: 'Main',
    });
    const proposalsB = buildAplProposalsFromActions(actionsB, {
      intent: 'make vocals aggressive',
      trackId: 'track-main',
      trackName: 'Main',
    });

    expect(proposalsA[0].proposalId).toBe(proposalsB[0].proposalId);
  });
});
