/**
 * SeoContentSection — Evergreen SEO content block rendered below the hero.
 *
 * Strategy:
 * - Targets long-tail queries: "free online mastering", "LUFS for Spotify", etc.
 * - Structured with H2/H3 headings, FAQ pairs, and platform comparison table.
 * - All text is crawlable (not hidden behind JS guards).
 * - Renders as a subtle dark section so it fits the visual language without
 *   cluttering the app experience.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FAQS = [
  {
    q: 'What LUFS should I target for Spotify?',
    a: 'Spotify normalizes playback to -14 LUFS integrated. If your track is louder, Spotify turns it down. Echo Sound Lab targets -14 LUFS by default, so your master plays at its intended loudness without Spotify penalizing it.',
  },
  {
    q: 'What is true-peak limiting and why does it matter?',
    a: 'True-peak (TP) measures inter-sample peaks — spikes that appear between digital samples during DAC conversion and MP3 encoding. Spotify, Apple Music, and YouTube all reject files that clip above -1 dBTP. Echo Sound Lab uses 4× oversampled Catmull-Rom interpolation to catch and limit every true-peak before export.',
  },
  {
    q: 'Does mastering in a browser sound as good as a studio?',
    a: 'Echo Sound Lab implements the same signal chain used in professional studios: ITU-R BS.1770-4 K-weighted LUFS metering, Linkwitz-Riley 4th-order multiband crossovers, parallel glue compression, M/S stereo widening, and HP-shaped TPDF dither. The results are bit-for-bit identical to offline processing.',
  },
  {
    q: 'Is stem separation free?',
    a: 'Yes. Echo Sound Lab includes a built-in stem splitter that separates any track into four stems: Vocals, Bass, Drums, and Other instruments. It uses HPSS (Harmonic-Percussive Source Separation) — a frequency-domain masking technique — running entirely in your browser. Each stem downloads as a clean WAV at the original sample rate.',
  },
  {
    q: 'What is tape saturation and does Echo Sound Lab have it?',
    a: 'Tape saturation emulates the way magnetic tape compresses and colors audio — adding warmth, harmonic richness, and a subtle HF rolloff that makes digital recordings feel more analog. Echo Sound Lab\'s tape saturation uses a Langevin sigmoid transfer function for the drive curve, Chebyshev polynomial synthesis for 2nd and 3rd harmonics, head-bump peaking at 80Hz, and optional wow-and-flutter LFO simulation. Six presets from Subtle Warmth to Full Hot Tape.',
  },
  {
    q: 'What is a sidechain compressor and when do I need one?',
    a: 'A sidechain compressor uses a separate trigger signal (the "sidechain") to control the gain reduction on your main audio. Common uses: music ducking under voiceover in radio/podcast production, kick-drum-triggered bass pumping in EDM, and rhythmic tremolo effects. Echo Sound Lab\'s sidechain compressor supports an external trigger file, RMS detection, lookahead (up to 10ms), soft-knee gain computation, and presets like EDM Pump, Radio Duck, and Kick-Bass Glue.',
  },
  {
    q: 'What is the difference between RMS and LUFS?',
    a: 'RMS (Root Mean Square) is a simple power average. LUFS (Loudness Units Full Scale) is frequency-weighted using the ITU-R BS.1770-4 standard — it models human hearing by boosting mids and cutting bass before measuring. LUFS is the industry standard for streaming platform compliance.',
  },
  {
    q: 'Can I master a whole album at once?',
    a: 'Yes. Echo Sound Lab\'s Album Studio mode lets you load multiple tracks, apply consistent mastering settings across all of them, adjust track order and spacing, and export every track in one click via Batch Export.',
  },
];

const PLATFORM_TARGETS = [
  { name: 'Spotify',      lufs: '-14', tp: '-1', loudness: 'Normalization on by default' },
  { name: 'Apple Music',  lufs: '-16', tp: '-1', loudness: 'Sound Check optional' },
  { name: 'YouTube',      lufs: '-14', tp: '-1', loudness: 'Loudness normalization always on' },
  { name: 'Tidal',        lufs: '-14', tp: '-1', loudness: 'MQA lossless streaming' },
  { name: 'SoundCloud',   lufs: '-11', tp: '-1', loudness: 'Clip warning above -1 dBTP' },
  { name: 'Amazon Music', lufs: '-14', tp: '-2', loudness: 'Normalization on HD/Ultra HD' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Upload any audio file',
    body: 'WAV, MP3, FLAC, AIFF, or OGG. Files are decoded locally — nothing is uploaded to a server.',
  },
  {
    step: '02',
    title: 'AI analyzes your track',
    body: 'Genre detection, LUFS metering, dynamic range analysis, and spectral balance comparison run automatically.',
  },
  {
    step: '03',
    title: '12-stage mastering chain runs',
    body: 'High-pass filter → parallel compression → genre-adaptive EQ → dynamic EQ → harmonic saturation → M/S widening → LUFS targeting → true-peak limiter (4× Catmull-Rom oversampled) → psychoacoustic enhancement → genre-adaptive M/S dynamic EQ → TPDF dither → safety clip.',
  },
  {
    step: '04',
    title: 'Download stream-ready master',
    body: 'Export as 16-bit WAV, 32-bit float WAV, or 320 kbps MP3. Instantly platform-compliant.',
  },
];

function FaqItem({ q, a, key }: { q: string; a: string; key?: React.Key }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
        aria-expanded={open}
      >
        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{q}</span>
        <span className="flex-shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors text-lg leading-none">
          {open ? '−' : '+'}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm text-slate-500 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const SeoContentSection: React.FC = () => {
  return (
    <section
      className="w-full bg-slate-950/80 border-t border-white/[0.05] py-20 px-4"
      aria-label="About Echo Sound Lab — Free Online Mixing and Mastering Studio"
    >
      <div className="max-w-4xl mx-auto space-y-20">

        {/* How It Works */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">How the Studio Works</h2>
          <p className="text-slate-500 text-sm mb-10">Professional mixing and mastering in your browser — no plugins, no account, no upload.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <div key={step} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-2">
                <span className="text-xs font-mono text-cyan-600 tracking-widest">{step}</span>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Platform LUFS Targets Table */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Streaming Platform Loudness Targets</h2>
          <p className="text-slate-500 text-sm mb-8">
            Each platform normalizes playback loudness. Master to their targets so your track sounds exactly as intended.
          </p>
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Platform</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Target LUFS</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">True Peak</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORM_TARGETS.map(({ name, lufs, tp, loudness }) => (
                  <tr key={name} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{name}</td>
                    <td className="px-4 py-3 font-mono text-cyan-400">{lufs} LUFS</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{tp} dBTP</td>
                    <td className="px-4 py-3 text-slate-600 text-xs hidden sm:table-cell">{loudness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-700 mt-3">
            Echo Sound Lab presets automatically hit the correct LUFS and true-peak ceiling for each platform.
          </p>
        </div>

        {/* Features Deep-Dive */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Professional Tools, Free in Your Browser</h2>
          <p className="text-slate-500 text-sm mb-8">
            Echo Sound Lab ships a full studio chain — every tool a mastering engineer reaches for, reimplemented in real-time Web Audio.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {[
              ['LUFS Metering', 'ITU-R BS.1770-4 K-weighted measurement with absolute and relative gating. Loudness Range (LRA) via 3-second short-term blocks.'],
              ['True-Peak Limiting', '4× oversampled Catmull-Rom interpolation catches inter-sample peaks. Ceiling at -1 or -0.5 dBTP.'],
              ['Genre-Adaptive EQ', 'Bass boost, air shelf, and mid-cut magnitudes tuned per genre. 9 curves: Hip-Hop, Trap, Pop, R&B, Rock, EDM, Jazz, Classical, Lo-Fi.'],
              ['Dynamic EQ', 'Sidechain-triggered band-pass de-muddying (250–500 Hz) and de-harshening (3k–6k Hz). Proportional gain only — never boosts.'],
              ['Multiband Compression', 'Linkwitz-Riley 4th-order crossovers (cascaded 2nd-order Butterworth) for flat summed response. 3-band with independent ratio/attack/release.'],
              ['M/S Stereo Imaging', 'Mid/side encode → independent processing → decode. Width control, mono-compatible low end below 200 Hz.'],
              ['Vocal Pitch Analysis', 'YIN-inspired CMND autocorrelation with parabolic sub-sample refinement. Note histogram, CSV export.'],
              ['Spectral Balance', '7-band octave analysis vs genre target curves. EQ suggestion engine with dB estimates.'],
              ['Harmonic Exciter', 'Soft-clip warmth (even harmonics) on low band. Hard-clip air (odd harmonics) on high band. Transfer curve preview.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1.5">
                <h3 className="text-white font-semibold">{title}</h3>
                <p className="text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Frequently Asked Questions</h2>
          <p className="text-slate-500 text-sm mb-8">Everything you need to know about online audio mastering.</p>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 divide-y divide-white/[0.04]">
            {FAQS.map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center py-8 space-y-3">
          <h2 className="text-xl font-bold text-white">Ready to master your track?</h2>
          <p className="text-slate-500 text-sm">Free. Instant. No account required. Works in Chrome, Firefox, Safari, and Edge.</p>
        </div>

      </div>
    </section>
  );
};
