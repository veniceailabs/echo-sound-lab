import React from 'react';
import { motion } from 'framer-motion';
import { useAIProfile, MasteringCharacter } from '../../hooks/useAIProfile';

const CHARACTERS: Array<{ id: MasteringCharacter; emoji: string; label: string; desc: string }> = [
  { id: 'warm', emoji: 'ðŸ”¥', label: 'Warm', desc: 'Rich bass, forgiving highs' },
  { id: 'bright', emoji: 'âœ¨', label: 'Bright', desc: 'Present highs, clear vocals' },
  { id: 'aggressive', emoji: 'âš¡', label: 'Aggressive', desc: 'Loud, punchy, competitive' },
  { id: 'dynamic', emoji: 'ðŸŽµ', label: 'Dynamic', desc: 'Preserve dynamics, spacious' },
  { id: 'neutral', emoji: 'âš–ï¸', label: 'Neutral', desc: 'Transparent, no coloration' },
];

interface AIProfilePanelProps {
  onTagSelected: (character: MasteringCharacter, lufs: number) => void;
  currentLUFS: number;
  trackName?: string;
}

export const AIProfilePanel: React.FC<AIProfilePanelProps> = ({
  onTagSelected,
  currentLUFS,
  trackName = 'Current Track',
}) => {
  const { profile, addTag, getProfileStrength, getRecommendedCharacter } = useAIProfile();
  const strength = getProfileStrength();
  const recommended = getRecommendedCharacter();

  const handleTagClick = (character: MasteringCharacter) => {
    addTag(character, trackName, currentLUFS);
    onTagSelected(character, currentLUFS);
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h4 className="text-sm font-bold text-slate-100 mb-2">ðŸ§AI Learning Profile</h4>
        <p className="text-xs text-slate-400 mb-4">
          Tag this mastering to teach ESL your style. AI gets better with each track.
        </p>
      </div>

      {/* Profile Strength */}
      {profile && (
        <motion.div className="p-3 rounded-lg bg-blue-500/10 border border-blue-400/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-300">
              Profile Strength:{' '}
              {strength === 'weak'
                ? 'ðŸŒLearning'
                : strength === 'learning'
                  ? 'ðŸŒGrowing'
                  : 'ðŸŒStrong'}
            </p>
            <span className="text-xs text-blue-400 font-mono">{profile.tags.length} tagged</span>
          </div>
          {profile.tags.length > 0 && (
            <>
              <p className="text-xs text-blue-300 mb-1">
                Your preference: <span className="font-bold capitalize">{recommended}</span> at{' '}
                <span className="font-mono">{profile.preferredLUFS.toFixed(1)} LUFS</span>
              </p>
              <div className="w-full h-1.5 bg-blue-900/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-400 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (profile.tags.length / 10) * 100)}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Character Selection */}
      <div className="grid grid-cols-5 gap-2">
        {CHARACTERS.map((char, idx) => (
          <motion.button
            key={char.id}
            onClick={() => handleTagClick(char.id)}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
              recommended === char.id
                ? 'bg-emerald-500/30 border border-emerald-400/50'
                : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            title={char.desc}
          >
            <span className="text-2xl mb-1">{char.emoji}</span>
            <span className="text-xs font-semibold text-slate-300">{char.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Recent Tags */}
      {profile && profile.tags.length > 0 && (
        <motion.div className="space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Recent Tags</p>
          <div className="flex flex-wrap gap-2">
            {profile.tags.slice(0, 5).map((tag, idx) => (
              <motion.div
                key={idx}
                className="px-2 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
              >
                <span className="capitalize font-semibold text-slate-300">{tag.character}</span>
                <span className="text-slate-500 ml-1 font-mono">{tag.lufs.toFixed(1)} dB</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        ðŸ’Tag 3+ tracks with the same character to unlock AI auto-suggestions on future uploads.
      </motion.div>
    </motion.div>
  );
};
