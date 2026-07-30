import type { SessionImportBundle } from './sessionImportService';

export interface LogicSessionSnapshot {
  format: 'esl-logic-session-snapshot';
  version: 1;
  exportedAt: number;
  sourceApp: 'logic-pro';
  projectName: string;
  projectPackageName: string;
  sourcePackagePath: string | null;
  logicVersion: string | null;
  bundleVersion: number | null;
  hasProjectFolder: boolean;
  bpm: number | null;
  sampleRate: number | null;
  frameRateIndex: number | null;
  trackCount: number | null;
  timeSignature: {
    numerator: number | null;
    denominator: number | null;
  };
  keySignature: {
    tonic: string | null;
    scale: string | null;
    signatureKey: number | null;
  };
  audioFiles: string[];
  unusedAudioFiles: string[];
  hasGrid: boolean | null;
  isTimeCodeBased: boolean | null;
}

export interface LogicSessionMatchRow {
  logicAudioPath: string;
  logicAudioName: string;
  importedTrackName: string | null;
  importedTrackPath: string | null;
  importedKind: string | null;
  importedRole: string | null;
  matchType: 'exact' | 'normalized' | 'missing';
}

export interface LogicSessionMatchSummary {
  matchedCount: number;
  totalLogicAudioFiles: number;
  unmatchedImportedTrackCount: number;
  rows: LogicSessionMatchRow[];
  unmatchedImportedTracks: Array<{
    displayName: string;
    relativePath: string;
    kind: string;
    role: string;
  }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeAudioStemName(name: string): string {
  return name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([#_])\d+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseLogicSessionSnapshot(raw: string): LogicSessionSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if (parsed.format !== 'esl-logic-session-snapshot' || parsed.version !== 1) return null;
    if (parsed.sourceApp !== 'logic-pro') return null;
    if (typeof parsed.projectName !== 'string' || typeof parsed.projectPackageName !== 'string') return null;

    const timeSignature = isObject(parsed.timeSignature) ? parsed.timeSignature : {};
    const keySignature = isObject(parsed.keySignature) ? parsed.keySignature : {};

    return {
      format: 'esl-logic-session-snapshot',
      version: 1,
      exportedAt: asNullableNumber(parsed.exportedAt) ?? Date.now(),
      sourceApp: 'logic-pro',
      projectName: parsed.projectName,
      projectPackageName: parsed.projectPackageName,
      sourcePackagePath: asNullableString(parsed.sourcePackagePath),
      logicVersion: asNullableString(parsed.logicVersion),
      bundleVersion: asNullableNumber(parsed.bundleVersion),
      hasProjectFolder: Boolean(parsed.hasProjectFolder),
      bpm: asNullableNumber(parsed.bpm),
      sampleRate: asNullableNumber(parsed.sampleRate),
      frameRateIndex: asNullableNumber(parsed.frameRateIndex),
      trackCount: asNullableNumber(parsed.trackCount),
      timeSignature: {
        numerator: asNullableNumber(timeSignature.numerator),
        denominator: asNullableNumber(timeSignature.denominator),
      },
      keySignature: {
        tonic: asNullableString(keySignature.tonic),
        scale: asNullableString(keySignature.scale),
        signatureKey: asNullableNumber(keySignature.signatureKey),
      },
      audioFiles: asStringArray(parsed.audioFiles),
      unusedAudioFiles: asStringArray(parsed.unusedAudioFiles),
      hasGrid: typeof parsed.hasGrid === 'boolean' ? parsed.hasGrid : null,
      isTimeCodeBased: typeof parsed.isTimeCodeBased === 'boolean' ? parsed.isTimeCodeBased : null,
    };
  } catch {
    return null;
  }
}

export async function importLogicSessionSnapshot(file: File): Promise<LogicSessionSnapshot | null> {
  try {
    const raw = await file.text();
    return parseLogicSessionSnapshot(raw);
  } catch {
    return null;
  }
}

export function matchLogicSnapshotToImport(
  snapshot: LogicSessionSnapshot,
  bundle: SessionImportBundle<File>,
): LogicSessionMatchSummary {
  const unmatchedImported = [...bundle.tracks];
  const rows: LogicSessionMatchRow[] = snapshot.audioFiles.map((logicAudioPath) => {
    const logicAudioName = logicAudioPath.split(/[\\/]/).pop() || logicAudioPath;
    const exactIndex = unmatchedImported.findIndex((track) => track.displayName === logicAudioName);
    if (exactIndex >= 0) {
      const track = unmatchedImported.splice(exactIndex, 1)[0];
      return {
        logicAudioPath,
        logicAudioName,
        importedTrackName: track.displayName,
        importedTrackPath: track.relativePath,
        importedKind: track.kind,
        importedRole: track.role,
        matchType: 'exact',
      };
    }

    const normalizedLogic = normalizeAudioStemName(logicAudioName);
    const normalizedIndex = unmatchedImported.findIndex((track) => normalizeAudioStemName(track.displayName) === normalizedLogic);
    if (normalizedIndex >= 0) {
      const track = unmatchedImported.splice(normalizedIndex, 1)[0];
      return {
        logicAudioPath,
        logicAudioName,
        importedTrackName: track.displayName,
        importedTrackPath: track.relativePath,
        importedKind: track.kind,
        importedRole: track.role,
        matchType: 'normalized',
      };
    }

    return {
      logicAudioPath,
      logicAudioName,
      importedTrackName: null,
      importedTrackPath: null,
      importedKind: null,
      importedRole: null,
      matchType: 'missing',
    };
  });

  return {
    matchedCount: rows.filter((row) => row.matchType !== 'missing').length,
    totalLogicAudioFiles: snapshot.audioFiles.length,
    unmatchedImportedTrackCount: unmatchedImported.length,
    rows,
    unmatchedImportedTracks: unmatchedImported.map((track) => ({
      displayName: track.displayName,
      relativePath: track.relativePath,
      kind: track.kind,
      role: track.role,
    })),
  };
}
