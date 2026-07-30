/**
 * consoleStyles.ts
 * 
 * Replaces the heavy glassmorphism with a "Modern Console" hardware aesthetic.
 * Think high-end Universal Audio / SSL rack gear, but modernized for software.
 * 
 * Materials: Dark brushed aluminum, matte blacks, carbon-fiber textures.
 * Lighting: Subtle amber/orange LED glows for active states, avoiding full-screen neon.
 * Depth: Physical-feeling buttons with inset shadows and crisp borders.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Main chassis panels (replacing glassCard)
export const consolePanel = 
  'bg-gradient-to-b from-[#2a2d34] to-[#16181d] border border-black/80 rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.8)]';

// Inset screens or meters (LCD/OLED look)
export const consoleScreen = 
  'bg-[#08090a] border border-[#1a1c22] rounded-lg shadow-[inset_0_4px_20px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.05)] text-amber-500 font-mono';

// Tactile physical buttons
export const consoleButton = 
  'relative bg-gradient-to-b from-[#3a3d45] to-[#24262b] border border-black/60 rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_6px_rgba(0,0,0,0.4)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6),0_1px_1px_rgba(255,255,255,0.05)] active:translate-y-[1px] transition-all text-slate-300 font-semibold uppercase tracking-wider text-xs px-4 py-2 hover:text-white';

// Active toggle buttons (lights up when pressed)
export const consoleToggleActive = 
  'bg-gradient-to-b from-[#1a1c22] to-[#101216] border-amber-500/50 text-amber-400 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8),0_0_15px_rgba(245,158,11,0.15)]';

// LED Indicators
export const ledIndicatorOff = 
  'w-2 h-2 rounded-full bg-[#1a1c22] border border-black/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]';
export const ledIndicatorOn = 
  'w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8),inset_0_1px_2px_rgba(255,255,255,0.4)]';

// Hardware Typography
export const hardwareLabel = 
  'text-[10px] uppercase font-bold tracking-[0.2em] text-[#6b7280]';
