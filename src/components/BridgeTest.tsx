/**
 * BRIDGE TEST COMPONENT - PHASE 5B: THE HEARING TEST
 * UI for M2 Pro Neural Engine with Real-Time Stem Playback
 *
 * Features:
 * - Connection status indicator
 * - Real-time progress bar during processing
 * - HTML5 Audio Players for each stem (Vocals, Drums, Bass, Other)
 * - Direct streaming from Local CDN (FastAPI Static Server)
 * - System information display
 *
 * Usage:
 * ```
 * import { BridgeTest } from './components/BridgeTest';
 *
 * export function App() {
 *   return <BridgeTest />;
 * }
 * ```
 */

import React, { useEffect, useState } from 'react';
import { bridge, BridgeMessage } from '../services/BridgeService';

export const BridgeTest: React.FC = () => {
  const [status, setStatus] = useState<BridgeMessage | null>(null);
  const [systemInfo, setSystemInfo] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  /**
   * Initialize bridge connection on mount
   */
  useEffect(() => {
    console.log('[BridgeTest] Component mounted, initializing bridge...');

    // Connect to bridge
    bridge.connect();
    setIsConnected(true);

    // Subscribe to status updates
    const unsubscribe = bridge.subscribe((msg) => {
      console.log('[BridgeTest] Status update:', msg.status);
      setStatus(msg);
    });

    // Fetch system info
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('http://localhost:8000/system/info');
        if (response.ok) {
          const data = await response.json();
          setSystemInfo(data);
        }
      } catch (e) {
        console.log('System info fetch failed (bridge may be starting)');
      }
    };

    fetchSystemInfo();

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Trigger audio separation
   */
  const handleTestSeparation = () => {
    console.log('[BridgeTest] Triggering audio separation...');
    bridge.separateAudio('test_track.wav');
  };

  /**
   * Trigger health check
   */
  const handleHealthCheck = () => {
    console.log('[BridgeTest] Sending health check...');
    bridge.healthCheck();
  };

  // Derived states
  const isProcessing = status?.status === 'processing' || status?.status === 'loading';
  const isComplete = status?.status === 'complete' && status.result;
  const hasError = status?.status === 'error';
  const progress = status?.progress ?? 0;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-96 max-h-96 overflow-y-auto">
      <div className="p-6 bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-700 rounded-xl shadow-2xl font-sans">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            🌉 Neural Engine Test
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded border border-emerald-500/30">
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </h3>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        </div>

        {/* STATUS LOG */}
        <div className="mb-6 bg-black/40 p-3 rounded-lg border border-slate-800 font-mono text-xs h-16 overflow-y-auto space-y-1">
          <div className="text-slate-500">&gt; BRIDGE STATUS</div>
          <div className={`${hasError ? 'text-red-400' : status?.status === 'idle' ? 'text-green-400' : 'text-blue-400'}`}>
            &gt; {status?.status ? status.status.toUpperCase() : 'INITIALIZING'}
          </div>
          {status?.message && <div className="text-slate-400">&gt; {status.message}</div>}
          {status?.stage && <div className="text-yellow-400/80">&gt; {status.stage}</div>}
        </div>

        {/* PROGRESS BAR */}
        {isProcessing && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-blue-300 mb-2 font-mono font-bold">
              <span>PROCESSING</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* SYSTEM INFO */}
        {systemInfo && (
          <div className="mb-6 p-3 bg-slate-800/30 rounded-lg border border-slate-700 text-xs space-y-1">
            <div className="text-slate-400">
              <span className="text-slate-500">Device:</span>
              <span className="text-blue-300 ml-2 font-mono">{systemInfo.device}</span>
            </div>
            {systemInfo.mps_available && (
              <div className="text-green-400">✅ MPS (Metal) Available</div>
            )}
          </div>
        )}

        {/* STEMS PLAYER CARD - THE HEARING TEST */}
        {isComplete && status.result && (
          <div className="mb-6 p-4 bg-gradient-to-b from-emerald-900/20 to-emerald-950/10 border border-emerald-500/30 rounded-lg space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <span className="text-lg">✅</span>
              <span className="text-sm">SEPARATION COMPLETE</span>
            </div>

            {/* AUDIO PLAYERS FOR EACH STEM */}
            <div className="space-y-3">
              {Object.entries(status.result).map(([stem, url]) => (
                <div key={stem} className="flex flex-col gap-2 p-2 bg-black/30 rounded border border-white/5 hover:border-white/10 transition-colors">
                  <div className="text-slate-300 text-xs font-bold uppercase tracking-wide">
                    {stem}
                  </div>
                  {/* HTML5 AUDIO PLAYER - Direct Stream from Local CDN */}
                  <audio
                    controls
                    src={url as string}
                    className="w-full h-8 bg-slate-900 rounded hover:bg-slate-800"
                    controlsList="nodownload"
                  />
                  <div className="text-[10px] text-slate-500 font-mono">
                    {(url as string).substring((url as string).lastIndexOf('/') + 1)}
                  </div>
                </div>
              ))}
            </div>

            {/* METADATA */}
            {status.metadata && (
              <div className="pt-3 border-t border-emerald-500/20 space-y-1 text-[10px] text-slate-400">
                <div>Model: <span className="text-slate-300">{status.metadata.model}</span></div>
                <div>Processing: <span className="text-slate-300">{status.metadata.processing_time_ms}ms</span></div>
                <div>Device: <span className="text-slate-300">{status.metadata.device}</span></div>
              </div>
            )}
          </div>
        )}

        {/* ERROR MESSAGE */}
        {hasError && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg space-y-2">
            <div className="text-red-400 text-sm font-bold">❌ ERROR</div>
            <div className="text-red-300/80 text-xs">{status?.message}</div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleTestSeparation}
            disabled={isProcessing || hasError}
            className={`
              py-3 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all
              ${isProcessing || hasError
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-95'}
            `}
          >
            🎵 {isProcessing ? 'Processing...' : 'Separate'}
          </button>
          <button
            onClick={handleHealthCheck}
            disabled={isProcessing}
            className={`
              py-3 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all
              ${isProcessing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-slate-700 hover:bg-slate-600 text-white shadow-lg shadow-slate-700/20 hover:shadow-slate-700/40 active:scale-95'}
            `}
          >
            💊 Health
          </button>
        </div>

        {/* FOOTER */}
        <p className="text-center text-[10px] text-slate-600 mt-4">
          PyTorch MPS • FastAPI Static CDN • Real-Time Streaming
        </p>
      </div>
    </div>
  );
};

export default BridgeTest;
