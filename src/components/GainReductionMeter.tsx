/**
 * GainReductionMeter — Live master bus compressor visual
 *
 * Shows GR in dB as an animated vertical bar.
 * Peaks hold for 1.5s, then decay.
 * Mounts as a floating strip beside the visualizer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  /** 0 = no reduction, positive number = dB of gain reduction applied */
  gainReductionDb: number;
  /** Max range to show on meter (default 12) */
  maxDb?: number;
}

export const GainReductionMeter: React.FC<Props> = ({ gainReductionDb, maxDb = 12 }) => {
  const [peak, setPeak] = useState(0);
  const peakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gr = Math.max(0, Math.min(maxDb, gainReductionDb));
  const pct = gr / maxDb; // 0 = no GR, 1 = full

  useEffect(() => {
    if (gr > peak) {
      setPeak(gr);
      if (peakTimer.current) clearTimeout(peakTimer.current);
      peakTimer.current = setTimeout(() => setPeak(0), 1500);
    }
  }, [gr]); // eslint-disable-line

  const color =
    gr < 3 ? '#22d3ee' :
    gr < 6 ? '#fbbf24' :
    '#f43f5e';

  const segments = 12;

  return (
    <div className="flex flex-col items-center gap-1 select-none" title={`Gain Reduction: ${gr.toFixed(1)} dB`}>
      <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">GR</p>
      <div className="flex flex-col-reverse gap-px" style={{ height: 80 }}>
        {Array.from({ length: segments }, (_, i) => {
          const segPct = (i + 1) / segments;
          const active = pct >= segPct - 1 / segments;
          const segColor =
            i < 4 ? '#22d3ee' :
            i < 8 ? '#fbbf24' :
            '#f43f5e';
          return (
            <div
              key={i}
              className="w-3 rounded-sm transition-opacity duration-75"
              style={{
                height: `${100 / segments - 1}%`,
                backgroundColor: active ? segColor : 'rgba(255,255,255,0.05)',
                opacity: active ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>
      {/* Peak hold line */}
      {peak > 0 && (
        <div
          className="w-3 h-px absolute"
          style={{
            backgroundColor: color,
            bottom: `calc(${(peak / maxDb) * 80}px)`,
          }}
        />
      )}
      <p className="text-[9px] font-mono" style={{ color: gr > 0 ? color : '#334155' }}>
        {gr > 0 ? `-${gr.toFixed(1)}` : '0.0'}
      </p>
    </div>
  );
};
