import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';

/**
 * Mock APL Proposals for testing Phase 2 UI
 * Uses realistic data based on Echo Sound Lab analysis
 */

export function generateMockProposals(): APLProposal[] {
  const proposalsData: APLProposal[] = [
    {
      proposalId: 'prop-001-limiting',
      trackId: 'track-main',
      trackName: 'Main Vocals',
      action: {
        type: 'LIMITING',
        description: 'Apply dynamic limiting to prevent clipping',
        parameters: {
          threshold: -0.1,
          ratio: 4,
          attackTime: 5,
          releaseTime: 50,
          makeupGain: 1.2
        }
      },
      evidence: {
        metric: 'True Peak',
        currentValue: 2.1,
        targetValue: -0.1,
        rationale: 'True peak detected at +2.1 dBFS (clipping). Limiting will prevent digital distortion and protect streaming platforms from rejection.'
      },
      confidence: 0.95,
      provenance: {
        engine: 'CLASSICAL',
        confidence: 0.95,
        optimizationLevel: undefined
      },
      signalIntelligence: {
        trackId: 'track-main',
        trackName: 'Main Vocals',
        sessionId: 'session-001',
        analyzedAt: Date.now(),
        metrics: {
          loudnessLUFS: -16.2,
          loudnessRange: 8.5,
          truePeakDB: 2.1,
          peakLevel: 2.1,
          crestFactor: 12.5,
          spectralCentroid: 3500,
          spectralSpread: 2800,
          clippingDetected: true,
          dcOffsetDetected: false,
          silenceDetected: false,
          duration: 245000,
          sampleRate: 44100,
          bitDepth: 24
        },
        anomalies: [
          {
            type: 'CLIPPING',
            severity: 'CRITICAL',
            startMs: 45000,
            endMs: 47000,
            description: 'True peak detected at +2.1 dBFS'
          }
        ],
        verdict: {
          isReadyForMastering: false,
          issues: ['Clipping detected', 'Loudness below standard'],
          recommendations: ['Apply limiting', 'Increase gain']
        },
        immutable: true as const
      }
    },
    {
      proposalId: 'prop-002-loudness',
      trackId: 'track-main',
      trackName: 'Main Vocals',
      action: {
        type: 'GAIN_ADJUSTMENT',
        description: 'Optimize perceived loudness using quantum-informed gain curve',
        parameters: {
          gainDb: 1.8,
          equalizerCurve: 'PRESENCE_BOOST',
          compressionRatio: 2.5
        }
      },
      evidence: {
        metric: 'Loudness (LUFS)',
        currentValue: -16.2,
        targetValue: -14.0,
        rationale: 'Perceived loudness is 2.2 LUFS below streaming platform standard. Quantum-optimized gain curve found through Hamiltonian phase-space minimization of perceptual loudness vs dynamic range preservation.'
      },
      confidence: 0.99,
      provenance: {
        engine: 'QUANTUM_SIMULATOR',
        confidence: 0.99,
        optimizationLevel: 0.75
      },
      signalIntelligence: {
        trackId: 'track-main',
        trackName: 'Main Vocals',
        sessionId: 'session-001',
        analyzedAt: Date.now(),
        metrics: {
          loudnessLUFS: -16.2,
          loudnessRange: 8.5,
          truePeakDB: -0.1,
          peakLevel: -0.1,
          crestFactor: 12.5,
          spectralCentroid: 3500,
          spectralSpread: 2800,
          clippingDetected: false,
          dcOffsetDetected: false,
          silenceDetected: false,
          duration: 245000,
          sampleRate: 44100,
          bitDepth: 24
        },
        anomalies: [
          {
            type: 'LOUDNESS_OUT_OF_RANGE',
            severity: 'WARNING',
            startMs: 0,
            endMs: 245000,
            description: 'Loudness is 2.2 LUFS below streaming standard'
          }
        ],
        verdict: {
          isReadyForMastering: false,
          issues: ['Loudness below standard'],
          recommendations: ['Increase gain or apply loudness enhancement']
        },
        immutable: true as const
      }
    },
    {
      proposalId: 'prop-003-dc-removal',
      trackId: 'track-main',
      trackName: 'Main Vocals',
      action: {
        type: 'DC_REMOVAL',
        description: 'Remove DC offset detected in recording',
        parameters: {
          filterType: 'HIGH_PASS',
          cornerFrequency: 20,
          order: 1
        }
      },
      evidence: {
        metric: 'DC Offset',
        currentValue: 0.002,
        targetValue: 0.0,
        rationale: 'DC offset detected (0.002V) which can cause unwanted artefacts in processing. High-pass filtering at 20Hz removes DC while preserving audio content.'
      },
      confidence: 0.88,
      provenance: {
        engine: 'CLASSICAL',
        confidence: 0.88,
        optimizationLevel: undefined
      },
      signalIntelligence: {
        trackId: 'track-main',
        trackName: 'Main Vocals',
        sessionId: 'session-001',
        analyzedAt: Date.now(),
        metrics: {
          loudnessLUFS: -16.2,
          loudnessRange: 8.5,
          truePeakDB: -0.1,
          peakLevel: -0.1,
          crestFactor: 12.5,
          spectralCentroid: 3500,
          spectralSpread: 2800,
          clippingDetected: false,
          dcOffsetDetected: true,
          silenceDetected: false,
          duration: 245000,
          sampleRate: 44100,
          bitDepth: 24
        },
        anomalies: [
          {
            type: 'DC_OFFSET',
            severity: 'INFO',
            startMs: 0,
            endMs: 245000,
            description: 'DC offset detected (0.002V) which can cause unwanted artefacts'
          }
        ],
        verdict: {
          isReadyForMastering: false,
          issues: ['DC offset detected'],
          recommendations: ['Remove DC offset with high-pass filter']
        },
        immutable: true as const
      }
    }
  ];

  return proposalsData;
}

/**
 * Generate a single proposal for demonstration
 */
export function generateSingleProposal(index: number): APLProposal {
  const proposals = generateMockProposals();
  return proposals[index % proposals.length];
}

/**
 * Get proposal by ID
 */
export function getProposalById(id: string): APLProposal | undefined {
  return generateMockProposals().find(p => p.proposalId === id);
}
