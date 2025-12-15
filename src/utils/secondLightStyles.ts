/**
 * Second Light OS Design System
 * Glassy textures, soft shadows, neon accents, neumorphic depth
 */

// Base glass card with depth (enhanced shadows)
export const glassCard = 'bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-[6px_6px_12px_#090e1a,-6px_-6px_12px_#15203a]';

// Primary card with neon accent
export const neonCard = 'bg-gradient-to-br from-cyan-500/5 to-blue-500/10 backdrop-blur-xl rounded-3xl border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.15)]';

// Dark neumorphic card
export const neomorphCard = 'bg-slate-900 rounded-3xl shadow-[8px_8px_16px_#050710,-8px_-8px_16px_#0f1828] border border-slate-800/50';

// Interactive neumorphic button (pressed state)
export const neomorphButton = 'bg-slate-900 rounded-2xl shadow-[inset_6px_6px_12px_#050710,inset_-6px_-6px_12px_#0f1828] border border-slate-800/50';

// Elevated neumorphic button (default state)
export const neomorphButtonRaised = 'bg-slate-900 rounded-2xl shadow-[6px_6px_12px_#050710,-6px_-6px_12px_#0f1828] border border-slate-800/30 hover:shadow-[8px_8px_16px_#050710,-8px_-8px_16px_#0f1828] active:shadow-[inset_4px_4px_8px_#050710,inset_-4px_-4px_8px_#0f1828]';

// Primary action button with neumorphic style (Second Light OS)
export const glowButton = 'bg-slate-900 text-orange-400 font-bold rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03),_0_0_20px_rgba(251,146,60,0.15)] hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02),_0_0_25px_rgba(251,146,60,0.25)] hover:text-orange-300 active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.9),inset_-1px_-1px_2px_rgba(255,255,255,0.01)] active:translate-y-[1px] transition-all duration-200';

// Secondary action button (outlined style)
export const secondaryButton = 'bg-transparent hover:bg-slate-800/30 backdrop-blur-md text-slate-300 font-semibold rounded-xl border border-slate-600/50 hover:border-orange-500/50 shadow-md active:scale-[0.98] transition-all duration-300';

// Danger button (outlined red)
export const dangerButton = 'bg-transparent hover:bg-red-500/10 text-red-400 font-semibold rounded-xl border border-red-500/30 hover:border-red-500/50 shadow-md active:scale-[0.98] transition-all duration-300';

// Success button with green glow
export const successButton = 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 hover:from-emerald-500/30 hover:to-green-500/30 text-emerald-400 font-bold rounded-2xl border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all duration-300';

// Input field with glass effect
export const glassInput = 'bg-slate-900/70 backdrop-blur-md text-slate-200 rounded-xl px-4 py-3 border border-slate-700/50 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 shadow-inner transition-all duration-200 placeholder:text-slate-500';

// Slider track
export const sliderTrack = 'bg-gradient-to-r from-slate-800 to-slate-900 rounded-full shadow-inner border border-slate-700/30';

// Slider thumb with glow (orange gradient)
export const sliderThumb = 'bg-gradient-to-br from-orange-400 to-pink-500 rounded-full shadow-[0_0_12px_rgba(251,146,60,0.6)] border-2 border-white/20';

// Badge with subtle glow
export const glowBadge = 'px-3 py-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 rounded-full text-xs font-bold border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]';

// Section header (gradient text)
export const sectionHeader = 'text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent';

// Uppercase label (Second Light OS style)
export const upperLabel = 'text-xs font-bold tracking-widest uppercase text-slate-500';

// Page title with separator
export const pageTitle = 'text-2xl font-bold tracking-wide uppercase text-slate-200';

// Divider with gradient
export const gradientDivider = 'h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent';

// Tooltip
export const glassTooltip = 'bg-slate-900/95 backdrop-blur-md text-slate-200 px-3 py-2 rounded-xl border border-slate-700/50 shadow-2xl text-sm';

// Panel section
export const panelSection = 'bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/20';

// Metric card
export const metricCard = 'bg-gradient-to-br from-slate-800/50 to-slate-900/70 backdrop-blur-md rounded-2xl p-4 border border-slate-700/30 shadow-lg';

// Active/selected state
export const activeState = 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.25)]';

// Disabled state
export const disabledState = 'opacity-40 cursor-not-allowed grayscale';

// Loading shimmer effect
export const shimmer = 'bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-[length:200%_100%] animate-shimmer';

// Spacing utilities (Second Light OS standard scale)
export const spacing = {
  // Padding scales
  padding: {
    xs: 'p-2',      // 8px - Tight elements
    sm: 'p-3',      // 12px - Compact components
    md: 'p-4',      // 16px - Standard cards
    lg: 'p-6',      // 24px - Large panels
    xl: 'p-8',      // 32px - Main containers
  },
  // Margin scales
  margin: {
    xs: 'mb-2',     // 8px - Tight vertical spacing
    sm: 'mb-3',     // 12px - Between related items
    md: 'mb-4',     // 16px - Standard separation
    lg: 'mb-6',     // 24px - Section spacing
    xl: 'mb-8',     // 32px - Major sections
  },
  // Gap scales (for flex/grid)
  gap: {
    xs: 'gap-2',    // 8px
    sm: 'gap-3',    // 12px
    md: 'gap-4',    // 16px
    lg: 'gap-6',    // 24px
    xl: 'gap-8',    // 32px
  },
  // Combined (padding + gap)
  container: {
    xs: 'p-2 gap-2',
    sm: 'p-3 gap-3',
    md: 'p-4 gap-4',
    lg: 'p-6 gap-6',
    xl: 'p-8 gap-8',
  },
};

// Standardized component spacing
export const componentSpacing = {
  button: 'px-6 py-3',           // Standard button padding
  buttonSmall: 'px-4 py-2',      // Compact button
  buttonLarge: 'px-8 py-4',      // Large CTA button
  input: 'px-4 py-3',            // Input field padding
  card: 'p-6',                   // Standard card padding
  cardLarge: 'p-8',              // Large card/panel
  section: 'mb-8',               // Between major sections
  sectionLarge: 'mb-12',         // Between page sections
  element: 'mb-4',               // Between related elements
  elementTight: 'mb-3',          // Tight element spacing
};

// Animation utilities
export const animations = {
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  pulse: 'animate-pulse',
  spin: 'animate-spin',
};

// Color tokens
export const colors = {
  neon: {
    cyan: '#06b6d4',
    blue: '#3b82f6',
    purple: '#a855f7',
    pink: '#ec4899',
    orange: '#f97316',
  },
  glass: {
    light: 'rgba(148, 163, 184, 0.1)',
    medium: 'rgba(148, 163, 184, 0.2)',
    dark: 'rgba(15, 23, 42, 0.6)',
  },
};

/**
 * Combine multiple class names
 */
export const cn = (...classes: (string | boolean | undefined | null)[]) => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Generate button classes based on variant
 */
export const getButtonVariant = (variant: 'primary' | 'secondary' | 'danger' | 'success' | 'glass' = 'secondary') => {
  switch (variant) {
    case 'primary':
      return glowButton;
    case 'danger':
      return dangerButton;
    case 'success':
      return successButton;
    case 'glass':
      return glassCard + ' hover:brightness-110';
    default:
      return secondaryButton;
  }
};

/**
 * Generate card classes based on variant
 */
export const getCardVariant = (variant: 'glass' | 'neon' | 'neomorph' = 'glass') => {
  switch (variant) {
    case 'neon':
      return neonCard;
    case 'neomorph':
      return neomorphCard;
    default:
      return glassCard;
  }
};
