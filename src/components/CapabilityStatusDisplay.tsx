/**
 * Capability Status Display
 *
 * Read-only display of authority state.
 * Unmistakably clear when:
 * - Session is halted (C6 violation, process changed)
 * - Last denial reason
 * - Active capabilities (diagnostic)
 *
 * Design: Simple, factual, no euphemism.
 */

import React, { useContext } from 'react';
import { CapabilityContext } from '../hooks/CapabilityProvider';
import { Capability } from '../services/capabilities';

export interface CapabilityStatusDisplayProps {
  verbose?: boolean; // Show active grants list
  className?: string;
}

export function CapabilityStatusDisplay({
  verbose = false,
  className = ''
}: CapabilityStatusDisplayProps) {
  const context = useContext(CapabilityContext);

  if (!context) {
    return null;
  }

  const { isHalted, lastDenial, authority, appId, currentProcessIdentity } = context;

  // Halted state (highest severity)
  if (isHalted) {
    return (
      <div className={`${className} bg-red-50 border-2 border-red-600 rounded p-4`}>
        <div className="flex items-start gap-3">
          <div className="text-2xl">🛑</div>
          <div>
            <h3 className="font-bold text-red-900">Session Halted</h3>
            <p className="text-sm text-red-800 mt-1">
              Authority has been revoked. No actions are permitted.
            </p>
            {lastDenial && (
              <p className="text-xs text-red-700 mt-2 font-mono">
                {lastDenial.error.message}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Last denial (if any)
  if (lastDenial) {
    return (
      <div className={`${className} bg-yellow-50 border border-yellow-400 rounded p-3`}>
        <div className="flex items-start gap-2">
          <div className="text-xl">⚠️</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">Action Denied</p>
            <p className="text-xs text-yellow-800 mt-1">
              {lastDenial.request.reason}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active state
  return (
    <div className={`${className} bg-green-50 border border-green-300 rounded p-3 text-xs`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-lg">✓</div>
        <p className="font-medium text-green-900">Session Active</p>
      </div>

      {verbose && (
        <div className="mt-2 space-y-1 text-green-800">
          <p>App: <span className="font-mono">{appId}</span></p>
          {currentProcessIdentity && (
            <>
              <p>PID: <span className="font-mono">{currentProcessIdentity.pid}</span></p>
              <p>
                Active Grants:
                <span className="font-mono text-xs block mt-1">
                  {authority.getActiveGrants().length} capability(ies)
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Capability Requirement Badge
 * Display what's needed for an action.
 */
export function CapabilityRequirementBadge({
  capability,
  requiresACC = false,
  className = ''
}: {
  capability: Capability;
  requiresACC?: boolean;
  className?: string;
}) {
  const capabilityLabel = capability
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div
      className={`${className} inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono ${
        requiresACC
          ? 'bg-orange-100 text-orange-900 border border-orange-300'
          : 'bg-gray-100 text-gray-900 border border-gray-300'
      }`}
    >
      <span>{capabilityLabel}</span>
      {requiresACC && <span className="text-orange-600">🔐</span>}
    </div>
  );
}

export default CapabilityStatusDisplay;
