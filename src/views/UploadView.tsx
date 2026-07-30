import React from 'react';
import { motion } from 'framer-motion';

interface UploadViewProps {
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  t: (key: string) => string;
  addNextUploadToAlbum: boolean;
  onToggleAddNextUpload: () => void;
}

export const UploadView: React.FC<UploadViewProps> = ({
  onFileUpload,
  t,
  addNextUploadToAlbum,
  onToggleAddNextUpload,
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="mt-10 sm:mt-20 w-full max-w-4xl"
    >
      <section className="mb-12 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-[-0.04em] text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 leading-[1.05] pb-2"
        >
          Mixes that think. Masters that feel.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mt-4 text-base md:text-lg text-slate-400 font-medium"
        >
          Engineered with measurable human intent.
        </motion.p>
        <div className="mt-7 flex items-center justify-center gap-3 md:gap-4 text-[11px] md:text-xs uppercase tracking-[0.22em] text-slate-500">
          <span>Analyze your track.</span>
          <span className="text-slate-700">•</span>
          <span>See the delta.</span>
          <span className="text-slate-700">•</span>
          <span>Master with intent.</span>
        </div>
      </section>
      <label
        id="studio-upload-card"
        data-testid="studio-upload-card"
        className="relative cursor-pointer group block"
        title="Drop a WAV, folder, or stems set to begin mastering."
      >
        {/* Deep Glass Card */}
        <motion.div 
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="relative bg-gradient-to-br from-[#1c1f26]/80 to-[#0a0c10]/90 backdrop-blur-[40px] rounded-[2.5rem] p-8 sm:p-12 md:p-20 border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] group-hover:border-orange-500/40 group-hover:shadow-[0_40px_100px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15),0_0_80px_rgba(249,115,22,0.15)] transition-colors duration-500 overflow-hidden"
        >
          {/* Subtle internal glow behind content */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <div className="relative z-10 text-center">
            {/* Icon */}
            <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-8 rounded-[1.75rem] bg-[#1a1c22]/80 backdrop-blur-xl border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)] flex items-center justify-center group-hover:shadow-[0_12px_40px_rgba(249,115,22,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] group-hover:border-orange-500/50 group-active:translate-y-[2px] transition-all duration-300">
              <svg
                className="w-8 h-8 sm:w-10 sm:h-10 text-orange-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
              <span data-tour-target="studio-upload-title" className="inline-block">
                {t('upload.title') || 'Upload Audio'}
              </span>
            </h2>
            <p className="text-sm text-white/40 font-medium">{t('upload.description') || 'Drop files here'}</p>

            {/* Supported formats */}
            <div className="mt-8 flex gap-2 justify-center flex-wrap">
              {['WAV', 'MP3', 'FLAC', 'AIFF'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[11px] px-3 py-1.5 bg-white/[0.04] rounded-xl text-white/40 border border-white/[0.08] hover:border-orange-500/30 hover:text-orange-300 transition-all duration-300 cursor-default font-medium tracking-wide shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
        <input
          data-testid="single-upload-input"
          type="file"
          multiple
          onChange={onFileUpload}
          className="hidden"
          accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.flac,.aiff,.aif,.ogg,.caf,.alac,.json,.esl-session.json,.esl-recovery.json"
        />
      </label>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="mt-6 flex items-center justify-center"
      >
        <button
          type="button"
          onClick={onToggleAddNextUpload}
          className={`inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${
            addNextUploadToAlbum
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              : 'border-white/10 bg-white/5 text-slate-400 hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-300 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]'
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] ${
              addNextUploadToAlbum ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-slate-500'
            }`}
          />
          Add This Upload To Album
        </button>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="mt-8 flex justify-center"
      >
        <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-semibold">Powered by IntentCore™</p>
      </motion.div>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          { step: '01', title: 'Analyze', desc: 'Read loudness, dynamics, spectral balance, and transient behavior in seconds.', color: 'orange', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
          { step: '02', title: 'Feel the AI Boost', desc: 'See your Match Score and the extra magic the engine can safely add.', color: 'cyan', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /> },
          { step: '03', title: 'Deliver', desc: 'Export a studio-grade master that translates perfectly everywhere.', color: 'emerald', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> }
        ].map((item, i) => (
          <motion.article
            key={item.step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + (i * 0.1), duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-[1.5rem] border border-white/[0.04] bg-gradient-to-b from-[#1a1c23]/60 to-[#12141a]/60 backdrop-blur-2xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:border-white/10 hover:shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all duration-500 relative overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${item.color}-500/5 rounded-full blur-[40px] group-hover:bg-${item.color}-500/10 transition-colors duration-500`} />
            <div className={`w-10 h-10 rounded-[0.85rem] bg-${item.color}-500/10 border border-${item.color}-500/20 flex items-center justify-center mb-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] group-hover:bg-${item.color}-500/20 group-hover:scale-110 transition-all duration-300`}>
              <svg className={`w-5 h-5 text-${item.color}-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {item.icon}
              </svg>
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold">Step {item.step}</p>
            <h3 className="mt-2 text-base font-bold text-slate-100 tracking-tight">{item.title}</h3>
            <p className="mt-2 text-[13px] text-white/40 leading-relaxed font-medium">
              {item.desc}
            </p>
          </motion.article>
        ))}
      </section>
    </motion.div>
  );
};
