import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import ProofLayer from './ProofLayer';
import { useStreak } from '../hooks/useStreak';
import { useBatchMastering } from '../hooks/useBatchMastering';
import { useAIProfile } from '../hooks/useAIProfile';
import { playCelebration, playMilestoneUnlock } from '../services/audioFeedback';
import { downloadCertificate, getNextCertificateNumber } from '../services/certificateGenerator';
import { AIProfilePanel } from './T3/AIProfilePanel';
import { ReferenceMatchingPanel } from './T3/ReferenceMatchingPanel';
import { VariantComparisonPanel } from './T3/VariantComparisonPanel';
import { CollaborationPanel } from './T3/CollaborationPanel';
import type { AudioMetrics, ABVariant } from '../types';

interface FirstSongReadyScreenProps {
  trackName?: string;
  processedBuffer?: AudioBuffer;
  originalBuffer?: AudioBuffer;
  originalMetrics?: AudioMetrics | null;
  processedMetrics?: AudioMetrics | null;
  variant?: ABVariant;
  onDownload?: () => void;
  onAdvancedMixer?: () => void;
  onViewCertificate?: () => void;
  onProofModeOpened?: () => void;
}

/**
 * FirstSongReadyScreen: Celebration + Proof Layer
 * Shows success state with optional before/after proof
 * FEEL mode: celebration UI (default)
 * PROOF mode: waveform + spectrum + LUFS evidence
 */

