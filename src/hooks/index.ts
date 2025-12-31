/**
 * Capability Hooks Index
 *
 * All hooks and providers for integrating capability authority into React components.
 * No convenience helpers. All guards are explicit.
 */

export { CapabilityProvider, CapabilityContext } from './CapabilityProvider';
export type { CapabilityProviderProps, CapabilityContextType } from './CapabilityProvider';

export { useCapabilityCheck, useCapabilitiesAllOf, useCapabilitiesAnyOf } from './useCapabilityCheck';

export { useGuardedAction } from './useGuardedAction';
export type { GuardedActionOptions } from './useGuardedAction';

// Import CapabilityACCModal and CapabilityStatusDisplay from components
// (Not in hooks directory, but exported here for convenience)
