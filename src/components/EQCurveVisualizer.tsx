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
  onBandChange?: (bandIndex: number, updates: { frequency?: number, gain?: number }) => void;
  interactive?: boolean;
}

export const EQCurveVisualizer: React.FC<EQCurveVisualizerProps> = ({
  bands,
  width = 400,
  height = 100,
  showGrid = true,
  showLabels = true,
  onBandChange,
  interactive = false,
}) => {
  const [draggedBand, setDraggedBand] = React.useState<number | null>(null);

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

  // Convert pixel Y position to gain value
  const pixelToGain = (pixelY: number): number => {
    const centerY = height / 2;
    const deltaY = centerY - pixelY;
    const gain = (deltaY / (height / 24)); // 2px per dB
    return Math.max(-12, Math.min(12, gain)); // Clamp to -12 to +12 dB
  };

  // Convert pixel X position to frequency value (logarithmic)
  const pixelToFrequency = (pixelX: number): number => {
    // Inverse of: x = Math.log10(freq / 20) / Math.log10(20000 / 20) * width
    const normalized = pixelX / width; // 0 to 1
    const freqHz = Math.pow(10, normalized * Math.log10(20000 / 20)) * 20;
    return Math.max(20, Math.min(20000, freqHz)); // Clamp to 20Hz to 20kHz
  };

  // Handle drag on control points
  const handleMouseDown = (bandIndex: number) => {
    if (!interactive) return;
    setDraggedBand(bandIndex);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || draggedBand === null || !onBandChange) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    // Convert viewport coords to SVG coords
    const svgX = (relativeX / rect.width) * width;
    const svgY = (relativeY / rect.height) * height;

    const frequency = pixelToFrequency(svgX);
    const gain = pixelToGain(svgY);

    onBandChange(draggedBand, { frequency, gain });
  };

  const handleMouseUp = () => {
    setDraggedBand(null);
  };

  return (
    <div className="bg-slate-950 rounded-xl p-4 relative overflow-hidden border border-white/5" style={{ height: `${height + 32}px` }}>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <svg
          className={`w-full h-full ${interactive && draggedBand !== null ? 'cursor-grabbing' : interactive ? 'cursor-grab' : ''}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
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
            const isHovered = draggedBand === i;
            return (
              <g key={i}>
                {/* Highlight ring when dragging */}
                {isHovered && interactive && (
                  <circle
                    cx={x}
                    cy={y}
                    r={10}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="1.5"
                    opacity="0.3"
                  />
                )}
                {/* Control point */}
                <circle
                  cx={x}
                  cy={y}
                  r={band.enabled !== false ? (isHovered ? 7 : 5) : 3}
                  fill={band.enabled !== false ? '#f97316' : '#475569'}
                  className={`transition-all ${interactive && band.enabled !== false ? 'hover:brightness-110' : ''}`}
                  style={{ cursor: interactive && band.enabled !== false ? 'grab' : 'default' }}
                  onMouseDown={() => handleMouseDown(i)}
                  pointerEvents="auto"
                />
              </g>
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
