/**
 * Echo Sound Lab Icon System
 * Clean, minimal SVG icons inspired by Swiss design & Apple's aesthetic
 * Consistent 24x24 viewBox, 1.5-2 stroke width
 */

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// AUDIO & MUSIC
export const MusicNoteIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

export const WaveformIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h2M7 8v8M11 5v14M15 8v8M19 12h2" />
  </svg>
);

export const MicrophoneIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

export const SpeakerIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

// CONTROLS
export const PlayIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const StopIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);

export const RecordIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

// FILES & ACTIONS
export const UploadIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

export const XIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// TOOLS & PROCESSING
export const SlidersIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
);

export const AdjustIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

export const SparklesIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

export const ProcessingIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// STATUS & INFO
export const AlertIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

export const InfoIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const SuccessIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// NAVIGATION
export const ChevronDownIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export const ChevronUpIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

// SETTINGS & SYSTEM
export const SettingsIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export const MenuIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// ── Extended icon set — all new tools ─────────────────────────────────────────

export const DrumIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="7" rx="8" ry="3" />
    <path d="M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7" />
    <line x1="7" y1="4.5" x2="4" y2="2" />
    <line x1="17" y1="4.5" x2="20" y2="2" />
  </svg>
);

export const PianoIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    {[4.5, 7.5, 12, 15, 18].map((x, i) => (
      <rect key={i} x={x} y="5" width="2" height="8" rx="0.5" fill="currentColor" stroke="none" opacity="0.7" />
    ))}
  </svg>
);

export const ArrangeIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="9" height="4" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="13" y="4" width="9" height="4" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="2" y="10" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="10" y="10" width="12" height="4" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="2" y="16" width="14" height="4" rx="1" fill="currentColor" fillOpacity="0.2" />
  </svg>
);

export const ReverbIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <path d="M12 12 Q8 6 4 12 Q8 18 12 12" />
    <path d="M12 12 Q16 6 20 12 Q16 18 12 12" opacity="0.5" />
    <path d="M12 12 Q9 5 6 12 Q9 19 12 12" opacity="0.3" />
  </svg>
);

export const TapeIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="12" r="3" />
    <circle cx="16" cy="12" r="3" />
    <path d="M11 12 Q12 14.5 13 12" />
  </svg>
);

export const SidechainIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,8 6,8 7,5 8,11 9,8 22,8" />
    <polyline points="2,16 8,16" strokeDasharray="3 2" />
    <path d="M8 16 Q13 12 18 16" />
    <polyline points="18,16 22,16" />
  </svg>
);

export const StemsIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <rect x="2" y="3" width="20" height="4" rx="1" fill="currentColor" fillOpacity="0.5" stroke="none" />
    <rect x="2" y="9.5" width="20" height="3.5" rx="1" fill="currentColor" fillOpacity="0.35" stroke="none" />
    <rect x="2" y="15" width="20" height="3" rx="1" fill="currentColor" fillOpacity="0.25" stroke="none" />
    <rect x="2" y="20" width="20" height="2" rx="1" fill="currentColor" fillOpacity="0.15" stroke="none" />
  </svg>
);

export const AlbumGainIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="14" width="20" height="7" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="4" y="9" width="16" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
    <rect x="7" y="4" width="10" height="5" rx="1" fill="currentColor" fillOpacity="0.1" />
    <polyline points="7,18 10,14 12,16 15,11 18,13" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const SpectrumIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
    <rect x="2"  y="16" width="3" height="7"  rx="0.5" opacity="0.6" />
    <rect x="6"  y="12" width="3" height="11" rx="0.5" opacity="0.7" />
    <rect x="10" y="6"  width="3" height="17" rx="0.5" />
    <rect x="14" y="9"  width="3" height="14" rx="0.5" opacity="0.8" />
    <rect x="18" y="14" width="3" height="9"  rx="0.5" opacity="0.6" />
  </svg>
);

export const MeterIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <path d="M3 19A10 10 0 0 1 21 19" />
    <line x1="12" y1="19" x2="7" y2="10" strokeWidth="2.5" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
  </svg>
);

export const EqIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,15 5,15 7,9 9,15 10,15 12,7 14,15 15,15 17,12 19,15 22,15" />
  </svg>
);

export const PhaseIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="3" x2="12" y2="21" opacity="0.3" />
    <line x1="3" y1="12" x2="21" y2="12" opacity="0.3" />
    <path d="M6 18 Q12 6 18 18" />
  </svg>
);

