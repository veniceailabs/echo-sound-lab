import { describe, expect, test } from 'vitest';
import {
  CapabilityAuthority,
  CapabilityDeniedError,
} from '../services/CapabilityAuthority';
import { Capability, CapabilityGrant, CapabilityRequest } from '../services/capabilities';

const makeRequest = (appId: string): CapabilityRequest => ({
  capability: Capability.RENDER_EXPORT,
  scope: { appId },
  reason: 'Export mastered track',
});

const makeGrant = (appId: string, expiresAt: number): CapabilityGrant => ({
  capability: Capability.RENDER_EXPORT,
  scope: { appId },
  expiresAt,
  requiresACC: true,
});

describe('CapabilityAuthority strict denial reason codes', () => {
  test('returns MISSING_GRANT when no capability grant exists', () => {
    const authority = new CapabilityAuthority('session-1', () => 1_000);

    expect(() => authority.assertAllowed(makeRequest('com.echo.soundlab'))).toThrowError(CapabilityDeniedError);

    try {
      authority.assertAllowed(makeRequest('com.echo.soundlab'));
    } catch (error) {
      const denied = error as CapabilityDeniedError;
      expect(denied.reasonCode).toBe('MISSING_GRANT');
      expect(denied.message).toContain('[CAPABILITY_DENIED][MISSING_GRANT]');
    }
  });

  test('returns SCOPE_MISMATCH when request scope does not match grant scope', () => {
    const authority = new CapabilityAuthority('session-2', () => 1_000);
    authority.grant(makeGrant('com.echo.soundlab', 10_000));

    try {
      authority.assertAllowed(makeRequest('com.other.app'));
    } catch (error) {
      const denied = error as CapabilityDeniedError;
      expect(denied.reasonCode).toBe('SCOPE_MISMATCH');
      expect(denied.message).toContain('[CAPABILITY_DENIED][SCOPE_MISMATCH]');
    }
  });

  test('returns TTL_EXPIRED when matching grant exists but has expired', () => {
    let now = 1_000;
    const authority = new CapabilityAuthority('session-3', () => now);
    authority.grant(makeGrant('com.echo.soundlab', 2_000));

    now = 2_001;

    try {
      authority.assertAllowed(makeRequest('com.echo.soundlab'));
    } catch (error) {
      const denied = error as CapabilityDeniedError;
      expect(denied.reasonCode).toBe('TTL_EXPIRED');
      expect(denied.message).toContain('[CAPABILITY_DENIED][TTL_EXPIRED]');
    }
  });
});
