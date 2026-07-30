/**
 * cinemaScope — Neon oscilloscope with glowing trail persistence
 *
 * XY Lissajous mode when stereo data available, else mono waveform.
 * Trail effect via semi-transparent clear. Color shifts with energy.
 */
import type { VisualizerRenderer, RenderParams } from './types';

interface ScopeState {
  trail: ImageData | null;
}

const state: ScopeState = { trail: null };

export const cinemaScope: VisualizerRenderer = {
  name: 'Cinema Scope',

  init(ctx, w, h) {
    state.trail = null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  },

  render(ctx, params) {
    const { width: W, height: H, timeData, energy, isPlaying } = params;
    const cx = W / 2;
    const cy = H / 2;

    // Fade trail
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, W, H);

    if (!isPlaying) {
      // Idle: draw a faint breathing circle
      const r = 40 + Math.sin(params.timeMs / 800) * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251,146,60,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    const n = timeData.length;
    const half = n >> 1;

    // Color based on energy: low=cyan, mid=white, high=orange/red
    const r = Math.round(30 + energy.high * 220);
    const g = Math.round(180 - energy.mid * 100);
    const b = Math.round(220 - energy.high * 180);
    const alpha = 0.7 + energy.low * 0.3;

    ctx.save();
    ctx.shadowBlur = 12 + energy.low * 24;
    ctx.shadowColor = `rgb(${r},${g},${b})`;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = 1.5 + energy.high * 1.5;
    ctx.lineJoin = 'round';

    // XY mode: treat first half as L, second half as R
    ctx.beginPath();
    const scale = (Math.min(W, H) / 2) * 0.85;
    for (let i = 0; i < half; i++) {
      const lSample = ((timeData[i] ?? 128) - 128) / 128;
      const rSample = ((timeData[i + half] ?? 128) - 128) / 128;
      const x = cx + rSample * scale;
      const y = cy - lSample * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Center dot pulsing on bass
    const dotR = 3 + energy.low * 10;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fill();
  },

  cleanup() {
    state.trail = null;
  },
};