export const BlindTestIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M2 12 Q7 5 12 5 Q17 5 22 12" />
    <path d="M2 12 Q7 19 12 19 Q17 19 22 12" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </svg>
);

export const BpmIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12,7 12,13 15.5,15.5" />
  </svg>
);

export const RefMatchIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,18 7,10 11,13 15,7 22,12" />
    <polyline points="2,15 7,7 11,10 15,4 22,9" strokeDasharray="3 2" opacity="0.5" />
  </svg>
);

export const GainStagingIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="12" x2="6" y2="12" />
    <polygon points="6,8 13,12 6,16" fill="currentColor" stroke="none" />
    <line x1="13" y1="12" x2="18" y2="12" />
    <circle cx="20" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
);

export const LufsTimelineIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <polyline points="4,18 8,12 11,15 15,8 20,13" />
    <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="3 2" opacity="0.4" />
  </svg>
);

export const DREnhanceIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,18 6,18 7,14 8,22 9,18 22,18" />
    <polyline points="2,10 7,10 8,5 9,15 10,10 22,10" opacity="0.5" />
  </svg>
);

export const TransientIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,12 4,12 6,4 8,20 10,12 12,12" />
    <polyline points="12,12 14,12 16,7 18,17 20,12 22,12" opacity="0.5" />
  </svg>
);

export const ExciterIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 L14 9 L20 10.5 L16 15 L17 21 L12 18 L7 21 L8 15 L4 10.5 L10 9 Z" />
  </svg>
);

export const StereoWidthIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="3" x2="12" y2="21" opacity="0.3" />
    <path d="M12 12 L4 7 L4 17 Z" fill="currentColor" stroke="none" opacity="0.7" />
    <path d="M12 12 L20 7 L20 17 Z" fill="currentColor" stroke="none" opacity="0.7" />
  </svg>
);

export const GateIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,12 5,12 5,6 7,6 7,12 10,12 10,6 12,6 12,12 22,12" />
  </svg>
);

export const SpectralRepairIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2" opacity="0.3" />
    <rect x="7" y="6" width="6" height="5" rx="1" fill="currentColor" opacity="0.4" stroke="none" />
    <circle cx="18" cy="18" r="4" />
    <line x1="16.2" y1="16.2" x2="20.8" y2="20.8" />
  </svg>
);

export const ClickRepairIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,12 7,12 8,6 9,18 10,12 14,12 14.5,9 15,15 15.5,12 22,12" />
    <circle cx="8.5" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <line x1="8.5" y1="6.5" x2="8.5" y2="9" strokeWidth="1" />
  </svg>
);

export const PitchTimeIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18 Q7 6 12 12 Q17 18 21 6" />
    <line x1="3" y1="21" x2="21" y2="21" />
    <polyline points="18,3 21,6 18,9" />
  </svg>
);

export const TrimIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="7" r="3" />
    <circle cx="6" cy="17" r="3" />
    <line x1="9" y1="7" x2="22" y2="18" />
    <line x1="9" y1="17" x2="22" y2="6" />
  </svg>
);

export const PitchDetectIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <path d="M12 3 Q15 7 12 12 Q9 17 12 21" />
    <path d="M8 6 Q11 9 8 13" opacity="0.5" />
    <path d="M16 6 Q13 9 16 13" opacity="0.5" />
  </svg>
);

export const MixdownIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="4" x2="5" y2="20" />
    <line x1="11" y1="2" x2="11" y2="22" />
    <line x1="17" y1="6" x2="17" y2="18" />
    <line x1="2" y1="12" x2="22" y2="12" opacity="0.3" />
    <polyline points="8,15 11,19 14,15" />
  </svg>
);

export const MarkerIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <polygon points="12,2 18,8 12,14 6,8" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);

export const CertificateIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="15" height="18" rx="2" />
    <circle cx="19" cy="17" r="3.5" />
    <line x1="19" y1="20.5" x2="19" y2="23" />
    <line x1="6" y1="8" x2="13" y2="8" />
    <line x1="6" y1="11" x2="13" y2="11" />
    <line x1="6" y1="14" x2="10" y2="14" />
  </svg>
);

