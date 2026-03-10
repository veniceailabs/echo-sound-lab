import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  executionService,
  ExecutionReplayError,
  ExecutionTamperError,
} from '../services/ExecutionService';
import { executionSessionService, ExecutionSession } from '../services/executionSessionService';
import { signExecutionPayload } from '../services/executionSigning';
import { ExecutionPayload } from '../types/execution-contract';

const TEST_SESSION: ExecutionSession = {
  sessionId: 'sess-test-1',
  sessionSecret: 'unit-test-secret',
  expiresAt: Date.now() + 60_000,
  signatureVersion: 'hmac-sha256-v1',
};

const buildUnsignedPayload = (proposalId: string): ExecutionPayload => ({
  proposalId,
  actionType: 'GAIN_ADJUSTMENT',
  parameters: {
    track: 'Main',
    value: 2,
  },
  aaContext: {
    contextId: `ctx-${proposalId}`,
    sourceHash: `source-${proposalId}`,
    timestamp: Date.now(),
    sessionId: TEST_SESSION.sessionId,
    nonce: `nonce-${proposalId}`,
    signatureVersion: 'hmac-sha256-v1',
    signature: '',
  },
});

async function buildSignedPayload(
  proposalId: string,
  overrides: Partial<ExecutionPayload> = {}
): Promise<ExecutionPayload> {
  const base = buildUnsignedPayload(proposalId);
  const payload: ExecutionPayload = {
    ...base,
    ...overrides,
    parameters: {
      ...base.parameters,
      ...(overrides.parameters || {}),
    },
    aaContext: {
      ...base.aaContext,
      ...(overrides.aaContext || {}),
      signature: '',
    },
  };
  const signature = await signExecutionPayload(payload, TEST_SESSION.sessionSecret);
  return {
    ...payload,
    aaContext: {
      ...payload.aaContext,
      signature,
    },
  };
}

describe('Execution Security', () => {
  beforeEach(() => {
    executionService.setSimulationMode(true);
    executionService.resetSecurityStateForTest();
    executionSessionService.resetForTest();
    executionSessionService.seedSessionForTest({ ...TEST_SESSION, expiresAt: Date.now() + 60_000 });

    const consumed = new Set<string>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/proxy/security/consume')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const key = `${body.sessionId}:${body.nonce}`;
        if (consumed.has(key)) {
          return new Response(JSON.stringify({ consumed: false, reason: 'nonce_replay_detected' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        consumed.add(key);
        return new Response(JSON.stringify({ consumed: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'unexpected_url' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
  });

  test('rejects man-in-the-middle payload mutation after signing', async () => {
    const signedPayload = await buildSignedPayload('tamper-1');
    const tamperedPayload: ExecutionPayload = {
      ...signedPayload,
      parameters: {
        ...signedPayload.parameters,
        value: 10, // MITM mutation after signature
      },
    };

    await expect(executionService.validatePayloadOrThrow(tamperedPayload)).rejects.toBeInstanceOf(ExecutionTamperError);
    await expect(executionService.validatePayloadOrThrow(tamperedPayload)).rejects.toThrow('Signature verification failed');
  });

  test('rejects stale signature outside TTL window', async () => {
    const staleTimestamp = Date.now() - 120_000;
    const stalePayload = await buildSignedPayload('stale-1', {
      aaContext: {
        ...buildUnsignedPayload('stale-1').aaContext,
        timestamp: staleTimestamp,
      },
    });

    await expect(executionService.validatePayloadOrThrow(stalePayload)).rejects.toBeInstanceOf(ExecutionTamperError);
    await expect(executionService.validatePayloadOrThrow(stalePayload)).rejects.toThrow('Stale Signature');
  });

  test('rejects replay attack for identical signed payload', async () => {
    const payload = await buildSignedPayload('replay-1');

    await expect(executionService.validatePayloadOrThrow(payload)).resolves.toBeUndefined();

    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toBeInstanceOf(ExecutionReplayError);
    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toThrow('Replay detected');
  });

  test('rejects direct bypass without signature wrapper', async () => {
    const unsignedPayload = buildUnsignedPayload('bypass-1');

    await expect(executionService.validatePayloadOrThrow(unsignedPayload)).rejects.toBeInstanceOf(ExecutionTamperError);
    await expect(executionService.validatePayloadOrThrow(unsignedPayload)).rejects.toThrow('Missing Signature');
  });
});
