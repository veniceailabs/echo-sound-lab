import { parseProofTrainerArtifactBundle, type ProofTrainerArtifactBundle } from './proofTrainerArtifactBundleService';
import { parseProofTrainerBlueprint, type ProofTrainerBlueprint } from './proofTrainerBlueprintService';

export interface ProofTrainerPresetManifestEntry {
  presetId: string;
  label: string;
  artist: string | null;
  summary: string;
  blueprintPath: string;
  logicSnapshotPath: string | null;
  artifactBundlePath: string | null;
}

export interface ProofTrainerPresetManifest {
  format: 'esl-proof-trainer-preset-manifest';
  version: 1;
  presets: ProofTrainerPresetManifestEntry[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseProofTrainerPresetManifest(raw: string): ProofTrainerPresetManifest | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if (parsed.format !== 'esl-proof-trainer-preset-manifest' || parsed.version !== 1 || !Array.isArray(parsed.presets)) {
      return null;
    }

    const presets = parsed.presets
      .filter((preset): preset is Record<string, unknown> => isObject(preset))
      .map((preset) => ({
        presetId: typeof preset.presetId === 'string' ? preset.presetId : '',
        label: typeof preset.label === 'string' ? preset.label : '',
        artist: typeof preset.artist === 'string' && preset.artist.trim() ? preset.artist : null,
        summary: typeof preset.summary === 'string' ? preset.summary : '',
        blueprintPath: typeof preset.blueprintPath === 'string' ? preset.blueprintPath : '',
        logicSnapshotPath: typeof preset.logicSnapshotPath === 'string' && preset.logicSnapshotPath.trim() ? preset.logicSnapshotPath : null,
        artifactBundlePath:
          typeof preset.artifactBundlePath === 'string' && preset.artifactBundlePath.trim()
            ? preset.artifactBundlePath
            : null,
      }))
      .filter((preset) => preset.presetId && preset.label && preset.blueprintPath);

    return {
      format: 'esl-proof-trainer-preset-manifest',
      version: 1,
      presets,
    };
  } catch {
    return null;
  }
}

export async function loadProofTrainerPresetManifest(): Promise<ProofTrainerPresetManifest> {
  const response = await fetch('/proof-trainer-presets/manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load Proof Trainer preset manifest (${response.status})`);
  }
  const raw = await response.text();
  const manifest = parseProofTrainerPresetManifest(raw);
  if (!manifest) {
    throw new Error('Bundled Proof Trainer preset manifest is invalid.');
  }
  return manifest;
}

export async function loadProofTrainerPresetBlueprint(
  preset: Pick<ProofTrainerPresetManifestEntry, 'blueprintPath'>,
): Promise<ProofTrainerBlueprint> {
  const response = await fetch(preset.blueprintPath, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load preset blueprint (${response.status})`);
  }
  const raw = await response.text();
  const blueprint = parseProofTrainerBlueprint(raw);
  if (!blueprint) {
    throw new Error('Bundled preset blueprint is invalid.');
  }
  return blueprint;
}

export async function loadProofTrainerPresetArtifactBundle(
  preset: Pick<ProofTrainerPresetManifestEntry, 'artifactBundlePath'>,
): Promise<ProofTrainerArtifactBundle> {
  if (!preset.artifactBundlePath) {
    throw new Error('Preset does not provide an artifact bundle path.');
  }
  const response = await fetch(preset.artifactBundlePath, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load preset artifact bundle (${response.status})`);
  }
  const raw = await response.text();
  const bundle = parseProofTrainerArtifactBundle(raw);
  if (!bundle) {
    throw new Error('Bundled preset artifact bundle is invalid.');
  }
  return bundle;
}
