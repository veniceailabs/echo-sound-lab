import { describe, expect, test } from 'vitest';
import { parseProofTrainerArtifactBundle } from '../services/proofTrainerArtifactBundleService';

function createArtifactBundle() {
  return {
    format: 'esl-proof-trainer-artifact-bundle',
    version: 1,
    generatedAt: Date.now(),
    logicxPath: '/Users/DRA/SESSIONS/dontHoldback.logicx',
    sessionFolderPath: '/Users/DRA/SESSIONS/dontHoldback/Bounces/vocal stems',
    referenceMasterPath: '/Users/DRA/Music/dontHoldback master.wav',
    outputDir: '/tmp/esl-proof-bundle',
    artifacts: {
      logicSnapshotPath: '/tmp/esl-proof-bundle/vocal-stems.logic-session.json',
      blueprintPath: '/tmp/esl-proof-bundle/vocal-stems.proof-trainer-blueprint.json',
      validationPath: '/tmp/esl-proof-bundle/vocal-stems.proof-trainer-validation.json',
    },
    logicSnapshot: {
      format: 'esl-logic-session-snapshot',
      version: 1,
      exportedAt: Date.now(),
      sourceApp: 'logic-pro',
      projectName: 'dontHoldback',
      projectPackageName: 'dontHoldback.logicx',
      sourcePackagePath: '/Users/DRA/SESSIONS/dontHoldback.logicx',
      logicVersion: 'Logic Pro X 11.0.1 (6029)',
      bundleVersion: 2,
      hasProjectFolder: true,
      bpm: 80,
      sampleRate: 48000,
      frameRateIndex: 1,
      trackCount: 8,
      timeSignature: { numerator: 4, denominator: 4 },
      keySignature: { tonic: 'C', scale: 'major', signatureKey: 7 },
      audioFiles: ['Audio Files/Hook.wav'],
      unusedAudioFiles: [],
      hasGrid: false,
      isTimeCodeBased: false,
    },
    blueprint: {
      format: 'esl-proof-trainer-blueprint',
      version: 1,
      exportedAt: Date.now(),
      blueprintName: 'dontHoldback',
      sessionFolderPath: '/Users/DRA/SESSIONS/dontHoldback/Bounces/vocal stems',
      referenceMasterPath: '/Users/DRA/Music/dontHoldback master.wav',
      referenceMasterName: 'dontHoldback master.wav',
      referenceStyle: 'proof_mix_trainer',
      notes: ['Generated from ESL'],
      expectedTracks: [
        {
          relativePath: 'Hook.wav',
          displayName: 'Hook.wav',
          kind: 'vocal',
          role: 'lead',
          required: true,
        },
      ],
      logicSnapshot: null,
    },
    validation: {
      format: 'esl-proof-trainer-blueprint-validation',
      version: 1,
      valid: true,
      matchedExpectedTrackCount: 1,
      expectedTrackCount: 1,
      missingExpectedTracks: [],
      extraImportedTracks: [],
      referenceStatus: 'matched',
    },
  };
}

describe('proofTrainerArtifactBundleService', () => {
  test('parses a valid artifact bundle', () => {
    const parsed = parseProofTrainerArtifactBundle(JSON.stringify(createArtifactBundle()));

    expect(parsed?.logicxPath).toBe('/Users/DRA/SESSIONS/dontHoldback.logicx');
    expect(parsed?.blueprint?.blueprintName).toBe('dontHoldback');
    expect(parsed?.logicSnapshot?.projectName).toBe('dontHoldback');
    expect(parsed?.validation?.valid).toBe(true);
  });

  test('rejects an invalid artifact bundle', () => {
    const parsed = parseProofTrainerArtifactBundle(JSON.stringify({
      format: 'wrong',
      version: 1,
    }));

    expect(parsed).toBeNull();
  });
});
