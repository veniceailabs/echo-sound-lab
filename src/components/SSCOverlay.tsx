import React from 'react';
import type { SSCScan } from '../types';

interface SSCOverlayProps {
  isVisible: boolean;
  scan: SSCScan | null;
  onClose: () => void;
  onRefresh: () => void;
}

const confidenceLabel = (level: SSCScan['processors'][number]['confidenceLevel']) => {
  switch (level) {
    case 'certain':
      return 'Certain';
    case 'derived':
      return 'Derived';
    default:
      return 'Heuristic';
  }
};

export const SSCOverlay: React.FC<SSCOverlayProps> = ({ isVisible, scan, onClose, onRefresh }) => {
  if (!isVisible || !scan) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm">
      <div className="absolute inset-6 bg-slate-950/95 border border-slate-700/60 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-slate-600 border border-slate-500" />
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Observe Mode</p>
              <h2 className="text-sm font-semibold text-slate-200">SSC Read-Only Session</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              Refresh Scan
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              Exit
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-800/60 text-[11px] uppercase tracking-widest text-slate-500">
          Actionability: {scan.session.actionability}
        </div>

        <div className="grid grid-cols-12 gap-4 p-6 overflow-y-auto h-[calc(100%-140px)]">
          <section className="col-span-12 lg:col-span-5 space-y-4">
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Session</p>
              <div className="text-sm text-slate-300 space-y-1">
                <p>Mode: {scan.session.mode}</p>
                <p>Actionability: {scan.session.actionability}</p>
                <p>Timestamp: {new Date(scan.session.timestamp).toLocaleString()}</p>
              </div>
            </div>

            {scan.ui && (
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">UI Tabs</p>
                <div className="text-sm text-slate-300 space-y-2">
                  <p>Active: {scan.ui.activeMode}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {scan.ui.tabs.map((tab) => (
                      <div key={tab.id} className={`rounded-lg px-2 py-1 border ${tab.active ? 'border-cyan-500/40 text-cyan-200' : 'border-slate-700/50 text-slate-500'}`}>
                        {tab.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Processing Order</p>
              <p className="text-xs text-slate-300 leading-relaxed">{scan.processingOrder}</p>
            </div>
          </section>

          <section className="col-span-12 lg:col-span-7 space-y-4">
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Processors</p>
              <div className="space-y-2">
                {scan.processors.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border border-slate-800/60 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-slate-200">{entry.label}</p>
                      <p className="text-[11px] text-slate-500">{entry.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs uppercase tracking-wider ${entry.active ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {entry.active ? 'Active' : 'Inactive'}
                      </p>
                      <p className="text-[10px] text-slate-500">{confidenceLabel(entry.confidenceLevel)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Controls</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scan.controls.map((entry) => (
                  <div key={entry.id} className="border border-slate-800/60 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{entry.label}</p>
                    <p className="text-sm text-slate-200 mt-1">{entry.value ?? 'n/a'}</p>
                    <p className="text-[11px] text-slate-500">{entry.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {scan.noOp && (
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800/60 p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">No-Op Status</p>
                {scan.noOpReasons.map((reason) => (
                  <p key={reason.id} className="text-xs text-slate-400">
                    {reason.reason}
                  </p>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
