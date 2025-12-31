/**
 * React Hook: useCapabilityCheck
 *
 * Non-throwing capability check for conditional rendering.
 * Does NOT execute actions. Only checks if capability is granted.
 *
 * Usage:
 *   const canExport = useCapabilityCheck(Capability.RENDER_EXPORT, 'Export to MP3');
 *   if (!canExport) return <div>Export not allowed</div>;
 *
 * Never use this to hide checks and then execute anyway.
 * If capability is not present, it must not exist in UI at all.
 */

import { useContext } from 'react';
import { CapabilityAuthority } from '../services/CapabilityAuthority';
import { Capability, CapabilityRequest } from '../services/capabilities';
import { CapabilityContext } from './CapabilityProvider';

export function useCapabilityCheck(
  capability: Capability,
  reason: string,
  appId?: string
): boolean {
  const context = useContext(CapabilityContext);

  if (!context) {
    console.warn('[useCapabilityCheck] No CapabilityProvider found. Denying capability.');
    return false;
  }

  const { authority, currentProcessIdentity, appId: contextAppId } = context;
  const finalAppId = appId || contextAppId;

  if (!finalAppId) {
    console.warn('[useCapabilityCheck] No app ID. Denying capability.');
    return false;
  }

  const request: CapabilityRequest = {
    capability,
    scope: { appId: finalAppId },
    reason
  };

  return authority.isAllowed(request, currentProcessIdentity);
}

/**
 * Check multiple capabilities (ALL must be present).
 */
export function useCapabilitiesAllOf(
  capabilities: Capability[],
  reason: string,
  appId?: string
): boolean {
  const context = useContext(CapabilityContext);

  if (!context) {
    return false;
  }

  const { authority, currentProcessIdentity, appId: contextAppId } = context;
  const finalAppId = appId || contextAppId;

  if (!finalAppId) {
    return false;
  }

  return capabilities.every(capability => {
    const request: CapabilityRequest = {
      capability,
      scope: { appId: finalAppId },
      reason
    };

    return authority.isAllowed(request, currentProcessIdentity);
  });
}

/**
 * Check multiple capabilities (ANY must be present).
 */
export function useCapabilitiesAnyOf(
  capabilities: Capability[],
  reason: string,
  appId?: string
): boolean {
  const context = useContext(CapabilityContext);

  if (!context) {
    return false;
  }

  const { authority, currentProcessIdentity, appId: contextAppId } = context;
  const finalAppId = appId || contextAppId;

  if (!finalAppId) {
    return false;
  }

  return capabilities.some(capability => {
    const request: CapabilityRequest = {
      capability,
      scope: { appId: finalAppId },
      reason
    };

    return authority.isAllowed(request, currentProcessIdentity);
  });
}

export default useCapabilityCheck;
