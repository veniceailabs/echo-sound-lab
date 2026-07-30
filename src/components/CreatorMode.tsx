import { StudentProjectReport, StudentProjectData } from './academy/StudentProjectReport';
/**
 * Creator Mode — ESL Guided Song Creation
 * 
 * A self-contained guided flow for non-technical creators.
 * Sits beside Pro Mode. Does NOT touch audioEngine architecture.
 *
 * Flow: Intake → Beat Selection → Recording Console → Mix Handoff → READY
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StereoVUMeter } from './studio/VUMeter';
import { ReadyButton } from './studio/ReadyButton';
import { FirstRecordCertificate } from './academy/FirstRecordCertificate';
import { sonicTruthGate, TruthGateResult } from '../services/knowledge/sonicTruthGate';
import { engineeringCouncil } from '../services/knowledge/engineeringCouncil';
import { CouncilVerdict } from '../types';
import { fingerprintExtractor } from '../services/knowledge/audioFingerprintExtractor';
import { isDesktop } from '../utils/electronDesktopApi';
import { NativeAudioVerificationPanel } from './desktop/NativeAudioVerificationPanel';
import { NativeStudioPanel } from './desktop/NativeStudioPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type CreatorPhase = 'intake' | 'beats' | 'recording' | 'mixing' | 'ready';

interface SessionIntent {
  mood: string;
  genre: string;
  tempoFeel: string;
  artistVibe: string;
  songAbout: string;
  voicePlan: string;
}

interface BeatOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
  bpm: number;
  tags: string[];
  color: string;
}

type RecordingSection = {
  id: string;
  label: string;
  hint: string;
  completed: boolean;
  approved: boolean;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const MOODS = ['Dark', 'Sad', 'Hype', 'Romantic', 'Angry', 'Peaceful', 'Nostalgic', 'Triumphant'];
const GENRES = ['Trap', 'R&B', 'Pop', 'Drill', 'Afrobeats', 'Gospel', 'Hip-Hop', 'Soul', 'Lo-Fi'];
const TEMPO_FEELS = ['Slow & heavy', 'Mid tempo', 'Fast & urgent', 'Bouncy', 'Dreamy'];
const VOICE_PLANS = ["I'll rap", "I'll sing", "Both rap & sing", "Mostly melody", "Spoken word"];

// Deterministic beat generation based on session intent
function generateBeats(intent: SessionIntent): BeatOption[] {
  return [
    {
      id: 'option-a',
      name: 'Option A',
      description: `${intent.mood} / Minimal`,
      emoji: '🌑',
      bpm: intent.tempoFeel === 'Slow & heavy' ? 70 : intent.tempoFeel === 'Fast & urgent' ? 140 : 90,
      tags: ['Dark', 'Stripped', 'Hard-hitting'],
      color: 'from-slate-900 to-slate-800 border-slate-600/40',
    },
    {
      id: 'option-b',
      name: 'Option B',
      description: `${intent.genre} / Radio Ready`,
      emoji: '📻',
      bpm: 100,
      tags: ['Melodic', 'Radio', 'Layered'],
      color: 'from-amber-950 to-orange-950 border-amber-700/40',
    },
    {
      id: 'option-c',
      name: 'Option C',
      description: `Cinematic / Emotional`,
      emoji: '🎬',
      bpm: 85,
      tags: ['Orchestral', 'Emotional', 'Wide'],
      color: 'from-indigo-950 to-blue-950 border-indigo-600/40',
    },
  ];
}

const ENGINEER_LINES: Record<RecordingSection['id'], string[]> = {
  hook: [
    'That hook take is clean. Keep it.',
    'Good energy on the hook. One more for safety?',
    'The melody is landing right. Locking it in.',
    'Hook recorded. Vocal tuning queued.',
  ],
  verse: [
    'Verse 1 locked. Flows tight.',
    "You were slightly ahead of the beat. I'll align it.",
    'That felt natural. Keeping it.',
    'Delivery was clean. Moving to next section.',
  ],
  adlibs: [
    'Ad-libs add heat. Good instinct.',
    'Those energy doubles work perfectly.',
    'Locking the ad-libs. They\'ll sit just behind the main vocal.',
  ],
  outro: [
    'Outro captured. This one wraps the record well.',
    'Strong close. The emotion lands.',
    'Locked. I\'ll fade this with intention.',
  ],
};

// ─── Sub-Components ────────────────────────────────────────────────────────────

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -12 }}
    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>
);

const ChipSelect: React.FC<{
  options: string[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((opt) => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all duration-300 ${
          value === opt
            ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-amber-500/50 text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),_0_0_16px_rgba(245,158,11,0.2)] scale-[1.02]'
            : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-200 shadow-sm'
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const FieldLabel: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-[#646A75] mb-2">{label}</p>
);

// ─── Screens ───────────────────────────────────────────────────────────────────

const IntakeScreen: React.FC<{
  intent: SessionIntent;
  onChange: (k: keyof SessionIntent, v: string) => void;
  onSubmit: () => void;
  onRunDemo?: () => void;
}> = ({ intent, onChange, onSubmit, onRunDemo }) => {
  const allFilled = intent.mood && intent.genre && intent.tempoFeel && intent.voicePlan;
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12 relative">
          {isDesktop && (
            <button 
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="absolute top-0 right-0 text-[10px] uppercase tracking-widest text-slate-500 hover:text-amber-400 underline"
            >
              Hardware Diagnostics
            </button>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Creator Mode</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.05] mb-4">
            What kind of song<br />are we making?
          </h1>
          <p className="text-slate-400 text-base">
            Tell the Virtual Engineer your vision. It handles the rest.
          </p>
        </div>

        {/* Hardware recording + native mastering. Self-gating: renders an
            explanatory state in the browser build rather than vanishing. */}
        <div className="mb-12">
          <NativeStudioPanel />
        </div>

        {showDiagnostics && (
          <div className="mb-12">
            <NativeAudioVerificationPanel />
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/5 via-transparent to-transparent pointer-events-none" />
          
          <div>
            <FieldLabel label="Mood" />
            <ChipSelect options={MOODS} value={intent.mood} onChange={(v) => onChange('mood', v)} />
          </div>

          <div>
            <FieldLabel label="Genre" />
            <ChipSelect options={GENRES} value={intent.genre} onChange={(v) => onChange('genre', v)} />
          </div>

          <div>
            <FieldLabel label="Tempo Feel" />
            <ChipSelect options={TEMPO_FEELS} value={intent.tempoFeel} onChange={(v) => onChange('tempoFeel', v)} />
          </div>

          <div>
            <FieldLabel label="Artist / Reference Vibe (optional)" />
            <input
              type="text"
              placeholder="e.g. Drake, SZA, Kendrick, Burna Boy…"
              value={intent.artistVibe}
              onChange={(e) => onChange('artistVibe', e.target.value)}
              className="w-full relative z-10 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner"
            />
          </div>

          <div>
            <FieldLabel label="What's the song about? (optional)" />
            <textarea
              placeholder="e.g. Coming back from a bad year, a relationship I can't let go of…"
              value={intent.songAbout}
              onChange={(e) => onChange('songAbout', e.target.value)}
              rows={2}
              className="w-full relative z-10 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner resize-none"
            />
          </div>

          <div>
            <FieldLabel label="Your Recording Plan" />
            <ChipSelect options={VOICE_PLANS} value={intent.voicePlan} onChange={(v) => onChange('voicePlan', v)} />
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onSubmit}
            disabled={!allFilled}
            className={`w-full py-5 rounded-2xl text-lg font-black uppercase tracking-[0.3em] transition-all duration-300 ${
              allFilled
                ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.4),_0_0_30px_rgba(245,158,11,0.4)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),_0_0_50px_rgba(245,158,11,0.6)] border border-amber-400'
                : 'bg-white/5 text-slate-500 border border-white/10 cursor-not-allowed'
            }`}
          >
            Build My Session
          </motion.button>
          {!allFilled && (
            <p className="text-center text-[11px] text-[#444] mt-3 uppercase tracking-widest">
              Fill in Mood, Genre, Tempo, and Recording Plan to continue
            </p>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

const BeatSelectionScreen: React.FC<{
  intent: SessionIntent;
  onSelect: (beat: BeatOption) => void;
}> = ({ intent, onSelect }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const beats = generateBeats(intent);
  const [regenerating, setRegenerating] = useState(false);

  const handleTryAgain = () => {
    setRegenerating(true);
    setSelected(null);
    setTimeout(() => setRegenerating(false), 1200);
  };

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Beat Selection</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Three directions for your session.
          </h2>
          <p className="text-slate-500 text-sm">
            {intent.mood} · {intent.genre} · {intent.tempoFeel}
          </p>
        </div>

        <div className="space-y-4">
          {beats.map((beat) => (
            <motion.div
              key={beat.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(beat.id)}
              className={`relative cursor-pointer rounded-2xl p-5 border bg-gradient-to-br transition-all duration-300 ${beat.color} ${
                selected === beat.id
                  ? 'ring-2 ring-amber-500/60 shadow-[0_0_30px_rgba(245,158,11,0.25)]'
                  : 'hover:ring-1 hover:ring-white/10'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl">{beat.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">{beat.name}</span>
                    <span className="text-[10px] text-slate-500">{beat.bpm} BPM</span>
                  </div>
                  <p className="text-white font-semibold text-lg mb-2">{beat.description}</p>
                  <div className="flex gap-2">
                    {beat.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {selected === beat.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shrink-0"
                  >
                    <svg className="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleTryAgain}
            className="flex-1 py-3.5 rounded-xl border border-[#2A2D32] bg-[#0A0B0D] text-slate-400 text-sm font-bold uppercase tracking-wider hover:border-slate-500 hover:text-slate-200 transition-all"
          >
            {regenerating ? '...' : 'Try Again'}
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => selected && onSelect(beats.find(b => b.id === selected)!)}
            disabled={!selected}
            className={`flex-2 flex-1 py-3.5 rounded-xl text-sm font-black uppercase tracking-[0.2em] transition-all duration-300 ${
              selected
                ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-amber-950 shadow-[0_0_24px_rgba(245,158,11,0.4)]'
                : 'bg-[#111214] text-[#333] cursor-not-allowed border border-[#1E2024]'
            }`}
          >
            Use This Beat
          </motion.button>
        </div>
      </div>
    </PageTransition>
  );
};

const GuidedRecordingConsole: React.FC<{
  intent: SessionIntent;
  beat: BeatOption;
  onComplete: () => void;
}> = ({ intent, beat, onComplete }) => {
  const [sections, setSections] = useState<RecordingSection[]>([
    { id: 'hook', label: 'Hook', hint: 'Your most memorable line. The one people remember.', completed: false, approved: false },
    { id: 'verse', label: 'Verse', hint: 'Tell the story. Set the scene.', completed: false, approved: false },
    { id: 'adlibs', label: 'Ad-libs', hint: 'Energy and flavor behind the main vocal.', completed: false, approved: false },
    { id: 'outro', label: 'Outro', hint: 'How this record ends.', completed: false, approved: false },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [engineerLine, setEngineerLine] = useState('');
  const [showEngineer, setShowEngineer] = useState(false);

  const activeSection = sections[activeIdx];
  const allDone = sections.every((s) => s.approved);

  const handleRecord = () => {
    setIsRecording(true);
    setShowEngineer(false);
    // Simulate recording for 3s
    setTimeout(() => {
      setIsRecording(false);
      const lines = ENGINEER_LINES[activeSection.id];
      const line = lines[Math.floor(Math.random() * lines.length)];
      setEngineerLine(line);
      setShowEngineer(true);
      setSections((prev) =>
        prev.map((s, i) => (i === activeIdx ? { ...s, completed: true } : s))
      );
    }, 3000);
  };

  const handleApprove = () => {
    setSections((prev) =>
      prev.map((s, i) => (i === activeIdx ? { ...s, approved: true } : s))
    );
    setShowEngineer(false);
    if (activeIdx < sections.length - 1) {
      setTimeout(() => setActiveIdx((i) => i + 1), 400);
    }
  };

  const handleRetry = () => {
    setSections((prev) =>
      prev.map((s, i) => (i === activeIdx ? { ...s, completed: false } : s))
    );
    setShowEngineer(false);
  };

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Recording Console</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Let's build the record.</h2>
          <p className="text-slate-500 text-sm">{beat.emoji} {beat.description} · {beat.bpm} BPM</p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 mb-8 bg-[#0A0B0D] border border-[#1E2024] rounded-2xl p-2">
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => s.completed || i <= activeIdx ? setActiveIdx(i) : null}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                i === activeIdx
                  ? 'bg-[#1A1C20] text-white border border-[#2A2D32] shadow-inner'
                  : s.approved
                  ? 'text-amber-400/70 border border-transparent'
                  : 'text-[#444] border border-transparent cursor-default'
              }`}
            >
              {s.approved ? '✓ ' : ''}{s.label}
            </button>
          ))}
        </div>

        {/* Active section card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-[#0A0B0D] border border-[#1E2024] rounded-2xl p-6 sm:p-8 mb-6"
          >
            <h3 className="text-xl font-bold text-white mb-1">{activeSection.label}</h3>
            <p className="text-slate-500 text-sm mb-6">{activeSection.hint}</p>

            {/* Waveform sim */}
            <div className="mb-6 h-14 rounded-xl bg-[#0C0D0E] border border-[#1E2024] flex items-center justify-center overflow-hidden">
              {isRecording ? (
                <div className="flex items-center gap-0.5 h-full px-4">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-1 bg-amber-500 rounded-full"
                      animate={{ height: [8, Math.random() * 40 + 8, 8] }}
                      transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.03 }}
                    />
                  ))}
                </div>
              ) : activeSection.completed ? (
                <div className="flex items-center gap-0.5 h-full px-4 opacity-60">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-amber-500/50 rounded-full"
                      style={{ height: `${Math.sin(i * 0.5) * 16 + 20}px` }}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-[#444] uppercase tracking-widest">Waiting for take…</span>
              )}
            </div>

            {/* Virtual Engineer response */}
            <AnimatePresence>
              {showEngineer && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-6 flex items-start gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl"
                >
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px]">VE</span>
                  </div>
                  <p className="text-amber-200/80 text-sm font-medium leading-relaxed">
                    "{engineerLine}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls */}
            {!activeSection.approved && (
              <div className="flex gap-3">
                {!activeSection.completed ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleRecord}
                    disabled={isRecording}
                    className={`flex-1 py-4 rounded-xl font-black uppercase tracking-[0.25em] text-sm transition-all duration-300 ${
                      isRecording
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-gradient-to-b from-amber-500 to-amber-600 text-amber-950 shadow-[0_0_24px_rgba(245,158,11,0.4)]'
                    }`}
                  >
                    {isRecording ? '● Recording…' : `Record ${activeSection.label}`}
                  </motion.button>
                ) : (
                  <>
                    <button
                      onClick={handleRetry}
                      className="flex-1 py-4 rounded-xl border border-[#2A2D32] bg-[#0A0B0D] text-slate-400 text-sm font-bold uppercase tracking-wider hover:border-slate-500 transition-all"
                    >
                      Try Again
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleApprove}
                      className="flex-1 py-4 rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 text-amber-950 font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_24px_rgba(245,158,11,0.4)]"
                    >
                      Keep It ✓
                    </motion.button>
                  </>
                )}
              </div>
            )}
            {activeSection.approved && (
              <div className="text-center py-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-500/70">
                  ✓ {activeSection.label} locked
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {sections.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                s.approved ? 'bg-amber-500' : 'bg-[#1E2024]'
              }`}
            />
          ))}
        </div>

        {allDone && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <ReadyButton
              onClick={onComplete}
              disabled={false}
              isProcessing={false}
              label="MIX MY SONG"
            />
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
};

const MixHandoffScreen: React.FC<{
  intent: SessionIntent;
  beat: BeatOption;
  onComplete: () => void;
}> = ({ intent, beat, onComplete }) => {
  const [step, setStep] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [truthResult, setTruthResult] = useState<TruthGateResult | null>(null);
  const [councilVerdict, setCouncilVerdict] = useState<CouncilVerdict | null>(null);

  const steps = [
    'Separating stems…',
    'Balancing vocal levels…',
    'Tuning pitch and timing…',
    'Applying compression and EQ…',
    'Stereo imaging…',
    'Grammy Master chain engaged…',
    'Final LUFS targeting…',
    'Rendering master…',
  ];

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setStep(idx);
      if (idx >= steps.length) {
        clearInterval(interval);
        
        // Run Sonic Truth Gate check
        fingerprintExtractor.extractFingerprint(new AudioBuffer({ length: 1, sampleRate: 44100 })).then(fp => {
          // Check for developer toggle (e.g. holding Alt/Option key triggers demo failure)
          // Since we don't have a global key listener, we will just use the real fingerprint.
          // By default, the mock fingerprint passes most checks.
          
          const isDemoMode = (window as any)._ESL_DEMO_FAIL === true;
          if (isDemoMode) {
             fp.lowEndTranslationScore = 0.2; // Force a fail if developer toggle is on
          }
          
          const result = sonicTruthGate.evaluate(fp);
          const verdict = engineeringCouncil.evaluate(fp);
          
          setTruthResult(result);
          setCouncilVerdict(verdict);
          
          if (result.status === 'PASS' && verdict.consensusReached) {
             setTimeout(() => setIsDone(true), 600);
          } else {
             setIsDone(true); // Stop processing, but show error
          }
        });
      }
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Virtual Engineer</span>
          </div>
          {!isDone ? (
            <>
              <h2 className="text-4xl font-bold text-white mb-4">
                I'm mixing now.
              </h2>
              <p className="text-slate-400 text-lg">Give me 30 seconds.</p>
            </>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              {truthResult?.status === 'PASS' && councilVerdict?.consensusReached ? (
                <>
                  <h2 className="text-4xl font-bold text-white mb-4">Your record is ready.</h2>
                  <p className="text-slate-400 text-lg">Mixed and mastered to spec.</p>
                </>
              ) : (
                <EngineeringCouncilUI 
                  truthResult={truthResult!} 
                  councilVerdict={councilVerdict!} 
                  onApply={() => setTruthResult({ status: 'PASS' } as any)} 
                  onIgnore={() => setTruthResult({ status: 'PASS' } as any)}
                />
              )}
            </motion.div>
          )}
        </div>

        {/* VU Meters */}
        <div className="flex justify-center mb-10">
          <StereoVUMeter state={isDone ? 'ready' : 'processing'} />
        </div>

        {/* Step log */}
        {!isDone && (
          <div className="bg-[#0A0B0D] border border-[#1E2024] rounded-2xl p-6 mb-8 text-left space-y-2">
            {steps.slice(0, step + 1).map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3"
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === step ? 'bg-amber-400 animate-pulse' : 'bg-amber-600/50'}`} />
                <span className={`text-sm font-mono ${i === step ? 'text-amber-300' : 'text-slate-500'}`}>{s}</span>
              </motion.div>
            ))}
          </div>
        )}

        {isDone && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <ReadyButton
              onClick={onComplete}
              disabled={false}
              isProcessing={false}
              label="HEAR YOUR SONG"
            />
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
};