export const BatchExportIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="2" width="13" height="16" rx="2" />
    <rect x="8" y="6" width="13" height="16" rx="2" fill="#0f172a" />
    <line x1="14.5" y1="13" x2="14.5" y2="19" />
    <polyline points="11.5,16 14.5,19 17.5,16" />
  </svg>
);

export const CueSheetIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2" />
    <line x1="7" y1="8"  x2="17" y2="8" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="7" y1="16" x2="13" y2="16" />
    <circle cx="5.5" cy="8"  r="1" fill="currentColor" stroke="none" />
    <circle cx="5.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="5.5" cy="16" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const CollabIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="7" r="3.5" />
    <circle cx="17" cy="7" r="3.5" />
    <path d="M2 21 Q2 15 7 15 Q12 15 12 19" />
    <path d="M22 21 Q22 15 17 15 Q12 15 12 19" />
  </svg>
);

export const ShareIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <line x1="8.4" y1="10.8" x2="15.6" y2="6.2" />
    <line x1="8.4" y1="13.2" x2="15.6" y2="17.8" />
  </svg>
);

export const NotesIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <line x1="7" y1="9"  x2="17" y2="9" />
    <line x1="7" y1="13" x2="17" y2="13" />
    <line x1="7" y1="17" x2="12" y2="17" />
  </svg>
);

export const ChecklistIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,7 6,10 11,4" />
    <polyline points="3,13 6,16 11,10" />
    <polyline points="3,19 6,22 11,16" />
    <line x1="14" y1="7"  x2="21" y2="7" />
    <line x1="14" y1="13" x2="21" y2="13" />
    <line x1="14" y1="19" x2="21" y2="19" />
  </svg>
);

export const HistoryIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12A9 9 0 1 1 12 21" />
    <polyline points="3,6 3,12 9,12" />
    <line x1="12" y1="8" x2="12" y2="13" />
    <line x1="12" y1="13" x2="15" y2="16" />
  </svg>
);

export const InspectorIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7" />
    <line x1="15.5" y1="15.5" x2="21" y2="21" strokeWidth="2.5" />
  </svg>
);

export const ABCompareIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="9" height="14" rx="2" fill="currentColor" fillOpacity="0.1" />
    <rect x="13" y="5" width="9" height="14" rx="2" fill="currentColor" fillOpacity="0.1" />
    <line x1="11" y1="12" x2="13" y2="12" />
  </svg>
);

export const SaveIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <rect x="7" y="13" width="10" height="8" rx="1" />
    <rect x="8" y="3" width="8" height="6" rx="1" />
  </svg>
);

export const LightningIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
    <path d="M13 2L4.5 13.5H11L9 22l10.5-12H13L13 2Z" />
  </svg>
);

export const MidSideIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <circle cx="9" cy="12" r="6" />
    <circle cx="15" cy="12" r="6" />
  </svg>
);

export const ChordIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <line x1="6" y1="3" x2="6" y2="21" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="18" y1="3" x2="18" y2="21" />
    <line x1="3" y1="7"  x2="21" y2="7" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="17" x2="21" y2="17" />
    <circle cx="6"  cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="7"  r="1.8" fill="currentColor" />
    <circle cx="18" cy="17" r="1.8" fill="currentColor" />
  </svg>
);

export const SmartExportIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

export const MixCritiqueIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="13" strokeWidth="2" />
    <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const AudioIntelIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.2 6l-.8 2H9l-.8-2A7 7 0 0 1 5 9a7 7 0 0 1 7-7Z" />
    <line x1="9" y1="17" x2="15" y2="17" />
    <line x1="10" y1="20" x2="14" y2="20" />
  </svg>
);

export const LoopIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12A9 9 0 0 1 12 3h5" />
    <path d="M21 12A9 9 0 0 1 12 21H7" />
    <polyline points="14,1 17,4 14,7" />
    <polyline points="10,17 7,20 10,23" />
  </svg>
);

export const MicrophoneActiveIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="9" y1="22" x2="15" y2="22" />
    <circle cx="19" cy="4" r="2" fill="currentColor" stroke="none" className="animate-pulse" />
  </svg>
);

export const WrenchIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export const StereoAnalyzerIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

export const FreqReferenceIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="20" x2="22" y2="20" />
    <path d="M4 20 Q6 8 8 14 Q10 20 12 10 Q14 0 16 12 Q18 20 20 16" />
  </svg>
);

