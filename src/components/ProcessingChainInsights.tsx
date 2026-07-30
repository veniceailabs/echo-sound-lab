import React from 'react';
import { motion } from 'framer-motion';

interface ProcessingStage {
  name: string;
  icon: string;
  lufsChange: number; // dB change
  peakChange: number; // dB change
  description: string;
}

interface ProcessingChainInsightsProps {
  stages: ProcessingStage[];
  totalLUFSImprovement: number;
  totalPeakReduction: number;
}

export const ProcessingChainInsights: React.FC<ProcessingChainInsightsProps> = ({
  stages,
  totalLUFSImprovement,
  totalPeakReduction,
}) => {
  // Mock hardware chain for demo
  const defaultStages: ProcessingStage[] = [
    {
      name: 'Linear Phase EQ',
      icon: '🎚️',
      lufsChange: -0.3,
      peakChange: -0.1,
      description: 'Removes harsh frequencies, phase-accurate',
    },
    {
      name: 'Multiband Compression',
      icon: '📊',
      lufsChange: -1.2,
      peakChange: -2.1,
      description: 'Tightens each frequency band independently',
    },
    {
      name: 'Saturation/Harmonic',
      icon: '⚡',
      lufsChange: -0.5,
      peakChange: -0.3,
      description: 'Adds cohesion and warmth without pumping',
    },
    {
      name: 'Limiting',
      icon: '🛑',
      lufsChange: -2.0,
      peakChange: -3.2,
      description: 'Catches peaks, prevents clipping',
    },
  ];

  const processingStages = stages.length > 0 ? stages : defaultStages;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div>
        <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-3">Processing Chain Impact</h4>
        <p className="text-xs text-slate-500 mb-4">How each stage contributed to the improvement:</p>
      </div>

      {/* Processing stages */}
      <div className="space-y-2">
        {processingStages.map((stage, idx) => {
          const lufsPercent = Math.abs((stage.lufsChange / totalLUFSImprovement) * 100);
          const peakPercent = Math.abs((stage.peakChange / totalPeakReduction) * 100);

          return (
            <motion.div
              key={stage.name}
              className="relative"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
            >
              {/* Stage header */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{stage.icon}</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-200">{stage.name}</p>
                  <p className="text-xs text-slate-500">{stage.description}</p>
                </div>
              </div>

              {/* Impact bars */}
              <div className="grid grid-cols-2 gap-2 ml-6">
                {/* LUFS contribution */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">LUFS</span>
                    <span className="text-orange-400 font-mono font-semibold">
                      {stage.lufsChange.toFixed(1)} dB
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, lufsPercent)}%` }}
                      transition={{ duration: 0.6, delay: idx * 0.08 + 0.2 }}
                    />
                  </div>
                </div>

                {/* Peak contribution */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">True Peak</span>
                    <span className="text-cyan-400 font-mono font-semibold">
                      {stage.peakChange.toFixed(1)} dB
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, peakPercent)}%` }}
                      transition={{ duration: 0.6, delay: idx * 0.08 + 0.2 }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Summary */}
      <motion.div
        className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-700/50 mt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-1">Total LUFS Improvement</p>
          <p className="text-lg font-bold text-orange-400">{totalLUFSImprovement.toFixed(1)} dB</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-1">Total Peak Reduction</p>
          <p className="text-lg font-bold text-cyan-400">{totalPeakReduction.toFixed(1)} dB</p>
        </div>
      </motion.div>

      <motion.div
        className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        �Each stage is optimized to do one thing well. The combination creates the final result.
      </motion.div>
    </motion.div>
  );
};
