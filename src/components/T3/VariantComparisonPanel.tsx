import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { generateVariants, VARIANT_CONFIGS } from '../../services/variantMasteringEngine';
import type { AudioMetrics } from '../../types';

interface VariantComparisonPanelProps {
  originalLUFS: number;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  trackName?: string;
}

export const VariantComparisonPanel: React.FC<VariantComparisonPanelProps> = ({
  originalLUFS,
  originalMetrics,
  processedMetrics,
  trackName = 'Track',
}) => {
  const [selectedVariant, setSelectedVariant] = useState<0 | 1 | 2>(0);

  const variants = useMemo(
    () => generateVariants(originalLUFS, originalMetrics, processedMetrics),
    [originalLUFS, originalMetrics, processedMetrics]
  );

  const handleDownload = (variantIndex: number) => {
    const variant = variants[variantIndex];
    alert(`Downloaded: ${variant.filename}\n\nLUFS: ${variant.processedLUFS.toFixed(1)}\nType: ${variant.config.type}`);
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h4 className="text-sm font-bold text-slate-100 mb-2">ðŸŽšï¸Multi-Master Variants</h4>
        <p className="text-xs text-slate-400 mb-4">Generate 3 platform-optimized masters. Choose which fits your needs.</p>
      </div>

      {/* Variant Tabs */}
      <div className="flex gap-2">
        {variants.map((variant, idx) => (
          <motion.button
            key={variant.config.type}
            onClick={() => setSelectedVariant(idx as 0 | 1 | 2)}
            className={`flex-1 p-3 rounded-lg transition-all ${
              selectedVariant === idx
                ? 'bg-cyan-500/30 border border-cyan-400/50'
                : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <p className="font-semibold text-xs mb-1">{variant.config.name}</p>
            <p className="text-xs text-slate-400">{variant.processedLUFS.toFixed(1)} LUFS</p>
          </motion.button>
        ))}
      </div>

      {/* Selected Variant Details */}
      <motion.div
        key={selectedVariant}
        className="space-y-3 p-4 rounded-lg bg-slate-900/40 border border-slate-700/50"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div>
          <h5 className="font-semibold text-slate-100 mb-2">{variants[selectedVariant].config.name}</h5>
          <p className="text-xs text-slate-400">{variants[selectedVariant].config.description}</p>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Target LUFS</p>
            <p className="font-mono font-bold text-cyan-400">{variants[selectedVariant].processedLUFS.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">True Peak</p>
            <p className="font-mono font-bold text-orange-400">{variants[selectedVariant].truePeak.toFixed(1)} dBTP</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Compression</p>
            <p className="text-xs text-slate-300">{variants[selectedVariant].config.compressionAttack}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">EQ Character</p>
            <p className="text-xs text-slate-300">{variants[selectedVariant].config.eqCharacter}</p>
          </div>
        </div>

        {/* Use Case */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-400/30">
          <p className="text-xs text-blue-300 mb-2">
            <span className="font-semibold">Best for:</span> {variants[selectedVariant].config.useCase}
          </p>
          <p className="text-xs text-blue-400">
            Platforms: {variants[selectedVariant].config.platforms.join(', ')}
          </p>
        </div>

        {/* Download Button */}
        <motion.button
          onClick={() => handleDownload(selectedVariant)}
          className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 font-semibold text-sm border border-cyan-400/30 hover:border-cyan-400/50 transition-all"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          ðŸ“Download {variants[selectedVariant].config.type.toUpperCase()} Master
        </motion.button>
      </motion.div>

      {/* Comparison Table */}
      <motion.div
        className="overflow-x-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <table className="w-full text-xs">
          <thead className="border-b border-slate-700/50">
            <tr className="text-slate-500 uppercase tracking-widest">
              <th className="text-left py-2 px-2">Variant</th>
              <th className="text-right py-2 px-2">LUFS</th>
              <th className="text-right py-2 px-2">Peak</th>
              <th className="text-right py-2 px-2">Dynamics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {variants.map((variant, idx) => (
              <motion.tr
                key={variant.config.type}
                className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                  selectedVariant === idx ? 'bg-cyan-500/10' : ''
                }`}
                onClick={() => setSelectedVariant(idx as 0 | 1 | 2)}
                whileHover={{ scale: 1.01 }}
              >
                <td className="py-2 px-2 text-slate-300 font-semibold">{variant.config.name}</td>
                <td className="py-2 px-2 text-right text-cyan-400 font-mono">{variant.processedLUFS.toFixed(1)}</td>
                <td className="py-2 px-2 text-right text-orange-400 font-mono">{variant.truePeak.toFixed(1)}</td>
                <td className="py-2 px-2 text-right text-emerald-400 font-mono">{variant.dynamicRange.toFixed(1)} LU</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <motion.div
        className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        ðŸ’One upload, three masters. Download whichever matches your release strategy. Streaming? Radio? Album archival? You've got options.
      </motion.div>
    </motion.div>
  );
};
