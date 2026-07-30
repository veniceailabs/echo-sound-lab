export * from './types';
export * from './utils';

import { VisualizerRenderer, VisualizerStyleInfo } from './types';
import { radialBloomRenderer } from './radialBloom';
import { galaxyFieldRenderer } from './galaxyField';
import { cinemaScope } from './cinemaScope';
import { frequencyWaterfall } from './frequencyWaterfall';

// Custom renderers - premium visualization modes
export const customRenderers: Record<string, VisualizerRenderer> = {
  radialBloom: radialBloomRenderer,
  galaxyField: galaxyFieldRenderer,
  cinemaScope,
  frequencyWaterfall,
};

// Visualizer style list - all available modes
export const extendedVisualizerStyles: VisualizerStyleInfo[] = [
  { value: 'spectrum', label: 'Spectrum', description: 'Classic frequency bars' },
  { value: 'scope', label: 'Scope', description: 'Oscilloscope waveform' },
  { value: 'radialBloom', label: 'Bloom', description: 'Radial frequency bloom with glow' },
  { value: 'galaxyField', label: 'Galaxy', description: 'Particle field orbiting to music' },
  { value: 'cinemaScope', label: 'Cinema', description: 'Neon XY oscilloscope with trails' },
  { value: 'frequencyWaterfall', label: 'Waterfall', description: 'Scrolling spectrogram over time' },
];
