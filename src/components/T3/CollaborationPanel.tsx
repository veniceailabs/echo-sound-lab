import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createCollaborationSession,
  voteForVariant,
  approveVariant,
  requestRevision,
  getCollaborationSummary,
  saveCollaborationSession,
  CollaborationSession,
} from '../../services/collaborationEngine';

interface CollaborationPanelProps {
  trackName?: string;
  onSessionCreated?: (session: CollaborationSession) => void;
}

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({
  trackName = 'My Track',
  onSessionCreated,
}) => {
  const [mode, setMode] = useState<'start' | 'review' | 'voting'>('start');
  const [artistName, setArtistName] = useState('');
  const [artistFeedback, setArtistFeedback] = useState('warm');
  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  const handleStartSession = () => {
    if (!artistName.trim()) return;

    const newSession = createCollaborationSession(trackName, artistName, artistFeedback);
    setSession(newSession);
    setShareUrl(newSession.shareUrl);
    saveCollaborationSession(newSession);
    setMode('voting');

    if (onSessionCreated) {
      onSessionCreated(newSession);
    }
  };

  const handleVote = (variantKey: 'variant1' | 'variant2' | 'variant3') => {
    if (!session) return;
    const updated = voteForVariant(session, variantKey);
    setSession(updated);
    saveCollaborationSession(updated);
  };

  const handleApprove = (variantKey: 'variant1' | 'variant2' | 'variant3') => {
    if (!session) return;
    const updated = approveVariant(session, variantKey);
    setSession(updated);
    saveCollaborationSession(updated);
    setMode('review');
  };

  const summary = useMemo(() => (session ? getCollaborationSummary(session) : ''), [session]);

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h4 className="text-sm font-bold text-slate-100 mb-2">ðŸ‘Collaboration Mode</h4>
        <p className="text-xs text-slate-400 mb-4">Create a revision workflow with your mastering engineer or collaborator.</p>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'start' && (
          <motion.div
            key="start"
            className="space-y-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-widest block mb-1">Artist/Your Name</label>
              <input
                type="text"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder="E.g., John Smith"
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-widest block mb-2">Mastering Direction</label>
              <div className="grid grid-cols-3 gap-2">
                {['warm', 'bright', 'aggressive'].map(option => (
                  <motion.button
                    key={option}
                    onClick={() => setArtistFeedback(option)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all capitalize ${
                      artistFeedback === option
                        ? 'bg-cyan-500/30 border border-cyan-400/50 text-cyan-300'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:bg-slate-700/50'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {option}
                  </motion.button>
                ))}
              </div>
            </div>

            <motion.button
              onClick={handleStartSession}
              disabled={!artistName.trim()}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-slate-200 font-semibold uppercase tracking-widest border border-purple-400/30 hover:border-pink-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ðŸšCreate Collaboration Session
            </motion.button>
          </motion.div>
        )}

        {mode === 'voting' && session && (
          <motion.div
            key="voting"
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/50">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Session ID</p>
              <p className="font-mono text-sm text-cyan-400 truncate">{session.sessionId}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">Review & Vote on Variants</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(session.variants).map(([key, variant]) => (
                  <motion.button
                    key={key}
                    onClick={() => handleVote(key as 'variant1' | 'variant2' | 'variant3')}
                    className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-cyan-400/50 transition-all space-y-1"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <p className="font-semibold text-xs text-slate-300">{(variant as any).character}</p>
                    <p className="text-xs text-cyan-400 font-mono">{(variant as any).lufs} LUFS</p>
                    <p className="text-xs text-emerald-400">ðŸ‘{(variant as any).votes}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Approve Final Master</p>
              <motion.button
                onClick={() => handleApprove(Object.keys(session.variants)[0] as any)}
                className="w-full py-2 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-sm border border-emerald-400/30 hover:border-emerald-400/50 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                âœApprove & Generate Certificate
              </motion.button>
            </div>

            <motion.div
              className="p-3 rounded-lg bg-blue-500/10 border border-blue-400/30 text-xs text-blue-300 font-mono whitespace-pre-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {summary}
            </motion.div>
          </motion.div>
        )}

        {mode === 'review' && session && (
          <motion.div
            key="review"
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30 space-y-2">
              <p className="text-sm font-bold text-emerald-300">âœMaster Approved!</p>
              <p className="text-xs text-emerald-300">
                Approved variant: <span className="font-mono font-semibold">{session.approvedVariant}</span>
              </p>
              <p className="text-xs text-emerald-400">
                Approved at: {new Date(session.approvedAt || '').toLocaleDateString()}
              </p>
            </div>

            <motion.button
              onClick={() => setMode('start')}
              className="w-full py-2 rounded-lg bg-slate-700/30 text-slate-300 font-semibold text-sm border border-slate-600/30 hover:bg-slate-600/20 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              â†Start New Collaboration
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        ðŸ’Create a session, share the URL with your engineer, they submit 3 variants, you vote and approve. Fully transparent workflow.
      </motion.div>
    </motion.div>
  );
};
