/**
 * React Hook: useGuardedAction
 *
 * Execute a guarded action with capability checking.
 * Manages the full flow: check → ACC (if needed) → execute → handle result.
 *
 * Returns:
 * - isLoading: true while action is executing
 * - error: last error (capability denied, ACC failed, action failed)
 * - execute: function to trigger the guarded action
 *
 * Usage:
 *   const { execute, isLoading, error } = useGuardedAction(
 *     Capability.RENDER_EXPORT,
 *     'Export to MP3',
 *     async () => { await exportMp3(); }
 *   );
 *
 * Call execute() to run. ACC-gated actions pause until the provider-level
 * confirmation flow resolves or is dismissed.
 */

import { useContext, useCallback, useState } from 'react';
import { CapabilityContext } from './CapabilityProvider';
import { Capability, CapabilityRequest } from '../services/capabilities';

export interface GuardedActionOptions {
  onACCRequired?: (request: CapabilityRequest) => void;
  onDenied?: (error: Error) => void;
  onSuccess?: () => void;
}

export function useGuardedAction(
  capability: Capability,
  reason: string,
  action: () => Promise<void>,
  options: GuardedActionOptions = {}
) {
  const context = useContext(CapabilityContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    if (!context) {
      const err = new Error('[NO_CAPABILITY_PROVIDER] CapabilityProvider not found');
      setError(err);
      throw err;
    }

    const { appId, executeGuarded } = context;

    const request: CapabilityRequest = {
      capability,
      scope: { appId },
      reason
    };

    setIsLoading(true);
    setError(null);

    try {
      await executeGuarded(request, action);
      options.onSuccess?.();
    } catch (err) {
      const error = err as Error;

      // ACC dismissed / unavailable
      if (error.message.includes('[ACC_REQUIRED]')) {
        options.onACCRequired?.(request);
        setError(error);
        throw error;
      }

      if (error.message.includes('[ACC_DISMISSED]') || error.message.includes('[ACC_UNAVAILABLE]')) {
        options.onDenied?.(error);
        setError(error);
        throw error;
      }

      // Capability denied
      if (
        error.message.includes('[CAPABILITY_DENIED]') ||
        error.message.includes('[C6_HALT]')
      ) {
        options.onDenied?.(error);
        setError(error);
        throw error;
      }

      // Action failed (not an auth error)
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [context, capability, reason, action, options]);

  return {
    execute,
    isLoading,
    error
  };
}

export default useGuardedAction;
