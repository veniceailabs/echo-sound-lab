import { describe, expect, test } from 'vitest';
import { parseProofTrainerPresetManifest } from '../services/proofTrainerPresetRegistryService';

describe('proofTrainerPresetRegistryService', () => {
  test('parses a valid preset manifest', () => {
    const manifest = parseProofTrainerPresetManifest(JSON.stringify({
      format: 'esl-proof-trainer-preset-manifest',
      version: 1,
      presets: [
        {
          presetId: 'dhb',
          label: 'DontHoldBack',
          artist: 'itsjustdra',
          summary: 'DHB session preset',
          blueprintPath: '/proof-trainer-presets/dhb-proof-trainer-blueprint.json',
          logicSnapshotPath: '/proof-trainer-presets/dhb-logic-session.esl-logic-session.json',
          artifactBundlePath: '/proof-trainer-presets/dhb-proof-trainer-artifact-bundle.json',
        },
      ],
    }));

    expect(manifest?.presets).toHaveLength(1);
    expect(manifest?.presets[0]?.presetId).toBe('dhb');
    expect(manifest?.presets[0]?.label).toBe('DontHoldBack');
    expect(manifest?.presets[0]?.artifactBundlePath).toBe('/proof-trainer-presets/dhb-proof-trainer-artifact-bundle.json');
  });

  test('rejects an invalid preset manifest', () => {
    const manifest = parseProofTrainerPresetManifest(JSON.stringify({
      format: 'unknown',
      version: 1,
      presets: [],
    }));

    expect(manifest).toBeNull();
  });
});
