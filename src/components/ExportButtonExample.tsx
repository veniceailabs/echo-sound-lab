/**
 * Export Button Example Component
 *
 * Demonstrates Phase 2.2.4 React Integration:
 * - Uses useGuardedAction hook to wrap export logic
 * - Integrates with capability system
 * - Shows proper error handling and ACC flow
 * - Non-negotiable UI rules:
 *   1. Button disabled during execution (prevents re-entry)
 *   2. Errors shown, not hidden
 *   3. ACC modal handled at app level (event emitted)
 *   4. No auto-resume after denial
 *   5. No retry loops
 */

import React, { useCallback, useState } from 'react';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { Capability } from '../services/capabilities';

interface ExportButtonExampleProps {
  audioBuffer: AudioBuffer | null;
  fileName?: string;
  format?: 'WAV' | 'MP3' | 'AIFF';
  className?: string;
}

export function ExportButtonExample({
  audioBuffer,
  fileName = 'export',
  format = 'WAV',
  className = ''
}: ExportButtonExampleProps) {
  const [exportSuccess, setExportSuccess] = useState(false);

  // Pattern B: Guarded Action from Integration Guide
  // Manages full flow: check → ACC (if needed) → execute → handle result
  const { execute: executeExport, isLoading, error } = useGuardedAction(
    Capability.RENDER_EXPORT,
    `Export mix to ${format}`,
    async () => {
      // This runs only if:
      // 1. Capability check passes
      // 2. If ACC required, user has approved (handled at app level)
      // 3. No errors in previous checks

      if (!audioBuffer) {
        throw new Error('No audio buffer to export');
      }

      // TODO: Call guardedBatchProcessor.processBatchGuarded()
      // For now, simulate the export
      console.log(`[ExportButtonExample] Exporting ${fileName}.${format.toLowerCase()}`);

      // Simulate export delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`[ExportButtonExample] Export complete: ${fileName}.${format.toLowerCase()}`);
    },
    {
      // Callbacks (all optional)
      onACCRequired: (request) => {
        // ACC is needed. Event will be emitted to show app-level modal.
        // We don't handle ACC here - it's handled at App.tsx level
        console.log('[ExportButtonExample] ACC required for:', request.reason);
        // The CapabilityProvider will emit 'acc-required' event
        // App.tsx listens for it and shows the modal
      },
      onDenied: (error) => {
        // Capability was denied
        console.log('[ExportButtonExample] Export denied:', error.message);
      },
      onSuccess: () => {
        // Action succeeded
        console.log('[ExportButtonExample] Export succeeded');
        setExportSuccess(true);
        // Auto-dismiss success message after 3 seconds
        setTimeout(() => setExportSuccess(false), 3000);
      }
    }
  );

  const handleExport = useCallback(async () => {
    try {
      await executeExport();
    } catch (err) {
      // Error is already handled by the hook
      // It's stored in the `error` state
      // Render it in the component (see below)
      console.error('[ExportButtonExample] Export error caught in handler:', err);
    }
  }, [executeExport]);

  return (
    <div className={className}>
      {/* Export Button - Follows Non-Negotiable Rule #1 */}
      {/* Button disabled during execution to prevent re-entry (Rule: No event flooding) */}
      <button
        onClick={handleExport}
        disabled={isLoading || !audioBuffer}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
        title={!audioBuffer ? 'Load audio first' : 'Export processed mix'}
      >
        {isLoading ? 'Exporting...' : `Export ${format}`}
      </button>

      {/* Success Message */}
      {exportSuccess && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          ✓ Export successful: {fileName}.{format.toLowerCase()}
        </div>
      )}

      {/* Error Display - Non-Negotiable Rule #2: Errors shown, not hidden */}
      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Export Failed</p>
          <p className="text-xs text-red-800 mt-1">{error.message}</p>

          {/* Explain what happens on different error types */}
          {error.message.includes('[ACC_REQUIRED]') && (
            <p className="text-xs text-red-700 mt-2">
              Confirmation required. Check the modal above. You can dismiss it anytime.
            </p>
          )}

          {error.message.includes('[CAPABILITY_DENIED]') && (
            <p className="text-xs text-red-700 mt-2">
              This action is not permitted. Click the button again if you want to retry.
            </p>
          )}

          {error.message.includes('[C6_HALT]') && (
            <p className="text-xs text-red-700 mt-2">
              Session halted. Authority has been revoked. See status display above.
            </p>
          )}
        </div>
      )}

      {/* Rules Explanation (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-700 border border-gray-300">
          <p className="font-mono font-bold mb-1">Phase 2.2.4 Integration Rules:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>✓ Button disabled while executing (prevents re-entry)</li>
            <li>✓ Errors shown explicitly (not hidden)</li>
            <li>✓ ACC handled at App level (via event listener)</li>
            <li>✓ No auto-resume after denial (user must click again)</li>
            <li>✓ No retry loops (one action = one button click)</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default ExportButtonExample;