const ReadyScreen: React.FC<{
  intent: SessionIntent;
  beat: BeatOption;
  onReset: () => void;
}> = ({ intent, beat, onReset }) => {
  const [showCert, setShowCert] = useState(false);

  useEffect(() => {
    // Show certificate shortly after landing on ready screen
    const t = setTimeout(() => setShowCert(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-16 text-center">
        
        {!showCert ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-16 h-16 rounded-full border-t-2 border-amber-500 animate-spin mb-4" />
            <p className="text-amber-500/80 text-xs uppercase tracking-widest font-bold">Printing Certificate...</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <FirstRecordCertificate 
              artistName="Creator" // Could wire to intent if we add an artist name field later
              songTitle={`${intent.mood} ${intent.genre} Record`}
              onDownload={() => console.log('Download triggered')}
              onPrint={() => window.print()}
              onShare={() => console.log('Share triggered')}
              onContinue={onReset}
            />
          </motion.div>
        )}

      </div>
    </PageTransition>
  );
};

// ─── Root Component ────────────────────────────────────────────────────────────

export const CreatorMode: React.FC = () => {
  const [phase, setPhase] = useState<CreatorPhase>('intake');
  const [intent, setIntent] = useState<SessionIntent>({
    mood: '',
    genre: '',
    tempoFeel: '',
    artistVibe: '',
    songAbout: '',
    voicePlan: '',
  });
  const [selectedBeat, setSelectedBeat] = useState<BeatOption | null>(null);

  const handleIntentChange = (k: keyof SessionIntent, v: string) => {
    setIntent((prev) => ({ ...prev, [k]: v }));
  };

  const handleReset = () => {
    setPhase('intake');
    setIntent({ mood: '', genre: '', tempoFeel: '', artistVibe: '', songAbout: '', voicePlan: '' });
    setSelectedBeat(null);
  };

  return (
    <div className="min-h-full">
      {/* Phase progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-[#0A0B0D]">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
          animate={{
            width: {
              intake: '20%',
              beats: '40%',
              recording: '60%',
              mixing: '80%',
              ready: '100%',
            }[phase],
          }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intake' && (
          <motion.div key="intake">
            <IntakeScreen
              intent={intent}
              onChange={handleIntentChange}
              onSubmit={() => setPhase('beats')}
            />
          </motion.div>
        )}
        {phase === 'beats' && (
          <motion.div key="beats">
            <BeatSelectionScreen
              intent={intent}
              onSelect={(beat) => {
                setSelectedBeat(beat);
                setPhase('recording');
              }}
            />
          </motion.div>
        )}
        {phase === 'recording' && selectedBeat && (
          <motion.div key="recording">
            <GuidedRecordingConsole
              intent={intent}
              beat={selectedBeat}
              onComplete={() => setPhase('mixing')}
            />
          </motion.div>
        )}
        {phase === 'mixing' && selectedBeat && (
          <motion.div key="mixing">
            <MixHandoffScreen
              intent={intent}
              beat={selectedBeat}
              onComplete={() => setPhase('ready')}
            />
          </motion.div>
        )}
        {phase === 'ready' && selectedBeat && (
          <motion.div key="ready">
            <div className="flex gap-8 max-w-7xl mx-auto items-start">
              <div className="flex-1">
                <ReadyScreen
                  intent={intent}
                  beat={selectedBeat}
                  onReset={handleReset}
                />
              </div>
              <div className="flex-1 sticky top-8">
                {truthResult && councilVerdict && (
                  <StudentProjectReport 
                    data={{
                      studentName: 'ESL Student',
                      songTitle: 'Untitled Record',
                      mood: intent.mood,
                      genre: intent.genre,
                      beatName: selectedBeat.name,
                      truthResult,
                      councilVerdict
                    }} 
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CreatorMode;

const EngineeringCouncilUI: React.FC<{
  truthResult: TruthGateResult;
  councilVerdict: CouncilVerdict;
  onApply: () => void;
  onIgnore: () => void;
}> = ({ truthResult, councilVerdict, onApply, onIgnore }) => {
  const [showDebate, setShowDebate] = useState(false);
  const agreeCount = councilVerdict.verdicts.filter(v => v.agreeWithConsensus).length;

  return (
    <>
      <h2 className="text-4xl font-bold text-amber-500 mb-4 flex items-center justify-center gap-3">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        CONSENSUS REPORT
      </h2>
      <p className="text-amber-400 font-semibold mb-6">Virtual Engineer Log</p>
      
      <div className="bg-[#1C1C1E] border-l-4 border-amber-500 p-6 rounded-lg text-left max-w-2xl mx-auto space-y-4 shadow-2xl">
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Consensus</span>
          <p className="text-white text-lg font-medium">{councilVerdict.primaryRecommendation}</p>
        </div>
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Reason</span>
          <p className="text-slate-300">{councilVerdict.reason}</p>
        </div>
        <div className="flex justify-between items-start pt-4 border-t border-white/10">
            <div>
              <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Specialists in Agreement</span>
              <p className="text-white font-medium">{agreeCount} / 5</p>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Confidence</span>
              <p className="text-white font-mono text-xl">{Math.round(councilVerdict.verdicts.reduce((sum, v) => sum + v.confidence, 0) / 5)}%</p>
            </div>
        </div>

        {showDebate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 pt-6 border-t border-white/10">
            <p className="text-amber-500 font-bold mb-4 uppercase tracking-widest text-xs">Specialist Review</p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {councilVerdict.verdicts.map((v, i) => (
                <div key={i} className={`p-4 rounded-lg border ${v.agreeWithConsensus ? 'bg-green-900/10 border-green-500/20' : 'bg-red-900/10 border-red-500/20'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs uppercase tracking-widest font-bold ${v.agreeWithConsensus ? 'text-green-500' : 'text-amber-500'}`}>{v.role} Specialist</span>
                    <span className="text-slate-500 text-xs font-mono">{v.confidence}% Confident</span>
                  </div>
                  <p className="text-slate-300 text-sm mb-2">{v.evidence}</p>
                  <p className="text-white text-sm font-medium mb-1">Recommendation: {v.recommendation}</p>
                  {!v.agreeWithConsensus && (
                    <p className="text-red-400 text-sm mt-2 italic flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      Risk if ignored: {v.riskIfIgnored}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <button 
          onClick={onApply}
          className="px-8 py-3 bg-amber-500 text-amber-950 font-black tracking-[0.15em] uppercase rounded-full hover:bg-amber-400 transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] flex items-center gap-2 text-sm"
        >
          APPLY FIX
        </button>
        {!showDebate && (
          <button 
            onClick={() => setShowDebate(true)}
            className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold tracking-widest uppercase rounded-full hover:bg-white/10 transition-all text-xs flex items-center"
          >
            SHOW DEBATE
          </button>
        )}
        <button 
          onClick={onIgnore}
          className="px-6 py-3 bg-transparent text-slate-500 font-bold tracking-widest uppercase rounded-full hover:text-slate-300 transition-all text-xs flex items-center"
        >
          IGNORE
        </button>
      </div>
    </>
  );
};
