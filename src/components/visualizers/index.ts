export * from './types';
export * from './utils';

import { VisualizerRenderer, VisualizerStyleInfo } from './types';

// No custom renderers - using built-in only
export const customRenderers: Record<string, VisualizerRenderer> = {};

// Visualizer style list - Spectrum and Scope only
export const extendedVisualizerStyles: VisualizerStyleInfo[] = [
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'scope', label: 'Scope' },
];
