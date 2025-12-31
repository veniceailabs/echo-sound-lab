/**
 * CapabilityProvider — React Context for Authority
 *
 * Provides access to CapabilityAuthority and process identity across component tree.
 * Single provider per app.
 *
 * Usage:
 *   <CapabilityProvider authority={authority} appId="com.test.app">
 *     <App />
 *   </CapabilityProvider>
 */

import React, { createContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CapabilityAuthority, ProcessIdentity } from '../services/CapabilityAuthority';
import { CapabilityRequest } from '../services/capabilities';

export interface CapabilityContextType {
  authority: CapabilityAuthority;
  appId: string;
  currentProcessIdentity: ProcessIdentity | null;
  isHalted: boolean;
  lastDenial: { request: CapabilityRequest; error: Error } | null;
  executeGuarded: <T>(
    request: CapabilityRequest,
    action: () => Promise<T>
  ) => Promise<T>;
}

export const CapabilityContext = createContext<CapabilityContextType | null>(null);

export interface CapabilityProviderProps {
  authority: CapabilityAuthority;
  appId: string;
  processIdentity?: ProcessIdentity;
  children: ReactNode;
}

export function CapabilityProvider({
  authority,
  appId,
  processIdentity,
  children
}: CapabilityProviderProps) {
  const [currentProcessIdentity, setCurrentProcessIdentity] = useState<ProcessIdentity | null>(
    processIdentity || null
  );
  const [isHalted, setIsHalted] = useState(false);
  const [lastDenial, setLastDenial] = useState<{
    request: CapabilityRequest;
    error: Error;
  } | null>(null);

  // Bind process identity on mount
  useEffect(() => {
    if (processIdentity) {
      authority.bindProcessIdentity(processIdentity);
      setCurrentProcessIdentity(processIdentity);
    }
  }, [authority, processIdentity]);

  /**
   * Execute an action with capability check.
   * Throws if denied or requires ACC.
   */
  const executeGuarded = useCallback(
    async <T,>(
      request: CapabilityRequest,
      action: () => Promise<T>
    ): Promise<T> => {
      try {
        // C6: Verify process identity hasn't changed
        if (currentProcessIdentity) {
          authority.assertAllowed(request, currentProcessIdentity);
        } else {
          authority.assertAllowed(request);
        }

        // Check passed. Execute action.
        return await action();
      } catch (error) {
        const err = error as Error;

        // C6: App crashed or restarted
        if (err.message.includes('[C6_HALT]')) {
          setIsHalted(true);
          setLastDenial({ request, error: err });
          throw err;
        }

        // ACC required
        if (err.message.includes('[ACC_REQUIRED]')) {
          setLastDenial({ request, error: err });
          throw err;
        }

        // Normal denial
        if (err.message.includes('[CAPABILITY_DENIED]')) {
          setLastDenial({ request, error: err });
          throw err;
        }

        // Unknown error
        throw err;
      }
    },
    [authority, currentProcessIdentity]
  );

  const value: CapabilityContextType = {
    authority,
    appId,
    currentProcessIdentity,
    isHalted,
    lastDenial,
    executeGuarded
  };

  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  );
}

export default CapabilityProvider;
