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

import React, { createContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { CapabilityAuthority, ProcessIdentity } from '../services/CapabilityAuthority';
import { CapabilityRequest } from '../services/capabilities';
import CapabilityAccBridge, { ConfirmationToken } from '../services/capabilityAccBridge';

export interface AccRequiredEventDetail {
  accToken: ConfirmationToken;
  reason: string;
  request: CapabilityRequest;
  confirm: (response: string) => Promise<void>;
  dismiss: () => void;
}

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
  const accBridgeRef = useRef<CapabilityAccBridge | null>(null);

  if (!accBridgeRef.current) {
    const sessionSeed = processIdentity?.launchTimestamp ?? Date.now();
    accBridgeRef.current = new CapabilityAccBridge(`${appId}-${sessionSeed}`);
  }

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
        const grant = currentProcessIdentity
          ? authority.assertAllowed(request, currentProcessIdentity)
          : authority.assertAllowed(request);

        if (!grant.requiresACC) {
          return await action();
        }

        if (typeof window === 'undefined') {
          throw new Error('[ACC_UNAVAILABLE] Active consent requires a browser session.');
        }

        const accBridge = accBridgeRef.current!;
        const accToken = await accBridge.issueACC(request, grant);

        return await new Promise<T>((resolve, reject) => {
          let settled = false;

          const dismiss = () => {
            if (settled) return;
            settled = true;
            accBridge.revokeACC(accToken.acc_event_id);
            reject(new Error('[ACC_DISMISSED] Active consent was dismissed.'));
          };

          const confirm = async (response: string) => {
            if (settled) return;

            const isValid = await accBridge.validateACC(accToken.acc_event_id, response);
            if (!isValid) {
              throw new Error('Confirmation did not match the challenge.');
            }

            settled = true;

            try {
              const result = await action();
              resolve(result);
            } catch (error) {
              reject(error as Error);
            }
          };

          window.dispatchEvent(
            new CustomEvent<AccRequiredEventDetail>('acc-required', {
              detail: {
                accToken,
                reason: request.reason,
                request,
                confirm,
                dismiss,
              },
            })
          );
        });
      } catch (error) {
        const err = error as Error;

        // C6: App crashed or restarted
        if (err.message.includes('[C6_HALT]')) {
          setIsHalted(true);
          setLastDenial({ request, error: err });
          throw err;
        }

        // ACC required
        if (
          err.message.includes('[ACC_REQUIRED]') ||
          err.message.includes('[ACC_DISMISSED]') ||
          err.message.includes('[ACC_UNAVAILABLE]')
        ) {
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
