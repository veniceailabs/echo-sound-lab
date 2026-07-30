import type { LogicSessionSnapshot } from './logicSessionSnapshotService';
import type { SessionImportBundle } from './sessionImportService';

export interface ProofTrainerBlueprintTrack {
  relativePath: string;
  displayName: string;
  kind: string;
  role: string;
  required: boolean;
}

export interface ProofTrainerBlueprint {
  format: 'esl-proof-trainer-blueprint';
  version: 1;
  exportedAt: number;
  blueprintName: string;
  sessionFolderPath: string | null;
  referenceMasterPath: string | null;
  referenceMasterName: string | null;
  referenceStyle: string | null;
  notes: string[];
  expectedTracks: ProofTrainerBlueprintTrack[];
  logicSnapshot: LogicSessionSnapshot | null;
}

export interface ProofTrainerBlueprintMatchSummary {
  matchedExpectedTrackCount: number;
  expectedTrackCount: number;
  missingExpectedTracks: ProofTrainerBlueprintTrack[];
  extraImportedTracks: Array<{
    displayName: string;
    relativePath: string;
    kind: string;
    role: string;
  }>;
  referenceStatus: 'matched' | 'missing' | 'mismatch' | 'not-provided';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeTrackName(name: string): string {
  return name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([#_])\d+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseProofTrainerBlueprint(raw: string): ProofTrainerBlueprint | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if (parsed.format !== 'esl-proof-trainer-blueprint' || parsed.version !== 1) return null;
    if (typeof parsed.blueprintName !== 'string' || !Array.isArray(parsed.expectedTracks)) return null;

    const expectedTracks = parsed.expectedTracks
      .filter((track): track is Record<string, unknown> => isObject(track))
      .map((track) => ({
        relativePath: typeof track.relativePath === 'string' ? track.relativePath : '',
        displayName: typeof track.displayName === 'string' ? track.displayName : '',
        kind: typeof track.kind === 'string' ? track.kind : 'other',
        role: typeof track.role === 'string' ? track.role : 'support',
        required: Boolean(track.required),
      }))
      .filter((track) => track.displayName);

    return {
      format: 'esl-proof-trainer-blueprint',
      version: 1,
      exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
      blueprintName: parsed.blueprintName,
      sessionFolderPath: asString(parsed.sessionFolderPath),
      referenceMasterPath: asString(parsed.referenceMasterPath),
      referenceMasterName: asString(parsed.referenceMasterName),
      referenceStyle: asString(parsed.referenceStyle),
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item): item is string => typeof item === 'string') : [],
      expectedTracks,
      logicSnapshot: isObject(parsed.logicSnapshot) ? (parsed.logicSnapshot as unknown as LogicSessionSnapshot) : null,
    };
  } catch {
    return null;
  }
}

export async function importProofTrainerBlueprint(file: File): Promise<ProofTrainerBlueprint | null> {
  try {
    const raw = await file.text();
    return parseProofTrainerBlueprint(raw);
  } catch {
    return null;
  }
}

export function matchProofTrainerBlueprint(
  blueprint: ProofTrainerBlueprint,
  bundle: SessionImportBundle<File> | null,
  referenceFile: File | null,
): ProofTrainerBlueprintMatchSummary | null {
  if (!bundle) return null;

  const remainingImported = [...bundle.tracks];
  const missingExpectedTracks: ProofTrainerBlueprintTrack[] = [];
  let matchedExpectedTrackCount = 0;

  for (const expected of blueprint.expectedTracks) {
    const index = remainingImported.findIndex((track) => normalizeTrackName(track.displayName) === normalizeTrackName(expected.displayName));
    if (index >= 0) {
      remainingImported.splice(index, 1);
      matchedExpectedTrackCount += 1;
    } else if (expected.required) {
      missingExpectedTracks.push(expected);
    }
  }

  let referenceStatus: ProofTrainerBlueprintMatchSummary['referenceStatus'] = 'not-provided';
  if (blueprint.referenceMasterName) {
    if (!referenceFile) {
      referenceStatus = 'missing';
    } else if (normalizeTrackName(referenceFile.name) === normalizeTrackName(blueprint.referenceMasterName)) {
      referenceStatus = 'matched';
    } else {
      referenceStatus = 'mismatch';
    }
  }

  return {
    matchedExpectedTrackCount,
    expectedTrackCount: blueprint.expectedTracks.length,
    missingExpectedTracks,
    extraImportedTracks: remainingImported.map((track) => ({
      displayName: track.displayName,
      relativePath: track.relativePath,
      kind: track.kind,
      role: track.role,
    })),
    referenceStatus,
  };
}
