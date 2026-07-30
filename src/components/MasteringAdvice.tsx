import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { analyzeAgainstGenre, getGenreOptions } from '../services/genreReferenceEngine';

interface MasteringAdviceProps {
  lufs: number;
  defaultGenre?: string;
}

export const MasteringAdvice: React.FC<MasteringAdviceProps> = ({ lufs, defaultGenre = 'Pop' }) => {
  const [selectedGenre, setSelectedGenre] = useState(defaultGenre);
  const advice = analyzeAgainstGenre(lufs, selectedGenre);
  const genres = getGenreOptions();

  const getPercentileColor = (percentile: number) => {
    if (percentile >= 75) return 'text-red-400';
    if (percentile >= 50) return 'text-cyan-400';
    if (percentile >= 25) return 'text-emerald-400';
    return 'text-orange-400';
  };

  const getPercentileLabel = (percentile: number) => {
    if (percentile >= 75) return 'ðŸ”Loud';
    if (percentile >= 50) return 'ðŸ“Balanced';
    if (percentile >= 25) return 'ðŸŽšï¸Conservative';
    return 'ðŸ”Quiet';
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <div>
        <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-3">AI Mastering Advice</h4>
        <p className="text-xs text-slate-500 mb-3">Compare your loudness against industry reference tracks:</p>
      </div>

      {/* Genre selector */}
      <div className="flex flex-wrap gap-2">
        {genres.map(genre => (
          <motion.button
            key={genre}
            onClick={() => setSelectedGenre(genre)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              selectedGenre === genre
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {genre}
          </motion.button>
        ))}
      </div>

      {/* Percentile visualization */}
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        key={selectedGenre}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Loudness Percentile</p>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${getPercentileColor(advice.loudnessPercentile)}`}>
              {advice.loudnessPercentile}th percentile
            </span>
            <span className="text-sm">{getPercentileLabel(advice.loudnessPercentile)}</span>
          </div>
        </div>

        {/* Percentile bar */}
        <div className="relative w-full h-6 bg-slate-900/60 rounded-full overflow-hidden border border-slate-700/50">
          {/* Reference zones */}
          <div className="absolute inset-0 flex">
            <div className="w-1/4 bg-emerald-500/10" />
            <div className="w-1/2 bg-cyan-500/10" />
            <div className="w-1/4 bg-red-500/10" />
          </div>

          {/* Current position */}
          <motion.div
            className={`absolute top-0 h-full w-1 bg-gradient-to-b ${
              advice.loudnessPercentile >= 75
                ? 'from-red-400 to-red-500'
                : advice.loudnessPercentile >= 50
                  ? 'from-cyan-400 to-cyan-500'
                  : 'from-emerald-400 to-emerald-500'
            }`}
            initial={{ left: '0%' }}
            animate={{ left: `${advice.loudnessPercentile}%` }}
            transition={{ duration: 0.6 }}
          />

          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-slate-600">
            <span>Quiet</span>
            <span>Avg</span>
            <span>Loud</span>
          </div>
        </div>

        {/* Range info */}
        <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
          <div className="text-center">
            <p className="text-slate-600">Min ({advice.targetRange.min.toFixed(1)} dB)</p>
            <p className="text-emerald-400/70 font-mono">{Math.round((advice.targetRange.min / -14) * 100)}% quiet</p>
          </div>
          <div className="text-center">
            <p className="text-slate-600">Your Track</p>
            <p className="text-cyan-400 font-mono font-bold">{lufs.toFixed(1)} dB</p>
          </div>
          <div className="text-center">
            <p className="text-slate-600">Max ({advice.targetRange.max.toFixed(1)} dB)</p>
            <p className="text-red-400/70 font-mono">{Math.round((advice.targetRange.max / -14) * 100)}% loud</p>
          </div>
        </div>
      </motion.div>

      {/* Recommendation */}
      <motion.div
        className={`p-3 rounded-lg border ${
          advice.isOptimal
            ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
            : 'bg-blue-500/10 border-blue-400/30 text-blue-300'
        }`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <p className="text-xs leading-relaxed">
          {advice.isOptimal ? 'âœ' : 'ðŸ’'}
          {advice.recommendation}
        </p>
      </motion.div>

      {/* Adjustment suggestion */}
      {advice.needsAdjustment && (
        <motion.div
          className="p-3 rounded-lg bg-orange-500/10 border border-orange-400/30 text-orange-300 text-xs"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <p className="font-semibold mb-1">ðŸ’Suggestion:</p>
          {advice.adjustment === 'loud' && (
            <p>Your track is quieter than the genre average. Consider adding +0.5 to +1.5 dB for competitive loudness.</p>
          )}
          {advice.adjustment === 'quiet' && (
            <p>Your track is louder than the genre average. Consider reducing by -0.5 to -1.0 dB to preserve headroom.</p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};
