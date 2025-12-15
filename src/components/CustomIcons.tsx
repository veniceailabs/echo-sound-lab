/**
 * Custom Second Light OS Style Icons
 * Unique illustrated icons with subtle details and opacity
 */

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// Document/Note with squiggly lines (like Second Light OS)
export const NoteIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Dark blue background */}
    <rect x="10" y="6" width="28" height="36" rx="3" fill="#1e3a8a" opacity="0.9" />
    <rect x="10" y="6" width="28" height="36" rx="3" stroke="#3b82f6" strokeWidth="1" opacity="0.3" />

    {/* Faded white squiggly lines */}
    <path
      d="M16 14 Q18 13, 20 14 T24 14 T28 14 T32 14"
      stroke="white"
      strokeWidth="1.5"
      opacity="0.25"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M16 20 Q18 19, 20 20 T24 20 T28 20 T32 20"
      stroke="white"
      strokeWidth="1.5"
      opacity="0.25"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M16 26 Q18 25, 20 26 T24 26 T28 26"
      stroke="white"
      strokeWidth="1.5"
      opacity="0.25"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M16 32 Q18 31, 20 32 T24 32 T28 32 T32 32"
      stroke="white"
      strokeWidth="1.5"
      opacity="0.2"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

// Waveform orb (like PAC units but for audio)
export const WaveformOrbIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Gradient orb */}
    <defs>
      <radialGradient id="waveOrb" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#ea580c" stopOpacity="0.3" />
      </radialGradient>
    </defs>
    <circle cx="24" cy="24" r="16" fill="url(#waveOrb)" />
    <circle cx="24" cy="24" r="16" stroke="#fb923c" strokeWidth="1" opacity="0.5" />

    {/* Waveform bars inside */}
    <line x1="18" y1="20" x2="18" y2="28" stroke="white" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" />
    <line x1="21" y1="16" x2="21" y2="32" stroke="white" strokeWidth="1.5" opacity="0.7" strokeLinecap="round" />
    <line x1="24" y1="18" x2="24" y2="30" stroke="white" strokeWidth="1.5" opacity="0.8" strokeLinecap="round" />
    <line x1="27" y1="14" x2="27" y2="34" stroke="white" strokeWidth="1.5" opacity="0.7" strokeLinecap="round" />
    <line x1="30" y1="22" x2="30" y2="26" stroke="white" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
  </svg>
);

// Microphone with glow
export const MicGlowIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Glow effect */}
    <defs>
      <radialGradient id="micGlow" cx="50%" cy="40%">
        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="24" cy="20" r="18" fill="url(#micGlow)" />

    {/* Mic body */}
    <rect x="20" y="12" width="8" height="14" rx="4" fill="#0891b2" opacity="0.9" />
    <rect x="20" y="12" width="8" height="14" rx="4" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />

    {/* Mic stand */}
    <path d="M24 26 L24 34" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <path d="M19 34 L29 34" stroke="#0891b2" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />

    {/* Sound waves */}
    <path d="M14 18 Q12 20, 14 22" stroke="white" strokeWidth="1.5" opacity="0.3" fill="none" />
    <path d="M34 18 Q36 20, 34 22" stroke="white" strokeWidth="1.5" opacity="0.3" fill="none" />
  </svg>
);

// Processing spinner (Swiss precision style)
export const ProcessingSpinnerIcon: React.FC<IconProps> = ({ className = "w-12 h-12 animate-spin", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Outer ring */}
    <circle
      cx="24"
      cy="24"
      r="18"
      stroke="#334155"
      strokeWidth="3"
      opacity="0.2"
    />
    {/* Gradient arc */}
    <defs>
      <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
        <stop offset="100%" stopColor="#f97316" stopOpacity="1" />
      </linearGradient>
    </defs>
    <circle
      cx="24"
      cy="24"
      r="18"
      stroke="url(#spinGrad)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray="60 200"
      transform="rotate(-90 24 24)"
    />
  </svg>
);

// Upload cloud (minimal, Swiss style)
export const UploadCloudIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Cloud shape */}
    <path
      d="M36 26a6 6 0 00-6-6c0-5.523-4.477-10-10-10S10 14.477 10 20a6 6 0 000 12h26a6 6 0 000-12z"
      fill="#1e3a8a"
      opacity="0.3"
    />
    <path
      d="M36 26a6 6 0 00-6-6c0-5.523-4.477-10-10-10S10 14.477 10 20a6 6 0 000 12h26a6 6 0 000-12z"
      stroke="#3b82f6"
      strokeWidth="1.5"
      opacity="0.5"
    />

    {/* Upload arrow */}
    <path d="M24 36 L24 22" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <path d="M20 26 L24 22 L28 26" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" fill="none" />
  </svg>
);

// Success checkmark orb
export const SuccessOrbIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Green gradient orb */}
    <defs>
      <radialGradient id="successOrb" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#059669" stopOpacity="0.3" />
      </radialGradient>
    </defs>
    <circle cx="24" cy="24" r="16" fill="url(#successOrb)" />
    <circle cx="24" cy="24" r="16" stroke="#34d399" strokeWidth="1" opacity="0.5" />

    {/* Checkmark */}
    <path
      d="M17 24 L21 28 L31 18"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.9"
      fill="none"
    />
  </svg>
);

// Alert/Warning triangle
export const AlertTriangleIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Triangle */}
    <path
      d="M24 8 L40 36 L8 36 Z"
      fill="#dc2626"
      opacity="0.2"
    />
    <path
      d="M24 8 L40 36 L8 36 Z"
      stroke="#ef4444"
      strokeWidth="1.5"
      opacity="0.6"
    />

    {/* Exclamation mark */}
    <line x1="24" y1="18" x2="24" y2="26" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
    <circle cx="24" cy="30" r="1.5" fill="white" opacity="0.9" />
  </svg>
);

// EQ Sliders icon (minimal)
export const EQIcon: React.FC<IconProps> = ({ className = "w-12 h-12", size = 48 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
  >
    {/* Slider tracks */}
    <line x1="14" y1="12" x2="14" y2="36" stroke="#334155" strokeWidth="2" opacity="0.3" strokeLinecap="round" />
    <line x1="24" y1="12" x2="24" y2="36" stroke="#334155" strokeWidth="2" opacity="0.3" strokeLinecap="round" />
    <line x1="34" y1="12" x2="34" y2="36" stroke="#334155" strokeWidth="2" opacity="0.3" strokeLinecap="round" />

    {/* Active parts of sliders (orange gradient) */}
    <line x1="14" y1="22" x2="14" y2="36" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="16" x2="24" y2="36" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
    <line x1="34" y1="28" x2="34" y2="36" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />

    {/* Slider knobs */}
    <circle cx="14" cy="22" r="3" fill="#fb923c" />
    <circle cx="14" cy="22" r="3" stroke="white" strokeWidth="1" opacity="0.3" />
    <circle cx="24" cy="16" r="3" fill="#fb923c" />
    <circle cx="24" cy="16" r="3" stroke="white" strokeWidth="1" opacity="0.3" />
    <circle cx="34" cy="28" r="3" fill="#fb923c" />
    <circle cx="34" cy="28" r="3" stroke="white" strokeWidth="1" opacity="0.3" />
  </svg>
);
