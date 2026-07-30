import React from 'react';
import { motion } from 'framer-motion';
import { useBatchMastering } from '../hooks/useBatchMastering';

interface BatchMasteringDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatchMasteringDashboard: React.FC<BatchMasteringDashboardProps> = ({ isOpen, onClose }) => {
  const { sessions, getStats, removeSession, clearSessions, exportStats } = useBatchMastering();
  const stats = getStats();

  if (!isOpen) return null;

  const handleExport = () => {
    const data = exportStats();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mastering-batch-${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="fixed inset-4 md:inset-12 bg-slate-900 border border-cyan-500/30 rounded-xl overflow-auto z-50"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-cyan-500/20 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Batch Mastering Stats</h2>
            <p className="text-sm text-slate-400 mt-1">Track your mastering progress across multiple tracks</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl">
            âœ•
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          {stats.totalTracks > 0 ? (
            <>
              <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Total Tracks</p>
                  <p className="text-3xl font-bold text-cyan-400">{stats.totalTracks}</p>
                </div>

                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Avg Improvement</p>
                  <p className="text-3xl font-bold text-orange-400">{stats.avgImprovement.toFixed(1)} dB</p>
                </div>

                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Avg LUFS</p>
                  <p className="text-3xl font-bold text-emerald-400">{stats.avgLUFS.toFixed(1)}</p>
                </div>

                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Session Time</p>
                  <p className="text-sm text-slate-300 font-mono">{new Date(stats.createdAt).toLocaleDateString()}</p>
                </div>
              </motion.div>

              {/* Sessions Table */}
              <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                <h3 className="text-sm font-bold text-slate-200">Recent Mastering Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700/50">
                      <tr className="text-xs text-slate-500 uppercase tracking-widest">
                        <th className="text-left py-2 px-3">Track</th>
                        <th className="text-right py-2 px-3">Original</th>
                        <th className="text-right py-2 px-3">Mastered</th>
                        <th className="text-right py-2 px-3">Improvement</th>
                        <th className="text-right py-2 px-3">Peak</th>
                        <th className="text-center py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {sessions.map((session, idx) => (
                        <motion.tr
                          key={session.sessionId}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3 px-3 text-slate-300 font-mono text-xs">{session.trackName}</td>
                          <td className="py-3 px-3 text-right text-slate-400 font-mono">{session.originalLUFS.toFixed(1)}</td>
                          <td className="py-3 px-3 text-right text-cyan-400 font-mono font-bold">{session.processedLUFS.toFixed(1)}</td>
                          <td className="py-3 px-3 text-right text-emerald-400 font-mono">+{session.improvement.toFixed(1)}</td>
                          <td className="py-3 px-3 text-right text-orange-400 font-mono text-xs">{session.truePeak.toFixed(1)}</td>
                          <td className="py-3 px-3 text-center">
                            <motion.button
                              onClick={() => removeSession(session.sessionId)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              âœ•
                            </motion.button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {/* Actions */}
              <motion.div className="flex gap-3 justify-end pt-4 border-t border-slate-700/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <motion.button
                  onClick={handleExport}
                  className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 font-semibold text-sm border border-cyan-400/30 hover:bg-cyan-500/30 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  ðŸ“Export JSON
                </motion.button>

                <motion.button
                  onClick={clearSessions}
                  className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 font-semibold text-sm border border-red-400/30 hover:bg-red-500/30 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  ðŸ—‘ï¸Clear All
                </motion.button>
              </motion.div>
            </>
          ) : (
            <motion.div className="text-center py-12 space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-lg text-slate-400">No mastering sessions yet</p>
              <p className="text-sm text-slate-500">Complete your first track to see stats here.</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
