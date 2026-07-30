import { describe, expect, test } from 'vitest';
import { classifySessionFiles } from '../services/sessionImportService';
import {
  matchProofTrainerBlueprint,
  parseProofTrainerBlueprint,
  type ProofTrainerBlueprint,
} from '../services/proofTrainerBlueprintService';

function createFile(name: string, webkitRelativePath?: string, type = 'audio/wav') {
  return { name, webkitRelativePath, type };
}

function createBlueprint(): ProofTrainerBlueprint {
  return {
    format: 'esl-proof-trainer-blueprint',
    version: 1,
    exportedAt: Date.now(),
    blueprintName: 'dontHoldback',
    sessionFolderPath: '/Users/DRA/SESSIONS/dontHoldback/Bounces/vocal stems',
    referenceMasterPath: '/Users/DRA/Music/dontHoldback master.wav',
    referenceMasterName: '3. dontHoldback. prod. Kenneth English.wav',
    referenceStyle: 'proof_mix_trainer',
    notes: ['DHB intake blueprint'],
    logicSnapshot: null,
    expectedTracks: [
      { relativePath: 'Hook_1.wav', displayName: 'Hook_1.wav', kind: 'vocal', role: 'lead', required: true },
      { relativePath: 'Verse Take 2_1.wav', displayName: 'Verse Take 2_1.wav', kind: 'vocal', role: 'lead', required: true },
      { relativePath: 'Kanye West late registration type beat - Plant roots_1.wav', displayName: 'Kanye West late registration type beat - Plant roots_1.wav', kind: 'beat', role: 'beat', required: true },
    ],
  };
}

describe('proofTrainerBlueprintService', () => {
  test('parses a valid blueprint', () => {
    const parsed = parseProofTrainerBlueprint(JSON.stringify(createBlueprint()));

    expect(parsed?.blueprintName).toBe('dontHoldback');
    expect(parsed?.expectedTracks.length).toBe(3);
    expect(parsed?.referenceMasterName).toBe('3. dontHoldback. prod. Kenneth English.wav');
  });

  test('matches imported folder content and reference against blueprint', () => {
    const imported = classifySessionFiles([
      createFile('Hook_1.wav', 'Bounces/vocal stems/Hook_1.wav'),
      createFile('Verse Take 2_1.wav', 'Bounces/vocal stems/Verse Take 2_1.wav'),
      createFile('Kanye West late registration type beat - Plant roots_1.wav', 'Bounces/vocal stems/Kanye West late registration type beat - Plant roots_1.wav'),
      createFile('Hook Dub_1.wav', 'Bounces/vocal stems/Hook Dub_1.wav'),
    ] as File[]);
    const referenceFile = createFile('3. dontHoldback. prod. Kenneth English.wav') as File;

    const summary = matchProofTrainerBlueprint(createBlueprint(), imported, referenceFile);

    expect(summary?.matchedExpectedTrackCount).toBe(3);
    expect(summary?.missingExpectedTracks).toEqual([]);
    expect(summary?.referenceStatus).toBe('matched');
    expect(summary?.extraImportedTracks.map((track) => track.displayName)).toEqual(['Hook Dub_1.wav']);
  });
});
