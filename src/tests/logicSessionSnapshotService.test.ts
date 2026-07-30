import { describe, expect, test } from 'vitest';
import { classifySessionFiles } from '../services/sessionImportService';
import {
  matchLogicSnapshotToImport,
  parseLogicSessionSnapshot,
  type LogicSessionSnapshot,
} from '../services/logicSessionSnapshotService';

function createFile(name: string, webkitRelativePath?: string, type = 'audio/wav') {
  return { name, webkitRelativePath, type };
}

function createSnapshot(): LogicSessionSnapshot {
  return {
    format: 'esl-logic-session-snapshot',
    version: 1,
    exportedAt: Date.now(),
    sourceApp: 'logic-pro',
    projectName: 'dontHoldback. prod. Kenneth English ',
    projectPackageName: 'dontHoldback. prod. Kenneth English .logicx',
    sourcePackagePath: '/Users/DRA/SESSIONS/dontHoldback.logicx',
    logicVersion: 'Logic Pro X 11.0.1 (6029)',
    bundleVersion: 2,
    hasProjectFolder: true,
    bpm: 80,
    sampleRate: 48000,
    frameRateIndex: 1,
    trackCount: 9,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: { tonic: 'C', scale: 'major', signatureKey: 7 },
    audioFiles: [
      'Audio Files/Verse Take 2#02.wav',
      'Audio Files/Hook Dub#06.wav',
      'Audio Files/Kanye West late registration type beat - Plant roots.wav',
      'Audio Files/dontHoldback. prod. Kenneth English _4#03.wav',
    ],
    unusedAudioFiles: ['Audio Files/Untitled 1_1#01.wav'],
    hasGrid: false,
    isTimeCodeBased: false,
  };
}

describe('logicSessionSnapshotService', () => {
  test('parses a valid logic session snapshot', () => {
    const raw = JSON.stringify(createSnapshot());
    const parsed = parseLogicSessionSnapshot(raw);

    expect(parsed?.projectName).toBe('dontHoldback. prod. Kenneth English ');
    expect(parsed?.bpm).toBe(80);
    expect(parsed?.sampleRate).toBe(48000);
    expect(parsed?.audioFiles.length).toBe(4);
  });

  test('matches Logic audio references against imported DHB stems', () => {
    const imported = classifySessionFiles([
      createFile('Hook_1.wav', 'Bounces/vocal stems/Hook_1.wav'),
      createFile('Verse Take 2_1.wav', 'Bounces/vocal stems/Verse Take 2_1.wav'),
      createFile('Hook Dub_1.wav', 'Bounces/vocal stems/Hook Dub_1.wav'),
      createFile('Kanye West late registration type beat - Plant roots_1.wav', 'Bounces/vocal stems/Kanye West late registration type beat - Plant roots_1.wav'),
      createFile('Intro_1.wav', 'Bounces/vocal stems/Intro_1.wav'),
    ] as File[]);

    const summary = matchLogicSnapshotToImport(createSnapshot(), imported);

    expect(summary.matchedCount).toBe(3);
    expect(summary.totalLogicAudioFiles).toBe(4);
    expect(summary.rows.find((row) => row.logicAudioName === 'Hook Dub#06.wav')?.matchType).toBe('normalized');
    expect(summary.rows.find((row) => row.logicAudioName === 'dontHoldback. prod. Kenneth English _4#03.wav')?.matchType).toBe('missing');
    expect(summary.unmatchedImportedTracks.map((track) => track.displayName)).toContain('Hook_1.wav');
  });
});
