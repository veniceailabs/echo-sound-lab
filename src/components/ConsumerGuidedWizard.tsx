import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ProofPlayer from './ProofPlayer';

type WizardStage = 1 | 2 | 3;

interface ConsumerGuidedWizardProps {
  fileName?: string;
  isProcessing: boolean;
  hasResult: boolean;
  isProMode: boolean;
  onToggleProMode: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onProcessTrack: (vibeSlug: string) => Promise<void> | void;
  onDownload: () => Promise<void> | void;
  onPay: () => void;
}

const VIBE_CARDS = [
  {
    slug: 'diverze_signature',
    title: 'Signature Warmth',
    body: 'Soft edges, fuller body, and a premium late-night finish.',
    accent: 'from-amber-400/20 to-orange-500/10',
    border: 'border-amber-400/30',
  },
  {
    slug: 'punchy_crisp',
    title: 'Punchy & Crisp',
    body: 'Forward drums, clean transients, and a bright modern lift.',
    accent: 'from-cyan-400/20 to-sky-500/10',
    border: 'border-cyan-400/30',
  },
  {
    slug: 'deep_low_end',
    title: 'Deep Low-End',
    body: 'Heavier sub weight, controlled headroom, and a bigger floor.',
    accent: 'from-emerald-400/20 to-teal-500/10',
    border: 'border-emerald-400/30',
  },
] as const;

const PRO_METER_LEVELS = [62, 78, 54, 86, 70, 60];

const AcceptedFormats = () => (
  <div className="flex flex-wrap justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
    <span>WAV</span>
    <span className="text-slate-700">•</span>
    <span>MP3</span>
    <span className="text-slate-700">•</span>
    <span>FLAC</span>
    <span className="text-slate-700">•</span>
    <span>AIFF</span>
  </div>
);

