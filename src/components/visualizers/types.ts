export interface EnergyBands {
  low: number;   // 20-250Hz (bass/kick)
  mid: number;   // 250-2kHz (vocals/melody)
  high: number;  // 2kHz-8kHz (presence/clarity)
  air: number;   // 8kHz+ (shimmer/brightness)
}

export interface RenderParams {
  width: number;
  height: number;
  freqData: Uint8Array;
  timeData: Uint8Array;
  energy: EnergyBands;
  isPlaying: boolean;
  timeMs: number;
}

export interface VisualizerRenderer {
  name: string;
  render(ctx: CanvasRenderingContext2D, params: RenderParams): void;
  init?(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  cleanup?(): void;
}

export type VisualizerStyle =
  | 'spectrum'
  | 'scope';

export interface VisualizerStyleInfo {
  value: VisualizerStyle;
  label: string;
  description?: string;
}
