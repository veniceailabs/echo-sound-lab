import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  executionService,
  ExecutionAccessDeniedError,
} from '../services/ExecutionService';
import { executionSessionService, ExecutionSession } from '../services/executionSessionService';
import { signExecutionPayload } from '../services/executionSigning';
import { ExecutionPayload } from '../types/execution-contract';
import { securityLedger } from '../services/SecurityLedger';
import { forensicLogger } from '../services/ForensicLogger';

const TEST_SESSION: ExecutionSession = {
  sessionId: 'sess-acc-enforcement',
  sessionSecret: 'acc-enforcement-secret',
  expiresAt: Date.now() + 60_000,
  signatureVersion: 'hmac-sha256-v1',
};

const baseUnsignedPayload = (proposalId: string, actionType: string): ExecutionPayload => ({
  proposalId,
  actionType,
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
    actorId: 'human:test',
    actorType: 'HUMAN',
  },
});

async function buildSignedPayload(
  proposalId: string,
  actionType: string,
  overrides: Partial<ExecutionPayload> = {}
): Promise<ExecutionPayload> {
  const base = baseUnsignedPayload(proposalId, actionType);
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

describe('Execution ACC Enforcement', () => {
  beforeEach(() => {
    executionService.setSimulationMode(true);
    executionService.resetSecurityStateForTest();
    executionSessionService.resetForTest();
    securityLedger.resetForTest();
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

  test('blocks high-risk execution without ACC grant (MISSING_GRANT) and audits decision', async () => {
    const auditSpy = vi.spyOn(forensicLogger, 'logAccessBlock').mockImplementation(() => {});
    const payload = await buildSignedPayload('missing-grant-1', 'RENDER_EXPORT');

    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toThrow('MISSING_GRANT');

    const entries = securityLedger.getEntries();
    const last = entries[entries.length - 1];
    expect(last?.reasonCode).toBe('MISSING_GRANT');
    expect(auditSpy).toHaveBeenCalled();
    expect(auditSpy.mock.calls[0]?.[3]).toBe('MISSING_GRANT');

    auditSpy.mockRestore();
  });

  test('blocks ACC grant scope mismatch (SCOPE_MISMATCH) and audits reason code', async () => {
    const auditSpy = vi.spyOn(forensicLogger, 'logAccessBlock').mockImplementation(() => {});
    const now = Date.now();
    const payload = await buildSignedPayload('scope-mismatch-1', 'RENDER_EXPORT', {
      aaContext: {
        ...baseUnsignedPayload('scope-mismatch-1', 'RENDER_EXPORT').aaContext,
        accGrant: {
          grantId: 'grant-scope-1',
          capability: 'RENDER_EXPORT',
          scopeActionType: 'STEM_SEPARATION',
          issuedAt: now,
          expiresAt: now + 60_000,
          singleUse: true,
        },
      },
    });

    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toThrow('SCOPE_MISMATCH');

    const entries = securityLedger.getEntries();
    const last = entries[entries.length - 1];
    expect(last?.reasonCode).toBe('SCOPE_MISMATCH');
    expect(auditSpy).toHaveBeenCalled();
    expect(auditSpy.mock.calls[0]?.[3]).toBe('SCOPE_MISMATCH');

    auditSpy.mockRestore();
  });

  test('blocks expired ACC grant (TTL_EXPIRED) and audits reason code', async () => {
    const auditSpy = vi.spyOn(forensicLogger, 'logAccessBlock').mockImplementation(() => {});
    const now = Date.now();
    const payload = await buildSignedPayload('ttl-expired-1', 'RENDER_EXPORT', {
      aaContext: {
        ...baseUnsignedPayload('ttl-expired-1', 'RENDER_EXPORT').aaContext,
        accGrant: {
          grantId: 'grant-expired-1',
          capability: 'RENDER_EXPORT',
          scopeActionType: 'RENDER_EXPORT',
          issuedAt: now - 120_000,
          expiresAt: now - 1,
          singleUse: true,
        },
      },
    });

    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(payload)).rejects.toThrow('TTL_EXPIRED');

    const entries = securityLedger.getEntries();
    const last = entries[entries.length - 1];
    expect(last?.reasonCode).toBe('TTL_EXPIRED');
    expect(auditSpy).toHaveBeenCalled();
    expect(auditSpy.mock.calls[0]?.[3]).toBe('TTL_EXPIRED');

    auditSpy.mockRestore();
  });

  test('blocks ACC grant replay with fresh nonce (REPLAY_DETECTED) and audits reason code', async () => {
    const auditSpy = vi.spyOn(forensicLogger, 'logAccessBlock').mockImplementation(() => {});
    const now = Date.now();

    const firstPayload = await buildSignedPayload('replay-grant-1', 'RENDER_EXPORT', {
      aaContext: {
        ...baseUnsignedPayload('replay-grant-1', 'RENDER_EXPORT').aaContext,
        nonce: 'nonce-replay-grant-1',
        accGrant: {
          grantId: 'grant-replay-1',
          capability: 'RENDER_EXPORT',
          scopeActionType: 'RENDER_EXPORT',
          issuedAt: now,
          expiresAt: now + 60_000,
          singleUse: true,
        },
      },
    });

    const secondPayload = await buildSignedPayload('replay-grant-2', 'RENDER_EXPORT', {
      aaContext: {
        ...baseUnsignedPayload('replay-grant-2', 'RENDER_EXPORT').aaContext,
        nonce: 'nonce-replay-grant-2',
        accGrant: {
          grantId: 'grant-replay-1',
          capability: 'RENDER_EXPORT',
          scopeActionType: 'RENDER_EXPORT',
          issuedAt: now,
          expiresAt: now + 60_000,
          singleUse: true,
        },
      },
    });

    await expect(executionService.validatePayloadOrThrow(firstPayload)).resolves.toBeUndefined();
    await expect(executionService.validatePayloadOrThrow(secondPayload)).rejects.toBeInstanceOf(ExecutionAccessDeniedError);
    await expect(executionService.validatePayloadOrThrow(secondPayload)).rejects.toThrow('REPLAY_DETECTED');

    const entries = securityLedger.getEntries();
    const last = entries[entries.length - 1];
    expect(last?.reasonCode).toBe('REPLAY_DETECTED');
    expect(auditSpy).toHaveBeenCalled();
    expect(auditSpy.mock.calls[0]?.[3]).toBe('REPLAY_DETECTED');

    auditSpy.mockRestore();
  });
});
