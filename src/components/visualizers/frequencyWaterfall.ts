/**
 * frequencyWaterfall — Scrolling spectrogram (time×frequency→color)
 *
 * Each frame: draw one column of frequency data on the right,
 * shift entire canvas left via drawImage (O(1) GPU operation).
 * Color: black=silence → cyan→yellow→red=loud.
 */
import type { VisualizerRenderer, RenderParams } from './types';

interface WaterfallState {
  offscreen: OffscreenCanvas | null;
  offCtx: OffscreenCanvasRenderingContext2D | null;
  colWidth: number;
}

const state: WaterfallState = { offscreen: null, offCtx: null, colWidth: 2 };

function ampToColor(amp: number): [number, number, number] {
  // 0→black, 0.2→deep blue, 0.45→cyan, 0.65→yellow, 0.85→orange, 1→red
  if (amp < 0.2) {
    const t = amp / 0.2;
    return [0, 0, Math.round(t * 180)];
  } else if (amp < 0.45) {
    const t = (amp - 0.2) / 0.25;
    return [0, Math.round(t * 220), 180 + Math.round(t * 55)];
  } else if (amp < 0.65) {
    const t = (amp - 0.45) / 0.2;
    return [Math.round(t * 255), 220, Math.round(235 - t * 235)];
  } else if (amp < 0.85) {
    const t = (amp - 0.65) / 0.2;
    return [255, Math.round(220 - t * 150), 0];
  } else {
    const t = (amp - 0.85) / 0.15;
    return [255, Math.round(70 - t * 70), 0];
  }
}

export const frequencyWaterfall: VisualizerRenderer = {
  name: 'Waterfall',

  init(ctx, w, h) {
    state.colWidth = Math.max(1, Math.round(w / 240));
    if (typeof OffscreenCanvas !== 'undefined') {
      state.offscreen = new OffscreenCanvas(w, h);
      state.offCtx = state.offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D;
      if (state.offCtx) {
        state.offCtx.fillStyle = '#000';
        state.offCtx.fillRect(0, 0, w, h);
      }
    } else {
      state.offscreen = null;
      state.offCtx = null;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  },

  render(ctx, params) {
    const { width: W, height: H, freqData } = params;
    const cw = state.colWidth;

    if (state.offscreen && state.offCtx) {
      const oCtx = state.offCtx;
      // Shift left by cw pixels
      oCtx.drawImage(state.offscreen, -cw, 0);
      // Draw new column on the right
      const colImg = oCtx.createImageData(cw, H);
      const { data } = colImg;
      for (let y = 0; y < H; y++) {
        // Map y to frequency bin (invert so low freq at bottom)
        const binIdx = Math.floor(((H - 1 - y) / H) * freqData.length);
        const amp = (freqData[binIdx] ?? 0) / 255;
        const [r, g, b] = ampToColor(amp);
        for (let x = 0; x < cw; x++) {
          const idx = (y * cw + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
      oCtx.putImageData(colImg, W - cw, 0);
      ctx.drawImage(state.offscreen, 0, 0);
    } else {
      // Fallback: simple vertical bars
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);
      const barW = W / freqData.length;
      for (let i = 0; i < freqData.length; i++) {
        const amp = (freqData[i] ?? 0) / 255;
        const [r, g, b] = ampToColor(amp);
        const barH = amp * H;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * barW, H - barH, barW, barH);
      }
    }

    // Frequency axis labels overlay
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px monospace';
    const labels = [{ hz: '20', y: H - 4 }, { hz: '1k', y: H * 0.55 }, { hz: '10k', y: H * 0.15 }, { hz: '20k', y: 4 }];
    labels.forEach(({ hz, y }) => {
      ctx.fillText(hz, 3, y);
    });
  },

  cleanup() {
    state.offscreen = null;
    state.offCtx = null;
  },
};
