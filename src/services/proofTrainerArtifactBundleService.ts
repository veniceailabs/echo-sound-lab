import type { LogicSessionSnapshot } from './logicSessionSnapshotService';
import type { ProofTrainerBlueprint } from './proofTrainerBlueprintService';

export interface ProofTrainerArtifactBundle {
  format: 'esl-proof-trainer-artifact-bundle';
  version: 1;
  generatedAt: number;
  logicxPath: string;
  sessionFolderPath: string;
  referenceMasterPath: string;
  outputDir?: string;
  artifacts: {
    logicSnapshotPath: string;
    blueprintPath: string;
    validationPath: string;
  };
  logicSnapshot: LogicSessionSnapshot | null;
  blueprint: ProofTrainerBlueprint | null;
  validation: {
    format: 'esl-proof-trainer-blueprint-validation';
    version: 1;
    valid: boolean;
    matchedExpectedTrackCount: number;
    expectedTrackCount: number;
    missingExpectedTracks: Array<{ displayName: string; relativePath: string; kind: string; role: string; required?: boolean }>;
    extraImportedTracks: Array<{ displayName: string; relativePath: string; kind: string; role: string }>;
    referenceStatus: 'matched' | 'missing' | 'mismatch' | 'not-provided';
  } | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseProofTrainerArtifactBundle(raw: string): ProofTrainerArtifactBundle | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if (parsed.format !== 'esl-proof-trainer-artifact-bundle' || parsed.version !== 1) return null;
    if (typeof parsed.generatedAt !== 'number' || typeof parsed.logicxPath !== 'string') return null;
    if (!isObject(parsed.artifacts)) return null;

    return {
      format: 'esl-proof-trainer-artifact-bundle',
      version: 1,
      generatedAt: parsed.generatedAt,
      logicxPath: parsed.logicxPath,
      sessionFolderPath: typeof parsed.sessionFolderPath === 'string' ? parsed.sessionFolderPath : '',
      referenceMasterPath: typeof parsed.referenceMasterPath === 'string' ? parsed.referenceMasterPath : '',
      outputDir: asString(parsed.outputDir) ?? undefined,
      artifacts: {
        logicSnapshotPath: typeof parsed.artifacts.logicSnapshotPath === 'string' ? parsed.artifacts.logicSnapshotPath : '',
        blueprintPath: typeof parsed.artifacts.blueprintPath === 'string' ? parsed.artifacts.blueprintPath : '',
        validationPath: typeof parsed.artifacts.validationPath === 'string' ? parsed.artifacts.validationPath : '',
      },
      logicSnapshot: isObject(parsed.logicSnapshot) ? (parsed.logicSnapshot as unknown as LogicSessionSnapshot) : null,
      blueprint: isObject(parsed.blueprint) ? (parsed.blueprint as unknown as ProofTrainerBlueprint) : null,
      validation: isObject(parsed.validation) && parsed.validation.format === 'esl-proof-trainer-blueprint-validation'
        ? {
            format: 'esl-proof-trainer-blueprint-validation',
            version: 1 as const,
            valid: Boolean(parsed.validation.valid),
            matchedExpectedTrackCount: asPositiveInteger(parsed.validation.matchedExpectedTrackCount) ?? 0,
            expectedTrackCount: asPositiveInteger(parsed.validation.expectedTrackCount) ?? 0,
            missingExpectedTracks: Array.isArray(parsed.validation.missingExpectedTracks)
              ? parsed.validation.missingExpectedTracks.filter(isObject).map((track) => ({
                  displayName: typeof track.displayName === 'string' ? track.displayName : '',
                  relativePath: typeof track.relativePath === 'string' ? track.relativePath : '',
                  kind: typeof track.kind === 'string' ? track.kind : 'other',
                  role: typeof track.role === 'string' ? track.role : 'support',
                  required: typeof track.required === 'boolean' ? track.required : undefined,
                }))
              : [],
            extraImportedTracks: Array.isArray(parsed.validation.extraImportedTracks)
              ? parsed.validation.extraImportedTracks.filter(isObject).map((track) => ({
                  displayName: typeof track.displayName === 'string' ? track.displayName : '',
                  relativePath: typeof track.relativePath === 'string' ? track.relativePath : '',
                  kind: typeof track.kind === 'string' ? track.kind : 'other',
                  role: typeof track.role === 'string' ? track.role : 'support',
                }))
              : [],
            referenceStatus:
              parsed.validation.referenceStatus === 'matched' ||
              parsed.validation.referenceStatus === 'missing' ||
              parsed.validation.referenceStatus === 'mismatch' ||
              parsed.validation.referenceStatus === 'not-provided'
                ? parsed.validation.referenceStatus
                : 'not-provided',
          }
        : null,
    };
  } catch {
    return null;
  }
}

export async function importProofTrainerArtifactBundle(file: File): Promise<ProofTrainerArtifactBundle | null> {
  try {
    const raw = await file.text();
    return parseProofTrainerArtifactBundle(raw);
  } catch {
    return null;
  }
}
