import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  executionService,
  ExecutionAccessDeniedError,
} from '../services/ExecutionService';
import { executionSessionService, ExecutionSession } from '../services/executionSessionService';
import { signExecutionPayload } from '../services/executionSigning';
import { ExecutionPayload } from '../types/execution-contract';

const TEST_SESSION: ExecutionSession = {
  sessionId: 'sess-grant-multi-use',
  sessionSecret: 'grant-multi-use-secret',
  expiresAt: Date.now() + 60_000,
  signatureVersion: 'hmac-sha256-v1',
};

const buildUnsignedPayload = (
  proposalId: string,
  nonce: string,
  grantId: string
): ExecutionPayload => ({
  proposalId,
  actionType: 'RENDER_EXPORT',
  parameters: { track: 'Main', value: 2 },
  aaContext: {
    contextId: `ctx-${proposalId}`,
    sourceHash: `source-${proposalId}`,
    timestamp: Date.now(),
    sessionId: TEST_SESSION.sessionId,
    nonce,
    signatureVersion: 'hmac-sha256-v1',
    signature: '',
    accGrant: {
      grantId,
      capability: 'RENDER_EXPORT',
      scopeActionType: 'RENDER_EXPORT',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      singleUse: false,
      maxUses: 5,
    },
  },
});

async function buildSignedPayload(
  proposalId: string,
  nonce: string,
  grantId: string
): Promise<ExecutionPayload> {
  const unsignedPayload = buildUnsignedPayload(proposalId, nonce, grantId);
  const signature = await signExecutionPayload(unsignedPayload, TEST_SESSION.sessionSecret);
  return {
    ...unsignedPayload,
    aaContext: {
      ...unsignedPayload.aaContext,
      signature,
    },
  };
}

describe('Grant Lifecycle - Multi Use', () => {
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

  test('6th execution fails when grant maxUses is 5', async () => {
    const grantId = 'grant-multi-use-1';

    for (let i = 1; i <= 5; i++) {
      const payload = await buildSignedPayload(`multi-use-${i}`, `nonce-multi-use-${i}`, grantId);
      await expect(executionService.validatePayloadOrThrow(payload)).resolves.toBeUndefined();
    }

    const sixthPayload = await buildSignedPayload('multi-use-6', 'nonce-multi-use-6', grantId);
    await expect(executionService.validatePayloadOrThrow(sixthPayload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(sixthPayload)).rejects.toThrow('MAX_USES_EXCEEDED');
  });
});
