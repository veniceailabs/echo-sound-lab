/**
 * AnalyticsDashboard â€Sprint 5B
 * Reads real local session data from services rather than mock metrics.
 * 30-second polling to stay fresh.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { debugTelemetryService } from '../services/debugTelemetryService';
import { storageService } from '../services/storageService';

interface LocalSessionMetrics {
  errorCount: number;
  sessionStartCount: number;
  uploadCount: number;
  processingCount: number;
  downloadCount: number;
  savedProjectCount: number;
  debugLogCount: number;
  lastUpdated: number;
}

function readLocalMetrics(): LocalSessionMetrics {
  const errors = debugTelemetryService.getRecentErrors();
  const debugLogs = storageService.getDebugLogs ? storageService.getDebugLogs() : [];

  // Event counters written by abVariantService and elsewhere
  function readCounter(key: string): number {
    try {
      return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
    } catch { return 0; }
  }

  const uploadCount = readCounter('echo.events.upload_started');
  const processingCount = readCounter('echo.events.processing_completed');
  const downloadCount = readCounter('echo.events.download_clicked');
  const sessionStartCount = readCounter('echo.events.session_started');

  // Saved project count â€count keys in localStorage matching project pattern
  let savedProjectCount = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('echo.project.') || key.startsWith('echo_project_') || key.includes('savedProject'))) {
        savedProjectCount++;
      }
    }
  } catch { /* ignore */ }

  return {
    errorCount: errors.length,
    sessionStartCount,
    uploadCount,
    processingCount,
    downloadCount,
    savedProjectCount,
    debugLogCount: Array.isArray(debugLogs) ? debugLogs.length : 0,
    lastUpdated: Date.now(),
  };
}

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  trend?: number;
}> = ({ label, value, unit, note, trend }) => (
  <motion.div
    className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-6"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">{label}</p>
    <div className="flex items-baseline gap-2">
      <p className="text-3xl font-bold text-cyan-400">{value}</p>
      {unit && <p className="text-sm text-slate-400">{unit}</p>}
    </div>
    {note && <p className="text-[10px] text-slate-600 mt-1">{note}</p>}
    {trend !== undefined && (
      <p className={`text-xs mt-2 ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {trend > 0 ? 'â†‘' : 'â†“'} {Math.abs(trend)}% vs last month
      </p>
    )}
  </motion.div>
);

export const AnalyticsDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<LocalSessionMetrics>(readLocalMetrics);

  const refresh = useCallback(() => {
    setMetrics(readLocalMetrics());
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const lastUpdatedStr = new Date(metrics.lastUpdated).toLocaleTimeString();

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">Analytics Dashboard</h1>
            <p className="text-slate-400 mt-2">Local session data â€refreshes every 30s</p>
          </div>
          <div className="text-right">
            <button
              onClick={refresh}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all"
            >
              Refresh
            </button>
            <p className="text-[10px] text-slate-600 mt-1">Last updated {lastUpdatedStr}</p>
          </div>
        </div>

        {/* Event Counters */}
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Session events (local session data)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Files Uploaded"
              value={metrics.uploadCount}
              note="Local session data"
            />
            <MetricCard
              label="Masters Completed"
              value={metrics.processingCount}
              note="Local session data"
            />
            <MetricCard
              label="Downloads"
              value={metrics.downloadCount}
              note="Local session data"
            />
            <MetricCard
              label="Sessions Started"
              value={metrics.sessionStartCount}
              note="Local session data"
            />
          </div>
        </div>

        {/* Health Metrics */}
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">App health (local session data)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Saved Projects"
              value={metrics.savedProjectCount}
              note="Local session data"
            />
            <MetricCard
              label="Recent Errors"
              value={metrics.errorCount}
              note="Local session data"
              unit={metrics.errorCount === 0 ? 'âœclean' : undefined}
            />
            <MetricCard
              label="Debug Log Entries"
              value={metrics.debugLogCount}
              note="Local session data"
            />
          </div>
        </div>

        {/* Status Panel */}
        <motion.div
          className="bg-gradient-to-br from-cyan-900/20 to-blue-900/10 border border-cyan-400/30 rounded-lg p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <h3 className="text-lg font-bold text-cyan-300 mb-4">Session Status</h3>
          <ul className="space-y-2">
            <li className="text-sm text-slate-300">
              {metrics.errorCount === 0
                ? 'âœNo errors recorded in this session'
                : `âš${metrics.errorCount} error(s) detected â€check browser console`}
            </li>
            <li className="text-sm text-slate-300">
              {metrics.processingCount > 0
                ? `âœ${metrics.processingCount} master(s) completed successfully`
                : 'â€No masters completed yet in this session'}
            </li>
            <li className="text-sm text-slate-300">
              {metrics.uploadCount > 0
                ? `âœ${metrics.uploadCount} file(s) uploaded`
                : 'â€No uploads recorded yet'}
            </li>
            <li className="text-xs text-slate-500 mt-3">
              Note: All metrics are local session data from this browser. Server-side analytics require backend integration.
            </li>
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default AnalyticsDashboard;
