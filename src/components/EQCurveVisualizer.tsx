import React from 'react';

interface EQBand {
  frequency: number;
  gain: number;
  enabled?: boolean;
}

interface EQCurveVisualizerProps {
  bands: EQBand[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
}

export const EQCurveVisualizer: React.FC<EQCurveVisualizerProps> = ({
  bands,
  width = 400,
  height = 100,
  showGrid = true,
  showLabels = true,
}) => {
  // Calculate SVG path for EQ curve
  const generateCurvePath = (): string => {
    if (bands.length === 0) return `M 0 ${height / 2} L ${width} ${height / 2}`;

    const points = bands.map((band) => {
      // Logarithmic frequency scale (20Hz to 20kHz)
      const x = Math.log10(band.frequency / 20) / Math.log10(20000 / 20) * width;
      // Linear gain scale (-12dB to +12dB maps to height range)
      const y = (height / 2) - (band.gain * (height / 24)); // 2px per dB
      return `L ${Math.max(0, Math.min(width, x))} ${Math.max(0, Math.min(height, y))}`;
    });

    return `M 0 ${height / 2} ${points.join(' ')} L ${width} ${height / 2}`;
  };

  return (
    <div className="bg-slate-950 rounded-xl p-4 relative overflow-hidden border border-white/5" style={{ height: `${height + 32}px` }}>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {showGrid && (
            <>
              {/* Horizontal grid line at 0dB */}
              <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeWidth="1" opacity="0.5" />

              {/* Vertical grid lines for frequency markers */}
              <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke="#1e293b" strokeWidth="1" opacity="0.3" />
              <line x1={width * 0.5} y1="0" x2={width * 0.5} y2={height} stroke="#1e293b" strokeWidth="1" opacity="0.3" />
              <line x1={width * 0.75} y1="0" x2={width * 0.75} y2={height} stroke="#1e293b" strokeWidth="1" opacity="0.3" />
            </>
          )}

          {/* EQ curve path */}
          <path
            d={generateCurvePath()}
            fill="none"
            stroke="url(#eqGradient)"
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ transition: 'all 0.2s ease-out' }}
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="eqGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>

          {/* Band control points */}
          {bands.map((band, i) => {
            const x = Math.max(0, Math.min(width, Math.log10(band.frequency / 20) / Math.log10(20000 / 20) * width));
            const y = Math.max(0, Math.min(height, (height / 2) - (band.gain * (height / 24))));
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={band.enabled !== false ? 5 : 3}
                fill={band.enabled !== false ? '#f97316' : '#475569'}
                className="transition-all"
              />
            );
          })}
        </svg>
      </div>

      {showLabels && (
        <>
          <div className="absolute bottom-1 left-2 text-[10px] text-slate-600">20Hz</div>
          <div className="absolute bottom-1 right-2 text-[10px] text-slate-600">20kHz</div>
        </>
      )}
    </div>
  );
};
