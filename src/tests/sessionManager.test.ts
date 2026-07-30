import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../services/secureStorage', () => ({
  getSecureItem: vi.fn(async () => null),
  setSecureItem: vi.fn(async () => undefined),
  removeSecureItem: vi.fn(async () => undefined),
}));

import { sessionManager } from '../services/sessionManager';

function createJsonFile(raw: string, name: string): File {
  return {
    name,
    text: async () => raw,
  } as unknown as File;
}

describe('sessionManager', () => {
  beforeEach(async () => {
    await sessionManager.clearSession();
  });

  test('imports a plain session state JSON file', async () => {
    const file = createJsonFile(
      JSON.stringify({
        version: '2.1',
        savedAt: 123,
        fileName: 'session',
        config: {},
        isAbComparing: false,
        playheadSeconds: 4.2,
        appliedSuggestionIds: ['a'],
        echoReportSummary: null,
        activeMode: 'MULTI',
        revisionLog: [],
        activeWamPluginId: null,
      }),
      'session.json',
    );

    const imported = await sessionManager.importSession(file);

    expect(imported?.fileName).toBe('session');
    expect(imported?.activeMode).toBe('MULTI');
    expect(imported?.importContext?.sourceKind).toBe('session-state');
    expect(imported?.importContext?.sourceLabel).toBe('Saved session JSON');
  });

  test('returns a rich import envelope for ESL session packages', async () => {
    const file = createJsonFile(
      JSON.stringify({
        manifest: {
          format: 'esl-session-package',
          version: 1,
          exportedAt: 123,
          exportedBy: 'echo-sound-lab',
        },
        session: {
          version: '2.1',
          savedAt: 456,
          fileName: 'package-session',
          config: {},
          isAbComparing: true,
          playheadSeconds: 12.5,
          appliedSuggestionIds: ['b'],
          echoReportSummary: 'Recovered from package',
          activeMode: 'AI_STUDIO',
          revisionLog: [],
          activeWamPluginId: 'wam-1',
        },
        engine: {
          masteringQualityMode: 'balanced',
          recommendedRenderPath: 'local',
          renderPathReason: 'test',
          chainSignature: null,
          warnings: [],
          activeFlags: {},
        },
        templates: [],
        notes: [],
      }),
      'session.esl-session.json',
    );

    const envelope = await sessionManager.importSessionEnvelope(file);

    expect(envelope?.sourceKind).toBe('session-package');
    expect(envelope?.sourceLabel).toBe('ESL session package');
    expect(envelope?.canRestoreAudioLess).toBe(true);
    expect(envelope?.session.fileName).toBe('package-session');
    expect(envelope?.importContext.sourceKind).toBe('session-package');
    expect(envelope?.session.importContext?.sourceLabel).toBe('ESL session package');
  });

  test('imports an ESL session interchange package by extracting the nested session', async () => {
    const file = createJsonFile(
      JSON.stringify({
        manifest: {
          format: 'esl-session-package',
          version: 1,
          exportedAt: 123,
          exportedBy: 'echo-sound-lab',
        },
        session: {
          version: '2.1',
          savedAt: 456,
          fileName: 'package-session',
          config: {},
          isAbComparing: true,
          playheadSeconds: 12.5,
          appliedSuggestionIds: ['b'],
          echoReportSummary: 'Recovered from package',
          activeMode: 'AI_STUDIO',
          revisionLog: [],
          activeWamPluginId: 'wam-1',
        },
        engine: {
          masteringQualityMode: 'balanced',
          recommendedRenderPath: 'local',
          renderPathReason: 'test',
          chainSignature: null,
          warnings: [],
          activeFlags: {},
        },
        templates: [],
        notes: [],
      }),
      'session.esl-session.json',
    );

    const imported = await sessionManager.importSession(file);

    expect(imported?.fileName).toBe('package-session');
    expect(imported?.isAbComparing).toBe(true);
    expect(imported?.activeMode).toBe('AI_STUDIO');
    expect(imported?.importContext?.sourceKind).toBe('session-package');
  });

  test('imports an ESL recovery bundle by extracting the nested session package', async () => {
    const file = createJsonFile(
      JSON.stringify({
        manifest: {
          format: 'esl-studio-recovery-bundle',
          version: 1,
          exportedAt: 123,
          exportedBy: 'echo-sound-lab',
        },
        sessionPackage: {
          manifest: {
            format: 'esl-session-package',
            version: 1,
            exportedAt: 123,
            exportedBy: 'echo-sound-lab',
          },
          session: {
            version: '2.1',
            savedAt: 789,
            fileName: 'recovery-session',
            config: {},
            isAbComparing: false,
            playheadSeconds: 99,
            appliedSuggestionIds: [],
            echoReportSummary: null,
            activeMode: 'VIDEO',
            revisionLog: [],
            activeWamPluginId: null,
          },
          engine: {
            masteringQualityMode: 'speed',
            recommendedRenderPath: 'local',
            renderPathReason: 'test',
            chainSignature: null,
            warnings: [],
            activeFlags: {},
          },
          templates: [],
          notes: [],
        },
        timelineState: { sessionId: 'x' },
        timelineCompareState: null,
        activeTimelineBranchId: null,
        timelineCompareBranchId: null,
        currentPlayheadSeconds: 0,
        currentFileName: 'recovery-session',
        engineSnapshot: {
          masteringQualityMode: 'speed',
          recommendedRenderPath: 'local',
          renderPathReason: 'test',
          chainSignature: null,
          warnings: [],
          activeFlags: {},
        },
        hardwareProfile: null,
        midiSnapshot: null,
        parityReport: { generatedAt: 0, status: 'ok' },
        bridgeRuntime: { generatedAt: 0, status: 'ok' },
        parityPlan: null,
        notes: [],
      }),
      'session.esl-recovery.json',
    );

    const imported = await sessionManager.importSession(file);

    expect(imported?.fileName).toBe('recovery-session');
    expect(imported?.activeMode).toBe('VIDEO');
    expect(imported?.playheadSeconds).toBe(99);
    expect(imported?.importContext?.sourceKind).toBe('recovery-bundle');
  });
});
