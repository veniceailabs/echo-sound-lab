/**
 * Capability ACC Modal
 *
 * Display active consent checkpoint.
 * Single-purpose: show challenge, collect response, submit.
 *
 * Non-escalating rules:
 * - No urgency language (no "hurry", "soon", "limited time")
 * - Dismissible at any time (closes modal, halts action)
 * - No auto-resume
 * - No retry counting or nagging
 * - Clear: what action, why it needs confirmation, what happens on deny
 */

import React, { useState } from 'react';
import { ConfirmationToken } from '../services/CapabilityAccBridge';

export interface CapabilityACCModalProps {
  isOpen: boolean;
  token: ConfirmationToken | null;
  reason: string;
  onConfirm: (response: string) => Promise<void>;
  onDismiss: () => void;
  isLoading?: boolean;
}

export function CapabilityACCModal({
  isOpen,
  token,
  reason,
  onConfirm,
  onDismiss,
  isLoading = false
}: CapabilityACCModalProps) {
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !token) {
    return null;
  }

  const handleSubmit = async () => {
    if (!response.trim()) {
      setError('Response required');
      return;
    }

    try {
      setError(null);
      await onConfirm(response);
      setResponse('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDismiss = () => {
    setResponse('');
    setError(null);
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      handleDismiss();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Confirmation Required
        </h2>

        {/* Reason */}
        <p className="text-sm text-gray-600 mb-4">
          {reason}
        </p>

        {/* Challenge */}
        <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Challenge</p>
          <p className="font-mono text-sm text-gray-900 break-words">
            {token.challenge_payload}
          </p>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter response
          </label>
          <input
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type here..."
            disabled={isLoading}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-gray-500 mb-6">
          You can dismiss this modal at any time. The action will be halted.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !response.trim()}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CapabilityACCModal;