export const FirstSongReadyScreen: React.FC<FirstSongReadyScreenProps> = ({
  trackName = 'Your Track',
  processedBuffer,
  originalBuffer,
  originalMetrics,
  processedMetrics,
  variant = 'magic',
  onDownload,
  onAdvancedMixer,
  onViewCertificate,
  onProofModeOpened,
}) => {
  const [proofMode, setProofMode] = useState(false);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const { streak, recordTrackMastered, getMilestoneLabel, getStreakLabel } = useStreak();
  const { addSession } = useBatchMastering();

  // Record track on component mount (track completed)
  useEffect(() => {
    recordTrackMastered();
    // Add to batch sessions
    addSession(trackName, originalMetrics, processedMetrics);

    // Play celebration sound + milestone unlock if applicable
    setTimeout(() => {
      playCelebration();
    }, 300);

    // Check if we just hit a milestone
    const storedBefore = localStorage.getItem('esl:streak:prev');
    const currentMilestones = [5, 25, 100, 500];
    const prevTotal = storedBefore ? JSON.parse(storedBefore).totalTracks : streak.totalTracks - 1;

    const hitMilestone = currentMilestones.some(
      m => prevTotal < m && streak.totalTracks >= m
    );

    if (hitMilestone) {
      setTimeout(() => {
        playMilestoneUnlock();
      }, 1200);
    }
  }, []);

  const handleProofToggle = (newMode: boolean) => {
    setProofMode(newMode);
    if (newMode && onProofModeOpened) {
      onProofModeOpened();
    }
  };

  const lufs = processedMetrics?.lufs?.integrated ?? -14;
  const originalLUFS = originalMetrics?.lufs?.integrated ?? -24;

  const lufsMotion = useMotionValue(originalLUFS);
  const lufsDisplay = useTransform(lufsMotion, v => v.toFixed(1) + ' LUFS');

  const handleDownloadCertificate = () => {
    const certificateNumber = getNextCertificateNumber();
    downloadCertificate({
      trackName,
      timestamp: new Date(),
      certificateNumber,
      originalLUFS,
      processedLUFS: lufs,
      dynamicRange: processedMetrics?.lufs?.loudnessRange ?? 0,
      truePeak: processedMetrics?.lufs?.truePeak ?? 0,
      stereoWidth: processedMetrics?.advancedMetrics?.stereoWidth ?? 0,
    });
    if (onViewCertificate) {
      onViewCertificate();
    }
  };

  // Confetti animation
  useEffect(() => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      age: number;
    }

    const colors = ['#22d3ee', '#10b981', '#a855f7', '#fb923c', '#f59e0b'];
    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 4 + 2,
      size: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      age: 0,
    }));

    const DURATION = 3000;
    const startTime = Date.now();
    let raf: number;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const elapsed = Date.now() - startTime;

      if (elapsed > DURATION) {
        cancelAnimationFrame(raf);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.age = elapsed / DURATION;
        p.vy += 0.25; // gravity
        p.x += p.vx;
        p.y += p.vy;

        // Fade out in last third
        if (p.age > 0.66) {
          p.alpha = Math.max(0, 1 - (p.age - 0.66) / 0.34);
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // LUFS count-up animation
  useEffect(() => {
    animate(lufsMotion, lufs, { duration: 1.5, delay: 0.4 });
  }, [lufs, lufsMotion]);
  const isSpotifyReady = lufs >= -14.5 && lufs <= -13.5;
  const isAppleMusicReady = lufs >= -16.5 && lufs <= -15.5;

  return (
    <motion.div
      className="first-song-ready-screen relative overflow-hidden w-full max-w-2xl mx-auto space-y-8 py-12 px-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Confetti Canvas */}
      <canvas
        ref={confettiCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-50"
        aria-hidden="true"
      />

      {/* Mode Toggle: FEEL / PROOF */}
      <div className="flex justify-center gap-2 mb-8">
        <motion.button
          onClick={() => handleProofToggle(false)}
          className={`px-6 py-2 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all ${
            !proofMode
              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50'
              : 'bg-slate-700/30 text-slate-400 border border-slate-600/30 hover:bg-slate-600/20'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Feel
        </motion.button>

        <motion.button
          onClick={() => handleProofToggle(true)}
          disabled={!processedBuffer}
          className={`px-6 py-2 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all ${
            proofMode
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
              : 'bg-slate-700/30 text-slate-400 border border-slate-600/30 hover:bg-slate-600/20'
          } ${!processedBuffer ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={processedBuffer ? { scale: 1.05 } : {}}
          whileTap={processedBuffer ? { scale: 0.95 } : {}}
        >
          Proof
        </motion.button>
      </div>

      {/* FEEL Mode: Celebration */}
      {!proofMode && (
        <motion.div
          className="space-y-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Success Celebration */}
          <motion.div
            className="text-center space-y-4"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'backOut' }}
          >
            <motion.div
              className="text-6xl"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, ease: 'linear' }}
            >
              ✨
            </motion.div>
            <h2 className="text-4xl font-bold text-slate-100">Release Ready!</h2>
            <p className="text-slate-400 text-lg">
              {trackName} is mastered and ready for streaming.
            </p>

            {/* Streak & Milestone Badges */}
            <motion.div
              className="flex flex-col items-center gap-2 pt-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              {getStreakLabel(streak.count) && (
                <motion.div
                  className="px-3 py-1 rounded-full bg-orange-500/20 border border-orange-400/30 text-xs font-semibold text-orange-300"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.6 }}
                >
                  {getStreakLabel(streak.count)}
                </motion.div>
              )}
              {getMilestoneLabel(streak.totalTracks) && (
                <motion.div
                  className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-semibold text-emerald-300"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.7 }}
                >
                  {getMilestoneLabel(streak.totalTracks)}
                </motion.div>
              )}
            </motion.div>
          </motion.div>

          {/* Loudness Display */}
          <motion.div
            className="bg-gradient-to-br from-slate-900/40 to-slate-800/20 rounded-lg p-8 border border-slate-700/30 space-y-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="text-center">
              <p className="text-slate-500 text-sm uppercase tracking-widest mb-2">Integrated Loudness</p>
              <motion.p
                className="text-5xl font-bold text-cyan-400"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.6, ease: 'backOut', delay: 0.3 }}
              >
                {lufsDisplay}
              </motion.p>
            </div>

            {/* Platform Compliance Badges */}
            <div className="grid grid-cols-2 gap-4">
              <motion.div
                className={`p-4 rounded-lg border text-center ${
                  isSpotifyReady
                    ? 'bg-green-500/10 border-green-400/30'
                    : 'bg-amber-500/10 border-amber-400/30'
                }`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                <p className={`text-xs uppercase tracking-widest mb-1 ${isSpotifyReady ? 'text-green-300' : 'text-amber-300'}`}>
                  {isSpotifyReady ? 'Spotify' : 'Spotify'}
                </p>
                <p className="text-xs text-slate-400">-14 LUFS</p>
              </motion.div>

              <motion.div
                className={`p-4 rounded-lg border text-center ${
                  isAppleMusicReady
                    ? 'bg-green-500/10 border-green-400/30'
                    : 'bg-amber-500/10 border-amber-400/30'
                }`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                <p className={`text-xs uppercase tracking-widest mb-1 ${isAppleMusicReady ? 'text-green-300' : 'text-amber-300'}`}>
                  {isAppleMusicReady ? 'Apple Music' : 'Apple Music'}
                </p>
                <p className="text-xs text-slate-400">-16 LUFS</p>
              </motion.div>
            </div>
          </motion.div>

          {/* T3: Mastering Tools Section */}
          <motion.div
            className="pt-6 border-t border-slate-700/50 space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div>
              <h3 className="text-lg font-bold text-slate-100 mb-4">🎚Professional Mastering Tools</h3>
              <div className="space-y-6">
                {/* T3.1: AI Profile */}
                <AIProfilePanel
                  trackName={trackName}
                  currentLUFS={processedMetrics?.lufs?.integrated ?? -14}
                  onTagSelected={(char, lufs) => {
                    console.log('Tagged as:', char, lufs);
                  }}
                />

                {/* T3.2: Reference Matching */}
                <ReferenceMatchingPanel
                  userMetrics={originalMetrics}
                  processedMetrics={processedMetrics}
                  onMatchApplied={report => console.log('Reference match applied:', report)}
                />

                {/* T3.3: Variant Comparison */}
                <VariantComparisonPanel
                  originalLUFS={originalMetrics?.lufs?.integrated ?? -24}
                  originalMetrics={originalMetrics}
                  processedMetrics={processedMetrics}
                  trackName={trackName}
                />

                {/* T3.4: Collaboration */}
                <CollaborationPanel
                  trackName={trackName}
                  onSessionCreated={session => console.log('Collaboration session created:', session)}
                />
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            className="space-y-3 pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <motion.button
              onClick={onDownload}
              className="w-full py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-lg uppercase tracking-widest hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Download Master
            </motion.button>

            <motion.button
              onClick={onAdvancedMixer}
              className="w-full py-3 rounded-lg bg-slate-700/30 text-slate-300 font-semibold uppercase tracking-widest border border-slate-600/30 hover:bg-slate-600/20 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Open Advanced Mixer
            </motion.button>

            <motion.button
              onClick={handleDownloadCertificate}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-slate-300 font-semibold uppercase tracking-widest border border-purple-400/30 hover:border-cyan-400/50 hover:text-slate-100 transition-all"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Get your certificate →
            </motion.button>
          </motion.div>
        </motion.div>
      )}

      {/* PROOF Mode: Visual Evidence */}
      {proofMode && processedBuffer && originalBuffer && (
        <motion.div
          className="space-y-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-slate-100">Before & After</h3>
            <p className="text-slate-400 text-sm mt-2">Visual proof of transformation</p>
          </div>

          <ProofLayer
            originalBuffer={originalBuffer}
            processedBuffer={processedBuffer}
            originalMetrics={originalMetrics || null}
            processedMetrics={processedMetrics || null}
            variant={variant}
            onProofModeOpened={onProofModeOpened}
          />

          <motion.button
            onClick={onDownload}
            className="w-full py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-lg uppercase tracking-widest hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Download Master
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default FirstSongReadyScreen;
