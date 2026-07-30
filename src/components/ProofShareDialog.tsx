import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  generateProofURL,
  generateQRCode,
  copyProofURLToClipboard,
  generateEmailTemplate,
  generateTwitterShare,
  encodeProofData,
} from '../services/shareProof';
import type { AudioMetrics } from '../types';

interface ProofShareDialogProps {
  trackName: string;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProofShareDialog: React.FC<ProofShareDialogProps> = ({
  trackName,
  originalMetrics,
  processedMetrics,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const proofData = useMemo(() => {
    const now = new Date().toISOString();
    return {
      trackName,
      originalLUFS: originalMetrics?.lufs?.integrated ?? -24,
      processedLUFS: processedMetrics?.lufs?.integrated ?? -14,
      dynamicRange: processedMetrics?.lufs?.loudnessRange ?? 0,
      truePeak: processedMetrics?.lufs?.truePeak ?? 0,
      stereoWidth: processedMetrics?.advancedMetrics?.stereoWidth ?? 0,
      timestamp: now,
    };
  }, [trackName, originalMetrics, processedMetrics]);

  const proofURL = useMemo(() => generateProofURL(proofData), [proofData]);
  const qrCodeURL = useMemo(() => generateQRCode(proofURL), [proofURL]);

  const handleCopyURL = async () => {
    await copyProofURLToClipboard(proofURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEmailShare = () => {
    const emailBody = generateEmailTemplate(proofData, proofURL);
    const subject = `Mastering Proof: ${trackName}`;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoLink;
  };

  const handleTwitterShare = () => {
    const tweetText = generateTwitterShare(proofData);
    const twitterLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(proofURL)}`;
    window.open(twitterLink, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={e => e.stopPropagation()}
          >
            <motion.div className="w-full max-w-md bg-slate-900 rounded-xl border border-cyan-500/30 p-6 shadow-2xl space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-100">Share Proof</h3>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ‚úï
                </button>
              </div>

              {/* QR Code */}
              <motion.div className="flex flex-col items-center space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Scan to View Proof</p>
                <img
                  src={qrCodeURL}
                  alt="QR Code"
                  className="w-32 h-32 border-2 border-cyan-500/50 rounded-lg p-2 bg-white"
                />
              </motion.div>

              {/* URL */}
              <motion.div className="space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Proof Link</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={proofURL}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500/50"
                  />
                  <motion.button
                    onClick={handleCopyURL}
                    className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all ${
                      copied
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {copied ? '‚úCopied' : 'Copy'}
                  </motion.button>
                </div>
              </motion.div>

              {/* Share Buttons */}
              <motion.div className="grid grid-cols-3 gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <motion.button
                  onClick={handleEmailShare}
                  className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 font-semibold text-xs uppercase tracking-widest hover:bg-blue-500/30 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Share via email"
                >
                  üìEmail
                </motion.button>

                <motion.button
                  onClick={handleTwitterShare}
                  className="px-3 py-2 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 font-semibold text-xs uppercase tracking-widest hover:bg-sky-500/30 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Share on Twitter"
                >
                  ùïTweet
                </motion.button>

                <motion.button
                  onClick={() => {
                    window.open(proofURL, '_blank');
                  }}
                  className="px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 font-semibold text-xs uppercase tracking-widest hover:bg-cyan-500/30 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Open proof page"
                >
                  üîOpen
                </motion.button>
              </motion.div>

              {/* Info */}
              <motion.div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
                <p>üíShare your mastering proof with clients, collaborators, or social media. The proof page is permanently accessible and immutable.</p>
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
