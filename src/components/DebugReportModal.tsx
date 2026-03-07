import React, { useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';

interface DebugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    memory?: number;
    cores?: number;
  };
  appState?: string;
  lastActions?: string[];
  errors?: Array<{ message: string; timestamp: number }>;
}

export const DebugReportModal: React.FC<DebugReportModalProps> = ({
  isOpen,
  onClose,
  deviceInfo,
  appState,
  lastActions = [],
  errors = [],
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const debugReport = useMemo(() => {
    const lines = [
      '=== Echo Sound Lab Debug Report ===',
      `Timestamp: ${new Date().toISOString()}`,
      `App State: ${appState || 'unknown'}`,
      '',
      '--- Device Info ---',
      `User Agent: ${deviceInfo?.userAgent || 'unknown'}`,
      `Platform: ${deviceInfo?.platform || 'unknown'}`,
      ...(deviceInfo?.memory ? [`Memory: ${deviceInfo.memory} MB`] : []),
      ...(deviceInfo?.cores ? [`Cores: ${deviceInfo.cores}`] : []),
      '',
      '--- Browser Info ---',
      `Browser: ${navigator.userAgent}`,
      `Language: ${navigator.language}`,
      `Online: ${navigator.onLine}`,
      '',
      ...(lastActions.length > 0 ? [
        '--- Last Actions ---',
        ...lastActions.slice(-10).map((action, idx) => `${idx + 1}. ${action}`),
        '',
      ] : []),
      ...(errors.length > 0 ? [
        '--- Errors (Last 10) ---',
        ...errors.slice(-10).map((err) => `[${new Date(err.timestamp).toISOString()}] ${err.message}`),
        '',
      ] : []),
      '--- Features ---',
      `AudioContext: ${typeof window !== 'undefined' && 'AudioContext' in window ? '✓' : '✗'}`,
      `WebGL: ${typeof window !== 'undefined' && 'WebGLRenderingContext' in window ? '✓' : '✗'}`,
      `Web Audio: ${typeof window !== 'undefined' && 'AnalyserNode' in window ? '✓' : '✗'}`,
      `localStorage: ${(() => {
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return '✓';
        } catch {
          return '✗';
        }
      })()}`,
    ];
    return lines.join('\n');
  }, [deviceInfo, appState, lastActions, errors]);

  const handleCopy = () => {
    navigator.clipboard.writeText(debugReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-100">Debug Report</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <pre className="text-xs text-slate-300 font-mono bg-white/[0.02] p-4 rounded-lg border border-white/5 whitespace-pre-wrap break-words overflow-auto max-h-full">
            {debugReport}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex gap-2 justify-end shrink-0">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy Report'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
