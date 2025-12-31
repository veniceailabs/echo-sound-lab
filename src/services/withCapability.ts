/**
 * withCapability — Execution Wrapper
 *
 * Higher-order function that wraps async actions with capability checks.
 * If capability is allowed: execute action.
 * If requiresACC: defer to Self_Session_v0_Confirmation (throw ACC_REQUIRED).
 * If denied: throw CAPABILITY_DENIED.
 *
 * No partial execution. No silent degradation.
 */

import { CapabilityAuthority } from './CapabilityAuthority';
import { CapabilityRequest } from './capabilities';

export async function withCapability<T>(
  authority: CapabilityAuthority,
  request: CapabilityRequest,
  action: () => Promise<T>
): Promise<T> {
  // Check capability (throws if denied)
  const grant = authority.assertAllowed(request);

  // If ACC required, defer to confirmation system
  if (grant.requiresACC) {
    throw new Error(
      `[ACC_REQUIRED] ${request.capability} requires active consent.\n` +
      `Reason: ${request.reason}\n` +
      `Route to CapabilityAccBridge for confirmation token.`
    );
  }

  // Authority granted and no ACC needed. Execute.
  return action();
}

/**
 * Synchronous version (for non-async actions).
 */
export function withCapabilitySync<T>(
  authority: CapabilityAuthority,
  request: CapabilityRequest,
  action: () => T
): T {
  const grant = authority.assertAllowed(request);

  if (grant.requiresACC) {
    throw new Error(
      `[ACC_REQUIRED] ${request.capability} requires active consent.\n` +
      `Reason: ${request.reason}`
    );
  }

  return action();
}

export default withCapability;
