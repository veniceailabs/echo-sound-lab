import { describe, expect, test } from 'vitest';
import {
  classifySessionFiles,
  getStemTypeForImportedTrack,
  inferSessionImportRole,
  isAudioLikeFile,
  type SessionImportFileLike,
} from '../services/sessionImportService';

function createFile(name: string, webkitRelativePath?: string, type = 'audio/wav'): SessionImportFileLike {
  return { name, webkitRelativePath, type };
}

describe('sessionImportService', () => {
  test('classifies a raw session folder into beat, vocals, and reference', () => {
    const imported = classifySessionFiles([
      createFile('dontHoldback beat.wav', 'dontHoldback/beat/dontHoldback beat.wav'),
      createFile('Lead Vox.wav', 'dontHoldback/vocals/Lead Vox.wav'),
      createFile('Adlibs.wav', 'dontHoldback/vocals/Adlibs.wav'),
      createFile('3. dontHoldback. prod. Kenneth English.wav', 'dontHoldback/reference/3. dontHoldback. prod. Kenneth English.wav'),
    ]);

    expect(imported.beatFile?.name).toBe('dontHoldback beat.wav');
    expect(imported.vocalFiles.map((file) => file.name)).toEqual(['Lead Vox.wav', 'Adlibs.wav']);
    expect(imported.referenceFile?.name).toBe('3. dontHoldback. prod. Kenneth English.wav');
    expect(imported.summary.audioFileCount).toBe(4);
    expect(imported.summary.vocalCount).toBe(2);
    expect(imported.packageGraph.nodes[0]?.kind).toBe('folder');
    expect(imported.packageGraph.nodes[0]?.children.at(-1)?.kind).toBe('file');
    expect(imported.warnings).toEqual([]);
  });

  test('warns when multiple beat candidates are present and ignores non-audio files', () => {
    const imported = classifySessionFiles([
      createFile('session beat.wav'),
      createFile('instrumental.wav'),
      createFile('Lead.wav'),
      { name: 'notes.txt', type: 'text/plain' },
    ]);

    expect(imported.beatFile?.name).toBe('instrumental.wav');
    expect(imported.vocalFiles.map((file) => file.name)).toEqual(['Lead.wav']);
    expect(imported.ignoredFiles.map((file) => file.name)).toEqual(['notes.txt']);
    expect(imported.warnings[0]).toContain('Multiple beat candidates found.');
  });

  test('maps roles and stem types consistently', () => {
    expect(inferSessionImportRole('Verse Lead.wav', 0)).toBe('lead');
    expect(inferSessionImportRole('Bass Stem.wav', 1)).toBe('bass');
    expect(getStemTypeForImportedTrack('beat', 'beat')).toBe('drums');
    expect(getStemTypeForImportedTrack('other', 'bass')).toBe('bass');
    expect(getStemTypeForImportedTrack('reference', 'reference')).toBe('reference');
    expect(isAudioLikeFile(createFile('take.aiff', undefined, ''))).toBe(true);
  });

  test('classifies the real dontHoldBack stem names into session roles', () => {
    const imported = classifySessionFiles([
      createFile('Hook_1.wav', 'Bounces/vocal stems/Hook_1.wav'),
      createFile('Intro_1.wav', 'Bounces/vocal stems/Intro_1.wav'),
      createFile('Hook Full Tone_1.wav', 'Bounces/vocal stems/Hook Full Tone_1.wav'),
      createFile('Verse Take 2_1.wav', 'Bounces/vocal stems/Verse Take 2_1.wav'),
      createFile('Kanye West late registration type beat - Plant roots_1.wav', 'Bounces/vocal stems/Kanye West late registration type beat - Plant roots_1.wav'),
      createFile('Intro+Outro (Echo)_1.wav', 'Bounces/vocal stems/Intro+Outro (Echo)_1.wav'),
      createFile('Hook Dub_1.wav', 'Bounces/vocal stems/Hook Dub_1.wav'),
      createFile('Hook echo_1.wav', 'Bounces/vocal stems/Hook echo_1.wav'),
    ]);

    expect(imported.beatFile?.name).toBe('Kanye West late registration type beat - Plant roots_1.wav');
    expect(imported.referenceFile).toBeNull();
    expect(imported.summary.vocalCount).toBe(7);
    expect(imported.vocalFiles.map((file) => file.name)).toContain('Verse Take 2_1.wav');
    expect(imported.vocalFiles.map((file) => file.name)).toContain('Hook Dub_1.wav');
    expect(imported.warnings).toEqual([]);
  });

  test('detects common DAW session package markers from folder structure', () => {
    const logicImport = classifySessionFiles([
      createFile('Lead Vox.wav', 'Project.logicx/Audio Files/Lead Vox.wav'),
      createFile('Mixdown.wav', 'Project.logicx/Bounce Files/Mixdown.wav'),
    ]);

    const proToolsImport = classifySessionFiles([
      createFile('Vox Print.wav', 'Show/Pro Tools Session/Audio Files/Vox Print.wav'),
      createFile('Session.ptx', 'Show/Pro Tools Session/Session.ptx', 'application/octet-stream'),
    ]);

    const bandlabImport = classifySessionFiles([
      createFile('BandLab Export.wav', 'BandLab/Exports/BandLab Export.wav'),
      createFile('Reference.wav', 'BandLab/Exports/Reference.wav'),
    ]);

    expect(logicImport.sourceApp).toBe('logic-pro');
    expect(logicImport.sourceDetections[0]?.displayName).toBe('Logic Pro');
    expect(logicImport.packageGraph.rootName).toBe('Project.logicx');
    expect(logicImport.packageGraph.audioFileCount).toBe(2);
    expect(logicImport.packageGraph.nodes[0]?.children.some((node) => node.kind === 'file')).toBe(true);
    expect(logicImport.warnings.join(' ')).toContain('Logic Pro');

    expect(proToolsImport.sourceApp).toBe('pro-tools');
    expect(proToolsImport.sourceDetections[0]?.displayName).toBe('Pro Tools');
    expect(proToolsImport.packageGraph.rootName).toBe('Pro Tools Session');
    expect(proToolsImport.warnings.join(' ')).toContain('Pro Tools');

    expect(bandlabImport.sourceApp).toBe('bandlab');
    expect(bandlabImport.sourceDetections[0]?.displayName).toBe('BandLab');
    expect(bandlabImport.packageGraph.fileCount).toBe(2);
    expect(bandlabImport.packageGraph.audioFileCount).toBe(2);
    expect(bandlabImport.warnings.join(' ')).toContain('BandLab');
  });
});
