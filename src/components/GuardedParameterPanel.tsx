/**
 * Guarded Parameter Panel Example
 *
 * Demonstrates Phase 2.2.4 React Integration Pattern A:
 * - Uses useCapabilityCheck hook for conditional rendering
 * - Shows/hides UI based on capability grants
 * - No error handling needed - returns true/false
 * - Clean, non-escalating UX (missing features just don't show)
 */

import React from 'react';
import { useCapabilityCheck, useCapabilitiesAllOf } from '../hooks/useCapabilityCheck';
import { Capability } from '../services/capabilities';

interface GuardedParameterPanelProps {
  currentEQ?: { frequency: number; gain: number }[];
  onEQChange?: (eq: any) => void;
  className?: string;
}

export function GuardedParameterPanel({
  currentEQ = [],
  onEQChange,
  className = ''
}: GuardedParameterPanelProps) {
  // Pattern A: Check if parameter adjustment is allowed
  const canAdjustParameters = useCapabilityCheck(
    Capability.PARAMETER_ADJUSTMENT,
    'Adjust audio parameters'
  );

  // Pattern A variant: Check multiple capabilities (all must be present)
  const canAdjustAndExport = useCapabilitiesAllOf(
    [Capability.PARAMETER_ADJUSTMENT, Capability.RENDER_EXPORT],
    'Advanced audio processing with export'
  );

  // If core capability denied, don't show controls at all
  if (!canAdjustParameters) {
    return (
      <div className={`${className} p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600`}>
        <p className="text-gray-700 font-medium mb-1">Parameter Adjustment</p>
        <p className="text-xs text-gray-500">Not available in this session.</p>
      </div>
    );
  }

  // If we get here, canAdjustParameters === true
  // So we can safely render the controls

  return (
    <div className={`${className} p-4 bg-white border border-gray-200 rounded`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">Parameter Controls</h3>
        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-mono">
          ✓ Capability Granted
        </span>
      </div>

      {/* EQ Controls - Only shown if capability is granted */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bass (60 Hz)
          </label>
          <input
            type="range"
            min="-12"
            max="12"
            defaultValue="0"
            className="w-full"
            disabled={!canAdjustParameters}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Midrange (1 kHz)
          </label>
          <input
            type="range"
            min="-12"
            max="12"
            defaultValue="0"
            className="w-full"
            disabled={!canAdjustParameters}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Treble (8 kHz)
          </label>
          <input
            type="range"
            min="-12"
            max="12"
            defaultValue="0"
            className="w-full"
            disabled={!canAdjustParameters}
          />
        </div>
      </div>

      {/* Conditional Feature: Advanced Processing */}
      {canAdjustAndExport && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm font-medium text-blue-900 mb-2">Advanced Mode Unlocked</p>
          <p className="text-xs text-blue-800 mb-2">
            You have both PARAMETER_ADJUSTMENT and RENDER_EXPORT capabilities.
          </p>
          <button className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium">
            Save This Mix as Preset
          </button>
        </div>
      )}

      {/* Info Text */}
      <p className="text-xs text-gray-500 mt-3">
        These controls are available because you have the PARAMETER_ADJUSTMENT capability.
        {canAdjustAndExport && ' You also have export capability.'}
      </p>
    </div>
  );
}

export default GuardedParameterPanel;
