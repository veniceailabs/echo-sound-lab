import React, { useEffect, useState } from 'react';

interface ProcessingOverlayProps {
  isVisible: boolean;
  steps: string[];
  currentStepIndex: number;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ isVisible, steps, currentStepIndex }) => {
  const [logs, setLogs] = useState<string[]>([]);

  // Effect to accumulate logs for a terminal feel
  useEffect(() => {
    if (isVisible && steps[currentStepIndex]) {
      setLogs(prev => [...prev, `> ${steps[currentStepIndex]}...`]);
    } else if (!isVisible) {
      setLogs([]);
    }
  }, [currentStepIndex, isVisible, steps]);

  if (!isVisible) return null;

  const progress = Math.min(100, Math.max(0, ((currentStepIndex + 1) / steps.length) * 100));

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-md rounded-2xl shadow-[0_0_50px_rgba(249,115,22,0.1)] overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-slate-200 font-bold tracking-wide uppercase text-sm">Processing Audio</span>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Main Status */}
          <div className="mb-8 text-center">
            <div className="text-4xl mb-4">PROC</div>
            <h3 className="text-xl font-bold text-white mb-2">
              {steps[currentStepIndex] || 'Finalizing...'}
            </h3>
            <p className="text-slate-400 text-sm">Please wait while the audio engine renders.</p>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-6">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Terminal Logs */}
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs text-green-400 h-32 overflow-y-auto border border-white/5 custom-scrollbar">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 opacity-80">{log}</div>
            ))}
            <div className="animate-pulse">_</div>
          </div>
        </div>
      </div>
    </div>
  );
};