const ConsumerGuidedWizard: React.FC<ConsumerGuidedWizardProps> = ({
  fileName,
  isProcessing,
  hasResult,
  isProMode,
  onToggleProMode,
  onFileUpload,
  onProcessTrack,
  onDownload,
  onPay,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<WizardStage>(1);
  const [selectedVibe, setSelectedVibe] = useState<(typeof VIBE_CARDS)[number]['slug']>(VIBE_CARDS[0].slug);
  const [volume, setVolume] = useState(0);
  const [pan, setPan] = useState(0);
  const [threshold, setThreshold] = useState(-18);

  const selectedCard = useMemo(
    () => VIBE_CARDS.find((card) => card.slug === selectedVibe) ?? VIBE_CARDS[0],
    [selectedVibe],
  );

  useEffect(() => {
    if (hasResult) {
      setStage(3);
      return;
    }
    if (fileName) {
      setStage((current) => (current < 2 ? 2 : current));
      return;
    }
    setStage(1);
  }, [fileName, hasResult]);

  const triggerInputClick = () => {
    inputRef.current?.click();
  };

  const syncDroppedFiles = (files: FileList | File[]) => {
    const input = inputRef.current;
    if (!input || files.length === 0) return;

    const transfer = new DataTransfer();
    Array.from(files)
      .filter((file) => file.type.startsWith('audio/') || /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|ogg|caf)$/i.test(file.name))
      .slice(0, 1)
      .forEach((file) => transfer.items.add(file));

    if (transfer.files.length === 0) return;

    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={onToggleProMode}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
            isProMode
              ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
              : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07] hover:text-white'
          }`}
          aria-pressed={isProMode}
        >
          <span className={`h-2 w-2 rounded-full ${isProMode ? 'bg-cyan-300' : 'bg-slate-500'}`} />
          Pro Mode
        </button>
      </div>

      <div className="space-y-7">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-300/80">Quick Start</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
            Drop. Pick a vibe. Get the proof.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            The default experience stays simple. Advanced controls are one tap away if you need them.
          </p>
        </header>

        {isProMode && (
          <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-cyan-400/15 bg-cyan-400/[0.04] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-200/80">
                  Pro mode
                </p>
                <h4 className="mt-2 text-lg font-semibold text-white">Granular faders and metering</h4>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                {PRO_METER_LEVELS.map((level, index) => (
                  <span
                    key={`${level}-${index}`}
                    className="w-2 rounded-full bg-gradient-to-t from-slate-700 via-cyan-400 to-emerald-300"
                    style={{ height: `${level}px` }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="space-y-2 text-left">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Volume</span>
                  <span>{volume > 0 ? '+' : ''}{volume} dB</span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-full accent-cyan-300"
                />
              </label>
              <label className="space-y-2 text-left">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Pan</span>
                  <span>{pan === 0 ? 'Center' : pan > 0 ? `R ${pan}` : `L ${Math.abs(pan)}`}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={pan}
                  onChange={(event) => setPan(Number(event.target.value))}
                  className="w-full accent-cyan-300"
                />
              </label>
              <label className="space-y-2 text-left">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Threshold</span>
                  <span>{threshold} dB</span>
                </div>
                <input
                  type="range"
                  min={-36}
                  max={0}
                  step={1}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  className="w-full accent-cyan-300"
                />
              </label>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aiff,.aif,.ogg,.caf,.alac"
          className="hidden"
          onChange={onFileUpload}
        />

        <motion.section
          layout
          className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:p-6"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={triggerInputClick}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              syncDroppedFiles(event.dataTransfer.files);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                triggerInputClick();
              }
            }}
            className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 py-10 text-center transition-all sm:min-h-[340px] ${
              fileName
                ? 'border-emerald-400/30 bg-emerald-400/[0.05]'
                : 'border-white/10 bg-black/10 hover:border-cyan-400/30 hover:bg-white/[0.04]'
            }`}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/[0.04] text-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {fileName ? '✓' : '⬆'}
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Drop your mix or stems here.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Drag in one file to start. We will move you forward automatically.
            </p>
            <div className="mt-6">
              <AcceptedFormats />
            </div>
            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  triggerInputClick();
                }}
                className="rounded-full bg-white px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-950 transition-transform hover:scale-[1.01]"
              >
                Choose File
              </button>
              {fileName && (
                <span className="max-w-[240px] truncate rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-200">
                  {fileName}
                </span>
              )}
            </div>
          </div>
        </motion.section>

        <AnimatePresence mode="wait">
          {stage >= 2 && (
            <motion.section
              key="vibe-stage"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28 }}
              className="rounded-[2rem] border border-white/10 bg-black/20 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6"
            >
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Step 2</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                  Choose the vibe.
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Three clear starting points. Pick one and process the track.
                </p>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {VIBE_CARDS.map((card) => {
                  const active = selectedVibe === card.slug;
                  return (
                    <button
                      key={card.slug}
                      type="button"
                      onClick={() => setSelectedVibe(card.slug)}
                      className={`rounded-[1.5rem] border p-5 text-left transition-all ${
                        active
                          ? `${card.border} bg-gradient-to-br ${card.accent} shadow-[0_0_0_1px_rgba(255,255,255,0.04),_0_18px_50px_rgba(0,0,0,0.22)]`
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
                            {card.slug}
                          </p>
                          <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                            {card.title}
                          </h4>
                        </div>
                        {active && (
                          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                        {card.body}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  disabled={!fileName || isProcessing}
                  onClick={() => {
                    setStage(3);
                    void onProcessTrack(selectedVibe);
                  }}
                  className="rounded-full bg-cyan-400 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Process Track
                </button>
                <p className="text-[11px] text-slate-500">
                  Target: {selectedCard.title}
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {stage >= 3 && (
            <motion.section
              key="reveal-stage"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28 }}
              className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,27,0.95),rgba(8,11,19,0.98))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)] sm:p-6"
            >
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Step 3</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                  {hasResult ? 'Reveal the result.' : 'Processing track.'}
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  {hasResult
                    ? 'Compare before and after, then download or continue to checkout.'
                    : 'The proof view is already staged while the pass finishes.'}
                </p>
              </div>

              <div className="mt-6 space-y-5">
                {!hasResult && (
                  <div className="flex items-center justify-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-3 text-sm text-cyan-100">
                    <motion.div
                      className="h-5 w-5 rounded-full border-2 border-cyan-400/25 border-t-cyan-300"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                    />
                    Preparing the proof view
                  </div>
                )}

                <div className={!hasResult ? 'opacity-55 saturate-75' : ''}>
                  <ProofPlayer
                    title="A/B proof player"
                    subtitle="Listen to the before and after proof with a single crossfade handle."
                    previewBadge={selectedCard.title}
                    className="mx-auto max-w-4xl"
                  />
                </div>

                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={!hasResult}
                    onClick={() => void onDownload()}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={onPay}
                    className="rounded-full bg-amber-400 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-950 transition-colors hover:bg-amber-300"
                  >
                    Pay
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default ConsumerGuidedWizard;
