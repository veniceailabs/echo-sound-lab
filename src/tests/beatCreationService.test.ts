import { describe, expect, test } from 'vitest';
import { beatCreationService, type BeatProject } from '../services/beatCreationService';

function readAscii(view: DataView, start: number, length: number): string {
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += String.fromCharCode(view.getUint8(start + i));
  }
  return output;
}

async function readWavHeader(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);

  return {
    riff: readAscii(view, 0, 4),
    wave: readAscii(view, 8, 4),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataTag: readAscii(view, 36, 4),
    byteLength: buffer.byteLength,
  };
}

describe('beatCreationService', () => {
  test('exports a real WAV bounce from project state', async () => {
    const project = beatCreationService.createProject('Regression Beat', 96, 'C');
    const withLoop = beatCreationService.addLoop(project, 'hh-bass-1', 0);
    const renderProject: BeatProject = {
      ...withLoop,
      drums: [
        {
          trackId: 'drum-1',
          instrument: 'kick',
          muted: false,
          pattern: [
            { step: 0, velocity: 110 },
            { step: 4, velocity: 96 },
            { step: 8, velocity: 110 },
            { step: 12, velocity: 96 },
          ],
        },
      ],
    };

    const blob = await beatCreationService.exportBeat(renderProject);
    const header = await readWavHeader(blob);

    expect(blob.type).toBe('audio/wav');
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.dataTag).toBe('data');
    expect(header.channels).toBe(2);
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
    expect(header.byteLength).toBeGreaterThan(44);
  });

  test('exports loop and drum stems as valid WAV files', async () => {
    const project = beatCreationService.createProject('Stem Beat', 100, 'A minor');
    const withLoop = beatCreationService.addLoop(project, 'pop-synth-1', 0);
    const renderProject: BeatProject = {
      ...withLoop,
      drums: [
        {
          trackId: 'drum-2',
          instrument: 'snare',
          muted: false,
          pattern: [
            { step: 4, velocity: 108 },
            { step: 12, velocity: 104 },
          ],
        },
      ],
    };

    const stems = await beatCreationService.exportStems(renderProject);
    expect(stems).toHaveLength(2);
    expect(stems[0].name).toContain('Pop Synth Hook');
    expect(stems[1].name).toContain('snare');

    const firstHeader = await readWavHeader(stems[0].blob);
    expect(firstHeader.riff).toBe('RIFF');
    expect(firstHeader.wave).toBe('WAVE');
    expect(firstHeader.channels).toBe(2);
  });
});
