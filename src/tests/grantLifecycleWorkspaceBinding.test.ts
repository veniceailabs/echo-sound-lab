import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  executionService,
  ExecutionAccessDeniedError,
} from '../services/ExecutionService';
import { executionSessionService, ExecutionSession } from '../services/executionSessionService';
import { signExecutionPayload } from '../services/executionSigning';
import { ExecutionPayload } from '../types/execution-contract';

const TEST_SESSION: ExecutionSession = {
  sessionId: 'sess-grant-workspace',
  sessionSecret: 'grant-workspace-secret',
  expiresAt: Date.now() + 60_000,
  signatureVersion: 'hmac-sha256-v1',
};

const buildUnsignedPayload = (
  proposalId: string,
  workspaceId: string
): ExecutionPayload => ({
  proposalId,
  actionType: 'RENDER_EXPORT',
  parameters: { track: 'Main', value: 2 },
  aaContext: {
    contextId: `ctx-${proposalId}`,
    workspaceId,
    sourceHash: `source-${proposalId}`,
    timestamp: Date.now(),
    sessionId: TEST_SESSION.sessionId,
    nonce: `nonce-${proposalId}`,
    signatureVersion: 'hmac-sha256-v1',
    signature: '',
    accGrant: {
      grantId: 'grant-workspace-1',
      capability: 'RENDER_EXPORT',
      scopeActionType: 'RENDER_EXPORT',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      singleUse: true,
      workspaceId: 'workspace-a',
    },
  },
});

async function buildSignedPayload(
  proposalId: string,
  workspaceId: string
): Promise<ExecutionPayload> {
  const unsignedPayload = buildUnsignedPayload(proposalId, workspaceId);
  const signature = await signExecutionPayload(unsignedPayload, TEST_SESSION.sessionSecret);
  return {
    ...unsignedPayload,
    aaContext: {
      ...unsignedPayload.aaContext,
      signature,
    },
  };
}

describe('Grant Lifecycle - Workspace Binding', () => {
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

  test('grant scoped to workspace A fails when used from workspace B', async () => {
    const payload = await buildSignedPayload('workspace-binding-1', 'workspace-b');

    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toThrow('WORKSPACE_MISMATCH');
  });
});
