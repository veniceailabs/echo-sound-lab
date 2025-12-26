// Linear interpolation
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Clamp value between min and max
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// Interpolate between two RGB colors
export const colorLerp = (
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } => ({
  r: Math.round(lerp(c1.r, c2.r, t)),
  g: Math.round(lerp(c1.g, c2.g, t)),
  b: Math.round(lerp(c1.b, c2.b, t)),
});

// Convert RGB to CSS string
export const rgbToString = (c: { r: number; g: number; b: number }, alpha = 1): string =>
  alpha < 1 ? `rgba(${c.r},${c.g},${c.b},${alpha})` : `rgb(${c.r},${c.g},${c.b})`;

// Map frequency bin index to logarithmic x position
export const freqToX = (index: number, binCount: number, width: number): number => {
  const t = index / (binCount - 1);
  return Math.pow(t, 1.8) * width;
};

// Smooth exponential decay
export const smoothValue = (current: number, target: number, attackRate: number, releaseRate: number): number => {
  const rate = target > current ? attackRate : releaseRate;
  return lerp(current, target, rate);
};

// Generate smooth sine wave value
export const sineWave = (time: number, frequency: number, phase = 0): number =>
  Math.sin(time * frequency + phase);

// Calculate distance from center
export const distanceFromCenter = (x: number, y: number, cx: number, cy: number): number =>
  Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

// ESL Color Palette
export const ESL_COLORS = {
  teal: { r: 20, g: 184, b: 166 },      // #14b8a6
  orange: { r: 249, g: 115, b: 22 },    // #f97316
  cyan: { r: 6, g: 182, b: 212 },       // #06b6d4
  purple: { r: 168, g: 85, b: 247 },    // #a855f7
  green: { r: 34, g: 197, b: 94 },      // #22c55e
  amber: { r: 245, g: 158, b: 11 },     // #f59e0b
  white: { r: 255, g: 255, b: 255 },
  slate: { r: 100, g: 116, b: 139 },    // #64748b
  blue: { r: 72, g: 136, b: 255 },      // #4888ff
  blueLight: { r: 150, g: 226, b: 255 },// #96e2ff
} as const;

// Background color for visualizers
export const BG_COLOR = 'rgba(7,8,12,0.35)';
export const BG_COLOR_IDLE = 'rgba(7,8,12,0.55)';
