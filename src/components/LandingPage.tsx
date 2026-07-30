/**
 * LandingPage - immersive studio front door for Echo Sound Lab.
 * This version emphasizes the command center, workflow clarity, and a more
 * cinematic visual language while preserving the SEO block below the fold.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ProofPlayer from './ProofPlayer';
import { SeoContentSection } from './SeoContentSection';
import { UploadIcon, WaveformIcon, SlidersIcon, SpeakerIcon } from './Icons';
import StudioBrand from './StudioBrand';
import { FEATURE_FLAGS } from '../config/featureFlags';

interface LandingPageProps {
  onEnterApp: () => void;
  onWatchDemo?: () => void;
  onOpenPricing?: () => void;
  onOpenOps?: () => void;
}

const SUBTITLE_CYCLE = [
  'Reference-aware mastering.',
  'Genre-aligned from the first pass.',
  'Validation-first without the guesswork.',
];

const PLATFORM_BADGES = ['Spotify', 'Apple Music', 'YouTube', 'Tidal', 'SoundCloud', 'Broadcast'];

const STATS = [
  {
    value: '8',
    label: 'analysis layers',
    detail: 'Loudness, phase, dynamics, spectral balance, and delivery risk',
  },
  {
    value: '12',
    label: 'export targets',
    detail: 'WAV, MP3, stems, reports, certificates, and shareable proofs',
  },
  {
    value: '4',
    label: 'core passes',
    detail: 'Analyze, correct, shape, and export in one guided flow',
  },
  {
    value: '1',
    label: 'command center',
    detail: 'One place for the entire audio decision tree',
  },
];

const WORKFLOW = [
  {
    step: '01',
    title: 'Load the session',
    body: 'Drop in a mix, stem set, or full album and keep the source intact.',
  },
  {
    step: '02',
    title: 'Read the signal',
    body: 'See the problem map first: balance, loudness, phase, harshness, and headroom.',
  },
  {
    step: '03',
    title: 'Shape with intent',
    body: 'Apply EQ, compression, saturation, and stereo control with clear feedback.',
  },
  {
    step: '04',
    title: 'Deliver cleanly',
    body: 'Export platform-safe masters, A/B proofs, and client-ready deliverables.',
  },
];

const FEATURE_CARDS = [
  {
    title: 'Analysis Core',
    body: 'A dense diagnostic layer that translates audio into actionable work, not vague scores.',
  },
  {
    title: 'Genre Intelligence',
    body: 'Adaptive mastering targets for hip-hop, pop, R&B, indie, rock, and custom reference sets.',
  },
  {
    title: 'Stem Control',
    body: 'Separate, rebalance, and compare stems without leaving the studio shell.',
  },
  {
    title: 'Reference Matching',
    body: 'Match spectral shape, loudness, and contrast against a chosen commercial benchmark.',
  },
  {
    title: 'Batch Delivery',
    body: 'Move multiple tracks through the same session logic for consistent releases.',
  },
  {
    title: 'Proof Sharing',
    body: 'Generate client-friendly previews, reports, and A/B assets without extra assembly.',
  },
];

const DELIVERY_TARGETS = [
  { label: 'Spotify', value: '-14 LUFS' },
  { label: 'Apple Music', value: '-16 LUFS' },
  { label: 'YouTube', value: '-14 LUFS' },
  { label: 'Tidal', value: '-14 LUFS' },
  { label: 'SoundCloud', value: '-11 LUFS' },
  { label: 'Custom', value: 'Reference-match' },
];

const ENGINEER_PROFILES = [
  {
    name: 'Warm & Intimate',
    slug: 'navy_blue_underground',
    Icon: WaveformIcon,
    detail: 'Closer vocal, softer top, warmer body.',
  },
  {
    name: 'Punchy & Crisp',
    slug: 'mixed_by_ali_crisp',
    Icon: SlidersIcon,
    detail: 'Tighter transients, brighter lead, more snap.',
  },
  {
    name: 'Deep & Heavy',
    slug: '40_toronto_depth',
    Icon: SpeakerIcon,
    detail: 'Weighty low-end, darker bed, isolated vocal.',
  },
];

const SHIMMER_CSS = `
@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes floatSlow {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -18px, 0); }
}

.esl-shimmer-text {
  background: linear-gradient(90deg, #e2e8f0, #f59e0b, #cbd5e1, #64748b);
  background-size: 240% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradientShift 5s ease infinite;
}

.esl-studio-glow {
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.08), 0 28px 80px rgba(0, 0, 0, 0.32);
}

.esl-float {
  animation: floatSlow 8s ease-in-out infinite;
}
`;

function MeterBars() {
  const bars = [42, 66, 78, 58, 92, 74, 88, 56, 80, 62, 90, 72];
  return (
    <div className="flex h-24 items-end gap-1">
      {bars.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className="w-2 origin-bottom rounded-full bg-gradient-to-t from-slate-700 via-orange-400 to-amber-200"
          animate={{ scaleY: [0.72, 1, 0.84, 0.98] }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.07,
          }}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

const LandingPage: React.FC<LandingPageProps> = ({
  onEnterApp,
  onWatchDemo,
  onOpenPricing,
  onOpenOps,
}) => {
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goToApp = () => {
    onEnterApp();
  };

  const goToAdvancedStudio = () => {
    try {
      window.localStorage.setItem('echo.engineMode.v1', 'ADVANCED');
    } catch {
      // If storage is unavailable, fall back to the default entry flow.
    }
    if (typeof window !== 'undefined') {
      window.location.assign('/app?mode=advanced');
      return;
    }
    onEnterApp();
  };

  const goToPricing = () => {
    if (onOpenPricing) {
      onOpenPricing();
    } else {
      onEnterApp();
    }
  };

  const goToOps = () => {
    if (onOpenOps) {
      onOpenOps();
    } else {
      onEnterApp();
    }
  };

  const showInternalOps = FEATURE_FLAGS.SHOW_INTERNAL_OPS_SURFACES && Boolean(onOpenOps);
  const showBetaStudioEntry = FEATURE_FLAGS.SHOW_BETA_STUDIO_SURFACES;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSubtitleIndex((current) => (current + 1) % SUBTITLE_CYCLE.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = ambientCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let dpr = 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const isPhone = window.innerWidth < 640;
    const orbCount = isPhone ? 14 : 24;
    const orbPalette = [18, 22, 26, 28, 34];
    const orbs = Array.from({ length: orbCount }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
      radius: 0.06 + Math.random() * 0.16,
      hue: orbPalette[Math.floor(Math.random() * orbPalette.length)],
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.8,
    }));

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < -0.05 || orb.x > 1.05) orb.vx *= -1;
        if (orb.y < -0.05 || orb.y > 1.05) orb.vy *= -1;

        const px = orb.x * width;
        const py = orb.y * height;
        const radius = orb.radius * Math.min(width, height);
        const opacity = 0.03 + 0.05 * Math.sin(now * 0.001 * orb.speed + orb.phase);

        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        grad.addColorStop(0, `hsla(${orb.hue}, 85%, 62%, ${opacity})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();
    raf = window.requestAnimationFrame(draw);
    window.addEventListener('resize', resize, { passive: true });

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleFiles = (files: FileList | File[]) => {
    const names = Array.from(files).map((file) => file.name);
    setDroppedFiles(names);
    try {
      window.sessionStorage.setItem('esl:landing-upload-names', JSON.stringify(names));
    } catch {}
    onEnterApp();
  };

  return (
  <div className="relative min-h-screen overflow-hidden bg-[#02040a] text-slate-100">
      <style>{SHIMMER_CSS}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.14),_transparent_26%),radial-gradient(circle_at_78%_20%,_rgba(245,158,11,0.035),_transparent_24%),radial-gradient(circle_at_16%_82%,_rgba(148,163,184,0.05),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.78),_rgba(2,4,10,1))]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
          }}
        />
        <canvas
          ref={ambientCanvasRef}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        />
      </div>

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pt-6 lg:px-8">
          <StudioBrand />

          <div className="hidden items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-400 md:flex">
            <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-slate-200">
              Free to use
            </span>
            <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-slate-200">
              Live diagnostics
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              Local-first workflow
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPricing && (
            <button
              type="button"
              onClick={goToPricing}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-amber-400/30 hover:bg-white/10"
            >
              Pricing
            </button>
            )}
            {showInternalOps && (
              <button
                type="button"
                onClick={goToOps}
                className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-500/15"
              >
                Product Ops
              </button>
            )}
            <button
              type="button"
              onClick={goToApp}
              className="rounded-full border border-orange-400/28 bg-orange-500/8 px-5 py-2.5 text-sm font-semibold text-orange-100 shadow-[0_0_28px_rgba(249,115,22,0.10)] transition hover:border-orange-300/35 hover:bg-orange-500/14"
            >
              Open studio
            </button>
            {showBetaStudioEntry && (
              <button
                type="button"
                onClick={goToAdvancedStudio}
                className="rounded-full border border-cyan-400/22 bg-cyan-500/10 px-5 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.08)] transition hover:border-cyan-300/35 hover:bg-cyan-500/15"
              >
                Advanced Studio [BETA]
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 pb-16 pt-6 lg:px-8">
          <section className="grid items-start gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="space-y-6"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.32em] text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_14px_rgba(251,146,60,0.65)]" />
                  Release engineering for recorded music
                </div>

                <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Turn raw audio into a{' '}
                  <span className="esl-shimmer-text">validated master</span>
                  .
                </h1>

                <div className="min-h-[3.75rem]">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={subtitleIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.32 }}
                      className="max-w-2xl text-xl leading-relaxed text-slate-300 sm:text-2xl"
                    >
                      {SUBTITLE_CYCLE[subtitleIndex]}
                    </motion.p>
                  </AnimatePresence>
                </div>

                <p className="max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
                  Echo Sound Lab turns mastering into a guided control room: diagnose the
                  mix, sculpt the tone, validate the result, and export deliverables that
                  are still in pre-market validation.
                </p>
                <p className="max-w-2xl text-sm uppercase tracking-[0.24em] text-slate-400">
                  Free to use. No account required. Share the proof when the result earns it.
                </p>

                <div
                  className="rounded-[2rem] border border-slate-700/55 bg-slate-950/55 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-5"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer.files.length > 0) {
                      handleFiles(event.dataTransfer.files);
                    }
                  }}
                >
                  <div className="rounded-[1.5rem] border border-dashed border-orange-400/14 bg-[linear-gradient(180deg,rgba(10,14,24,0.98),rgba(6,8,16,0.99))] p-6 sm:p-8">
                    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-orange-400/18 bg-orange-400/8 text-orange-200 shadow-[0_0_28px_rgba(249,115,22,0.10)]">
                        <UploadIcon className="h-8 w-8" />
                      </div>
                      <h2 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                        Drop your mix or stems here.
                      </h2>
                      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
                        Get a validation pass in seconds, then decide whether you want the full export or just the proof.
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {['WAV', 'MP3', 'FLAC', 'AIFF', 'Stems'].map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-2xl border border-orange-400/28 bg-orange-500/8 px-6 py-3 text-sm font-semibold text-orange-100 shadow-[0_0_24px_rgba(249,115,22,0.10)] transition hover:border-orange-300/35 hover:bg-orange-500/14"
                        >
                          Choose files
                        </button>
                      <button
                        type="button"
                        onClick={goToApp}
                        className="rounded-2xl border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-orange-400/24 hover:bg-white/10"
                      >
                        Open studio
                      </button>
                    </div>
                      {droppedFiles.length > 0 && (
                        <p className="mt-4 text-xs text-orange-200/75">
                          Ready: {droppedFiles.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="audio/*"
                    multiple
                    onChange={(event) => {
                      if (event.target.files && event.target.files.length > 0) {
                        handleFiles(event.target.files);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={goToApp}
                  className="rounded-2xl border border-orange-400/28 bg-orange-500/8 px-6 py-3.5 text-sm font-semibold text-orange-100 shadow-[0_0_30px_rgba(249,115,22,0.10)] transition hover:border-orange-300/35 hover:bg-orange-500/14"
                >
                  Enter the command center
                </button>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
              className="relative space-y-4"
            >
              <div className="absolute -inset-4 rounded-[2rem] bg-orange-500/10 blur-3xl" />
              <ProofPlayer
                className="esl-float relative"
                subtitle="Open the studio to render a real before/after proof from your own session."
              />
            <div className="rounded-[1.6rem] border border-slate-700/55 bg-slate-950/72 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                      Studio summary
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Balanced for diagnosis, proof, and delivery without extra surface clutter.
                    </p>
                  </div>
                  <MeterBars />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PLATFORM_BADGES.slice(0, 4).map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </section>

          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setShowAdvancedControls((value) => !value)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 transition hover:border-orange-300/30 hover:bg-white/10"
            >
              Advanced Controls {showAdvancedControls ? 'ON' : 'OFF'}
            </button>
          </div>

          {showAdvancedControls && (
            <>
          <section className="mt-20">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
                  Extra controls
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  The deeper workspace stays out of the way until you ask for it.
                </h2>
              </div>
              <p className="hidden max-w-xl text-sm leading-7 text-slate-400 md:block">
                These sections are still available, but they no longer crowd the main landing path.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[1.4rem] border border-white/10 bg-slate-950/65 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.2)]"
                >
                  <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-3xl font-black tracking-tight text-white">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-400">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {ENGINEER_PROFILES.map((profile) => (
                <button
                  type="button"
                  key={profile.slug}
                  onClick={goToApp}
                  className="group rounded-3xl border border-white/10 bg-slate-950/50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between">
                    <profile.Icon className="h-5 w-5 text-slate-300" />
                    <span className="text-[9px] uppercase tracking-[0.28em] text-slate-500">
                      Profile
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white">{profile.name}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-400">{profile.detail}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-20">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
                  Workflow
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  One flow from upload to release.
                </h2>
              </div>
              <p className="hidden max-w-xl text-sm leading-7 text-slate-400 md:block">
                The interface is designed to reduce cognitive load. Each stage tells you what
                matters next and why the result changed.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {WORKFLOW.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5"
              >
                <p className="text-[10px] uppercase tracking-[0.32em] text-orange-300/80">
                  {item.step}
                </p>
                  <h3 className="mt-4 text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{item.body}</p>
              </motion.div>
            ))}
          </div>
          </section>

          <section className="mt-20 grid gap-4 lg:grid-cols-3">
            {FEATURE_CARDS.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.body}</p>
              </motion.div>
            ))}
          </section>

          <section className="mt-20 rounded-[2rem] border border-slate-700/50 bg-gradient-to-br from-slate-900/80 to-slate-950/95 p-6 shadow-[0_35px_90px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
                  Delivery matrix
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Targets, exports, and proofs that already know their destination.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
                  Deliver the same project in multiple forms without rebuilding the session logic
                  every time a client changes the ask.
                </p>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-3 lg:max-w-2xl xl:grid-cols-3">
                {DELIVERY_TARGETS.map((target) => (
                  <div
                    key={target.label}
                    className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-4"
                  >
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {target.label}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">{target.value}</p>
                  </div>
                ))}
              </div>
            </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/8 pt-6">
              {PLATFORM_BADGES.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300"
                >
                  {badge}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-20 rounded-[2rem] border border-slate-700/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.95))] p-6 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">
                  Start here
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  The app opens with the landing page now.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
                  New visitors get the guided studio front door. Returning users can jump straight
                  back into the workstation at any time.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goToApp}
                  className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  Open studio
                </button>
                {showBetaStudioEntry && (
                  <button
                    type="button"
                    onClick={goToAdvancedStudio}
                    className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-6 py-3.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/15"
                  >
                    Advanced Studio [BETA]
                  </button>
                )}
                {onOpenPricing && (
                  <button
                    type="button"
                    onClick={goToPricing}
                    className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-orange-300/30 hover:bg-white/10"
                  >
                    Review plans
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="mt-10">
            <SeoContentSection />
          </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
