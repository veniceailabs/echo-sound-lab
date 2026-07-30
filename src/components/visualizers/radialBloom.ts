import { VisualizerRenderer, RenderParams } from './types';

/**
 * Radial Bloom Visualizer
 * 80 frequency bars radiate from center in a circular pattern
 * Colors shift from cyan (low freq) to purple (high freq) with glow effects
 */

interface BloomState {
  smoothBars: number[];
}

let bloomState: BloomState = { smoothBars: [] };

const BAR_COUNT = 80;
const INNER_RADIUS = 0.18;      // fraction of min(width,height)
const OUTER_RADIUS_MAX = 0.48;

// Lerp utility
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const radialBloomRenderer: VisualizerRenderer = {
  name: 'Radial Bloom',

  init() {
    bloomState.smoothBars = new Array(BAR_COUNT).fill(0);
  },

  render(ctx: CanvasRenderingContext2D, params: RenderParams) {
    const { width, height, freqData, energy } = params;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);

    // Semi-transparent trail — creates persistence glow
    ctx.fillStyle = 'rgba(7,8,12,0.25)';
    ctx.fillRect(0, 0, width, height);

    const innerR = minDim * INNER_RADIUS;
    const outerRMax = minDim * OUTER_RADIUS_MAX;
    // Energy pulse expands inner ring on bass hits
    const energyPulse = 1 + energy.low * 0.3;

    // Draw frequency bars in radial pattern
    for (let i = 0; i < BAR_COUNT; i++) {
      // Logarithmic frequency mapping — spread lower freqs, compress higher
      const binIndex = Math.floor(Math.pow(i / BAR_COUNT, 1.6) * (freqData.length - 1));
      const amp = freqData[binIndex] / 255;

      // Smoothing: fast attack (0.8), moderate release (0.15)
      const prev = bloomState.smoothBars[i];
      bloomState.smoothBars[i] = amp > prev
        ? lerp(prev, amp, 0.8)
        : lerp(prev, amp, 0.15);
      const val = bloomState.smoothBars[i];

      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const barLen = val * (outerRMax - innerR * energyPulse);
      const r1 = innerR * energyPulse;
      const r2 = r1 + barLen;

      // Color: cyan (i~0) → purple (i~BAR_COUNT)
      const t = i / BAR_COUNT;
      const r = Math.round(lerp(6, 168, t));    // cyan→purple R
      const g = Math.round(lerp(182, 85, t));
      const b = Math.round(lerp(212, 247, t));

      // Glow effect — intensity proportional to amplitude
      ctx.shadowBlur = 8 + val * 20;
      ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 + val * 0.4})`;
      ctx.lineWidth = 1.5 + val * 2.5;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }

    // Reset shadow to prevent bleed
    ctx.shadowBlur = 0;

    // Central pulsing core orb
    const coreRadius = innerR * 0.5 * (1 + energy.mid * 0.4);
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    coreGrad.addColorStop(0, `rgba(6,182,212,${0.5 + energy.low * 0.5})`);
    coreGrad.addColorStop(1, 'rgba(6,182,212,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();
  },
};