export const EqAdvisorIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,15 5,15 7,9 9,15 10,15 12,7 14,15 15,15 17,12 19,15 22,15" />
    <circle cx="7" cy="9" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const CompressorIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" opacity="0.3" />
    <polyline points="2,2 9,2 22,15 22,22" />
  </svg>
);

export const MultiMeterIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
    <rect x="2"  y="8"  width="3.5" height="14" rx="0.5" opacity="0.9" />
    <rect x="7"  y="12" width="3.5" height="10" rx="0.5" opacity="0.8" />
    <rect x="12" y="5"  width="3.5" height="17" rx="0.5" />
    <rect x="17" y="10" width="3.5" height="12" rx="0.5" opacity="0.8" />
  </svg>
);

export const ReferenceTrackIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const TempoIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3 L8 21" />
    <path d="M8 3 Q14 5 14 10 Q14 14 8 14" />
    <path d="M11 18 L14 21 L17 18" />
  </svg>
);

export const KeyScaleIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="17" r="3" />
    <path d="M10 17 L18 9" />
    <line x1="15" y1="6" x2="21" y2="6" />
    <line x1="18" y1="3" x2="18" y2="9" />
  </svg>
);

export const PowerEngineIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="3"  x2="12" y2="7" strokeWidth="2.5" />
    <path d="M8 7 Q4 10 6 15 Q8 19 12 19 Q16 19 18 15 Q20 10 16 7" />
  </svg>
);

export const SpectralBalanceIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="20" x2="22" y2="20" />
    <path d="M3 20 Q6 14 9 16 Q12 18 14 10 Q16 4 20 12" />
    <path d="M3 20 Q6 12 9 13 Q12 14 14 7 Q16 2 20 9" strokeDasharray="3 2" opacity="0.5" />
  </svg>
);

export const WaveformAnnotationIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,12 5,7 7,15 9,10 11,13 13,8 15,12 22,12" />
    <line x1="9" y1="3" x2="9" y2="6" strokeDasharray="2 1" />
    <polygon points="9,3 11,6 7,6" fill="currentColor" stroke="none" opacity="0.7" />
  </svg>
);

export const VocalPitchIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <polyline points="8,21 12,21 16,21" />
    <line x1="17" y1="6" x2="20" y2="4" opacity="0.5" />
    <line x1="17" y1="9" x2="21" y2="9" opacity="0.5" />
    <line x1="17" y1="12" x2="20" y2="14" opacity="0.5" />
  </svg>
);

export const TunerIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18 A10 10 0 0 1 21 18" />
    <line x1="12" y1="18" x2="8" y2="9" strokeWidth="2" />
    <circle cx="12" cy="18" r="2" fill="currentColor" stroke="none" />
    <line x1="7" y1="15" x2="7" y2="13" opacity="0.5" />
    <line x1="12" y1="8" x2="12" y2="5"  opacity="0.5" />
    <line x1="17" y1="15" x2="17" y2="13" opacity="0.5" />
  </svg>
);

export const InputMonitorIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <polyline points="9,22 15,22" />
    <circle cx="19" cy="5" r="2.5" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);

export const LoopRegionIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="8" width="14" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
    <line x1="5" y1="5" x2="5" y2="19" />
    <line x1="19" y1="5" x2="19" y2="19" />
    <polyline points="3,6 5,8 7,6" />
    <polyline points="17,6 19,8 21,6" />
  </svg>
);

export const ZoomInIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7" />
    <line x1="15.5" y1="15.5" x2="21" y2="21" strokeWidth="2.5" />
    <line x1="7" y1="10" x2="13" y2="10" />
    <line x1="10" y1="7" x2="10" y2="13" />
  </svg>
);

export const ZoomOutIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7" />
    <line x1="15.5" y1="15.5" x2="21" y2="21" strokeWidth="2.5" />
    <line x1="7" y1="10" x2="13" y2="10" />
  </svg>
);

export const PunchIcon: React.FC<IconProps> = ({ className = "w-6 h-6", size }) => (
  <svg className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="6" width="8" height="12" rx="1.5" fill="currentColor" fillOpacity="0.15" />
    <line x1="8" y1="3" x2="8" y2="21" strokeDasharray="2 2" opacity="0.5" />
    <line x1="16" y1="3" x2="16" y2="21" strokeDasharray="2 2" opacity="0.5" />
    <polyline points="5,7 8,10 11,7" />
    <polyline points="13,7 16,10 19,7" />
  </svg>
);
