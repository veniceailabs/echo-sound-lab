/**
 * BlindTestPanel — Phase 2E
 * UI for conducting double-blind audio comparisons
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createBlindSession,
  recordVote,
  resolveResults,
  BlindTestSession,
  BlindTestResult,
} from '../services/BlindTestFramework';

interface BlindTestPanelProps {
  bufferA: AudioBuffer | null;
  labelA: string;
  bufferB: AudioBuffer | null;
  labelB: string;
  onPlaySlot: (slot: 1 | 2, buffer: AudioBuffer) => void;
  onClose?: () => void;
}

type PanelPhase = 'listening' | 'voted' | 'revealed';

export const BlindTestPanel: React.FC<BlindTestPanelProps> = ({
  bufferA,
  labelA,
  bufferB,
  labelB,
  onPlaySlot,
  onClose,
}) => {
  const [session, setSession] = useState<BlindTestSession | null>(null);
  const [phase, setPhase] = useState<PanelPhase>('listening');
  const [voted, setVoted] = useState<1 | 2 | null>(null);
  const [result, setResult] = useState<BlindTestResult | null>(null);

  // Start a new session
  const handleStart = useCallback(() => {
    const s = createBlindSession(bufferA, labelA, bufferB, labelB);
    setSession(s);
    setPhase('listening');
    setVoted(null);
    setResult(null);
  }, [bufferA, bufferB, labelA, labelB]);

  // Play a slot
  const handlePlaySlot = useCallback((slot: 1 | 2) => {
    if (!session) return;
    const buf = session._mapping[`slot${slot}` as 'slot1' | 'slot2'] === 'A' ? bufferA : bufferB;
    if (buf) onPlaySlot(slot, buf);
  }, [session, bufferA, bufferB, onPlaySlot]);

  // Cast vote
  const handleVote = useCallback((choice: 1 | 2) => {
    if (!session) return;
    recordVote(session.id, choice);
    setVoted(choice);
    setPhase('voted');
  }, [session]);

  // Reveal results
  const handleReveal = useCallback(() => {
    if (!session) return;
    const r = resolveResults(session.id);
    setResult(r);
    setPhase('revealed');
  }, [session]);

  // Reset
  const handleReset = useCallback(() => {
    setSession(null);
    setPhase('listening');
    setVoted(null);
    setResult(null);
  }, []);

  if (!session) {
    return (
      <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100">Blind A/B Test</h3>
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-sm text-slate-400">
          Listen to two options without knowing which is which. Vote for the one that sounds better. Then reveal which was A and which was B.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Option A</p>
            <p className="text-sm font-semibold text-slate-200">{labelA}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Option B</p>
            <p className="text-sm font-semibold text-slate-200">{labelB}</p>
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={!bufferA || !bufferB}
          className="w-full px-4 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-semibold text-sm hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start Blind Test
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-100">Blind A/B Test</h3>
        <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300 underline">
          Restart
        </button>
      </div>

      {/* Listen Phase */}
      <AnimatePresence mode="wait">
        {phase !== 'revealed' && (
          <motion.div
            key="listen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <p className="text-sm text-slate-400 text-center">Listen to each option, then vote</p>
            <div className="grid grid-cols-2 gap-4">
              {([1, 2] as const).map(slot => (
                <button
                  key={slot}
                  onClick={() => handlePlaySlot(slot)}
                  disabled={phase !== 'listening' && phase !== 'voted'}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/40 transition-all disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-200">Option {slot}</span>
                </button>
              ))}
            </div>

            {/* Vote buttons */}
            {phase === 'listening' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 text-center uppercase tracking-wider">Which sounds better?</p>
                <div className="grid grid-cols-2 gap-3">
                  {([1, 2] as const).map(slot => (
                    <button
                      key={slot}
                      onClick={() => handleVote(slot)}
                      className="px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold text-sm hover:bg-purple-500/20 transition-colors"
                    >
                      Vote Option {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Post-vote reveal button */}
            {phase === 'voted' && voted && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 text-center"
              >
                <p className="text-sm text-emerald-300">
                  You voted for <strong>Option {voted}</strong>
                </p>
                <button
                  onClick={handleReveal}
                  className="px-6 py-3 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-300 font-bold text-sm hover:bg-orange-500/30 transition-colors"
                >
                  Reveal Results
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Results reveal */}
        {phase === 'revealed' && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Results</p>
              <h4 className="text-xl font-black text-slate-100">
                {result.winner === 'tie' ? 'It\'s a tie!' : `${result.winnerLabel} wins`}
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {([1, 2] as const).map(slot => {
                const votes = slot === 1 ? result.votes1 : result.votes2;
                const slotLabel = slot === 1 ? result.slot1Label : result.slot2Label;
                const isWinner = result.winner !== 'tie' &&
                  ((slot === 1 && result.mapping.slot1 === result.winner) ||
                   (slot === 2 && result.mapping.slot2 === result.winner));
                const userPicked = voted === slot;

                return (
                  <div
                    key={slot}
                    className={`rounded-xl p-4 border text-center ${isWinner
                      ? 'bg-emerald-500/15 border-emerald-500/40'
                      : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                      Option {slot} = {slotLabel}
                    </p>
                    <p className="text-2xl font-black text-slate-100">{votes}</p>
                    <p className="text-xs text-slate-400">vote{votes !== 1 ? 's' : ''}</p>
                    {userPicked && (
                      <span className="mt-2 inline-block px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold uppercase tracking-wider">
                        Your pick
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleReset}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 font-semibold text-sm transition-colors"
            >
              New Test
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BlindTestPanel;
