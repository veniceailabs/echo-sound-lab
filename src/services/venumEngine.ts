/**
 * V.E.N.U.M. - Viral Emergent Network Utility Matrix
 * Silent growth engine for Echo Sound Lab
 */

import { AudioMetrics, ProcessingConfig, EchoReport } from '../types';
import { GenreProfile } from './genreProfiles';

// ============================================
// TYPES
// ============================================

export interface ViralMoment {
  id: string;
  type: 'glow_up' | 'ab_win' | 'first_master' | 'genre_match' | 'big_improvement' | 'chain_creative';
  timestamp: number;
  score: number; // 0-100 viral potential
  data: Record<string, any>;
  nudge: string;
}

export interface ShareableCard {
  type: 'echo_report' | 'before_after' | 'chain_recipe' | 'glow_up';
  imageDataUrl: string;
  caption: string;
  hashtags: string[];
}

export interface NudgeMessage {
  text: string;
  tone: 'hype' | 'subtle' | 'mentor' | 'mysterious';
  action?: string;
}

export interface GenerateEchoReportCardOptions {
  trackName: string;
  report?: EchoReport;
  genreProfile?: GenreProfile | null;
  beforeMetrics?: AudioMetrics;
  afterMetrics?: AudioMetrics;
  // Fallback options
  lufs?: number;
  dynamicRange?: number;
  stereoWidth?: number;
  verdict?: string;
  genre?: string;
  improvementPercent?: number;
  processedConfig?: ProcessingConfig; // Add processed config to options
}

// ============================================
// VIRAL MOMENT DETECTION
// ============================================

const NUDGES = {
  glow_up: [
    "This glow-up is insane.",
    "Producers would lose their minds over this.",
    "You just created something worth sharing.",
    "This is one of those moments.",
    "The difference is night and day.",
  ],
  ab_win: [
    "That A/B hit different.",
    "You found it.",
    "This is the one.",
    "Trust your ears - this is it.",
    ],
  first_master: [
    "Your first master. This is history.",
    "Welcome to the game.",
    "This deserves to be heard.",
    "You just leveled up.",
  ],
  genre_match: [
    "You nailed the vibe.",
    "This sounds expensive.",
    "That's the sound right there.",
    "You understood the assignment.",
  ],
  big_improvement: [
    "Major improvement detected.",
    "Now we're talking.",
    "This is what progress looks like.",
    "The mix just opened up.",
  ],
  chain_creative: [
    "That chain is creative.",
    "Unique approach. I see you.",
    "This processing is yours.",
    "You're developing a signature.",
  ],
};

/**
 * Detect viral moments from user actions
 */
export const detectViralMoment = (
  action: string,
  before: AudioMetrics | null,
  after: AudioMetrics | null,
  config?: ProcessingConfig,
  genreProfile?: GenreProfile | null
): ViralMoment | null => {
  const id = `vm-${Date.now()}`;
  const timestamp = Date.now();

  // Glow-up detection (significant improvement)
  if (before && after) {
    const rmsImprovement = Math.abs(
      (20 * Math.log10(after.rms)) - (20 * Math.log10(before.rms))
    );
    const dynamicsImprovement = Math.abs(after.crestFactor - before.crestFactor);

    if (rmsImprovement > 3 || dynamicsImprovement > 2) {
      return {
        id,
        type: 'glow_up',
        timestamp,
        score: Math.min(100, Math.round((rmsImprovement + dynamicsImprovement) * 10)),
        data: { rmsImprovement, dynamicsImprovement, before, after },
        nudge: randomFrom(NUDGES.glow_up),
      };
    }
  }

  // First master detection
  if (action === 'first_export') {
    return {
      id,
      type: 'first_master',
      timestamp,
      score: 85,
      data: { after },
      nudge: randomFrom(NUDGES.first_master),
    };
  }

  // A/B win detection
  if (action === 'ab_select_processed') {
    return {
      id,
      type: 'ab_win',
      timestamp,
      score: 70,
      data: { config },
      nudge: randomFrom(NUDGES.ab_win),
    };
  }

  // Genre match detection
  if (genreProfile && after) {
    const lufsEstimate = 20 * Math.log10(after.rms) + 3;
    const targetLufs = genreProfile.targets.lufsIntegrated.ideal;
    const lufsDiff = Math.abs(lufsEstimate - targetLufs);

    if (lufsDiff < 2) {
      return {
        id,
        type: 'genre_match',
        timestamp,
        score: 90,
        data: { genreProfile: genreProfile.name, lufsEstimate, targetLufs },
        nudge: randomFrom(NUDGES.genre_match),
      };
    }
  }

  // Creative chain detection
  if (config) {
    const activeEffects = Object.entries(config).filter(([_, v]) => v !== undefined).length;
    if (activeEffects >= 4) {
      return {
        id,
        type: 'chain_creative',
        timestamp,
        score: 65,
        data: { config, activeEffects },
        nudge: randomFrom(NUDGES.chain_creative),
      };
    }
  }

  return null;
};

// ============================================
// SHAREABLE CARD GENERATORS
// ============================================

/**
 * Generate Echo Report shareable card
 */
export const generateEchoReportCard = async (
  options: GenerateEchoReportCardOptions
): Promise<ShareableCard> => {
  const { trackName, report, genreProfile, beforeMetrics, afterMetrics, processedConfig } = options;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350; // Instagram portrait
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0a0c12');
  gradient.addColorStop(0.5, '#111318');
  gradient.addColorStop(1, '#0a0c12');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ambient glow
  ctx.fillStyle = 'rgba(245, 158, 11, 0.03)';
  ctx.beginPath();
  ctx.arc(540, 400, 300, 0, Math.PI * 2);
  ctx.fill();

  // Header
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 30px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('ECHO REPORT', 540, 80);

  // Track name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px system-ui';
  const displayName = trackName.length > 30 ? trackName.slice(0, 27) + '...' : trackName;
  ctx.fillText(displayName, 540, 150);

  // Processed On Date/Time
  ctx.fillStyle = '#64748b';
  ctx.font = '16px system-ui';
  ctx.textAlign = 'center';
  const now = new Date();
  ctx.fillText(`PROCESSED ON: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 540, 190);


  // Before/After comparison
  // Use provided metrics or fallbacks/dummies
  const dummyBeforeRms = -18;
  const dummyAfterRms = options.lufs || -10;
  
  const beforeRms = beforeMetrics ? beforeMetrics.rms.toFixed(1) : dummyBeforeRms.toFixed(1);
  const afterRms = afterMetrics ? afterMetrics.rms.toFixed(1) : dummyAfterRms.toFixed(1);
  const beforePeak = beforeMetrics ? beforeMetrics.peak.toFixed(1) : '-3.0';
  const afterPeak = afterMetrics ? afterMetrics.peak.toFixed(1) : '-0.1';
  const beforeDyn = beforeMetrics ? beforeMetrics.crestFactor.toFixed(1) : '12.0';
  const afterDyn = afterMetrics ? afterMetrics.crestFactor.toFixed(1) : (options.dynamicRange?.toFixed(1) || '8.0');

  // Before section
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, 60, 240, 460, 200, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 240, 460, 200, 16);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 18px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('BEFORE', 90, 280);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '34px system-ui';
  ctx.fillText(`${beforeRms} dB RMS`, 90, 330);
  ctx.font = '26px system-ui';
  ctx.fillText(`${beforePeak} dB Peak`, 90, 365);
  ctx.fillText(`${beforeDyn} dB Dynamics`, 90, 400);

  // After section
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  roundRect(ctx, 560, 240, 460, 200, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  ctx.lineWidth = 2;
  roundRect(ctx, 560, 240, 460, 200, 16);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = '600 18px system-ui';
  ctx.fillText('AFTER', 590, 280);

  ctx.fillStyle = '#ffffff';
  ctx.font = '34px system-ui';
  ctx.fillText(`${afterRms} dB RMS`, 590, 330);
  ctx.font = '26px system-ui';
  ctx.fillText(`${afterPeak} dB Peak`, 590, 365);
  ctx.fillText(`${afterDyn} dB Dynamics`, 590, 400);

  // Arrow between
  ctx.fillStyle = '#f59e0b';
  ctx.font = '50px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('→', 540, 360);

  // Mastering Analysis
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, 60, 470, 960, 180, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 470, 960, 180, 16);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 16px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('MASTERING ANALYSIS', 90, 510);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '22px system-ui';
  const summary = report?.summary || `Professional master achieved. ${options.verdict ? `Verdict: ${options.verdict.replace('_', ' ')}` : ''}`;
  wrapText(ctx, summary, 90, 550, 900, 30);

  // Processing Chain (new section)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  roundRect(ctx, 60, 680, 960, 160, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 680, 960, 160, 16);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 16px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('PROCESSING CHAIN', 90, 720);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '20px system-ui';

  const appliedTools = new Set<string>();
  if (processedConfig) {
      if (processedConfig.eq && processedConfig.eq.some(b => b.gain !== 0)) appliedTools.add('Frequency Shaping');
      if (processedConfig.compression || processedConfig.multibandCompression) appliedTools.add('Dynamic Processing');
      if (processedConfig.saturation) appliedTools.add('Harmonic Enhancement');
      if (processedConfig.stereoImager) appliedTools.add('Stereo Imaging');
      if (processedConfig.limiter) appliedTools.add('Loudness Control');
      if (processedConfig.deEsser) appliedTools.add('De-Essing');
      if (processedConfig.motionReverb) appliedTools.add('Spatial Effects');
      if (processedConfig.transientShaper) appliedTools.add('Transient Shaping');
      if (processedConfig.dynamicEq) appliedTools.add('Dynamic EQ');
  } else if (report?.recommended_actions) {
      report.recommended_actions.forEach(action => {
          if (action.label.toLowerCase().includes('eq')) appliedTools.add('Frequency Shaping');
          if (action.label.toLowerCase().includes('compression') || action.label.toLowerCase().includes('dynamics') || action.label.toLowerCase().includes('limiter')) appliedTools.add('Dynamic Processing');
          if (action.label.toLowerCase().includes('saturation')) appliedTools.add('Harmonic Enhancement');
          if (action.label.toLowerCase().includes('stereo') || action.label.toLowerCase().includes('imaging')) appliedTools.add('Stereo Imaging');
          if (action.label.toLowerCase().includes('reverb') || action.label.toLowerCase().includes('delay')) appliedTools.add('Spatial Effects');
          if (action.label.toLowerCase().includes('de-esser')) appliedTools.add('De-Essing');
          if (action.label.toLowerCase().includes('transient')) appliedTools.add('Transient Shaping');
      });
  }
  const chainText = appliedTools.size > 0 ? Array.from(appliedTools).join(' • ') : 'Standard Gain & Limiting';
  wrapText(ctx, chainText, 90, 760, 900, 28);


  // Improvements list (moved down)
  ctx.fillStyle = '#64748b';
  ctx.font = '600 16px system-ui';
  ctx.fillText('IMPROVEMENTS', 90, 890);

  ctx.fillStyle = '#10b981';
  ctx.font = '20px system-ui';
  const improvements = report?.improvements?.slice(0, 3) || ['Optimized loudness', 'Enhanced clarity', 'Balanced dynamics'];
  improvements.forEach((imp, i) => {
    ctx.fillText(`+ ${imp}`, 90, 930 + i * 32);
  });

  // Score/Rating (moved down and slightly right)
  const score = report?.score?.total || (options.improvementPercent ? Math.min(95, 70 + options.improvementPercent) : 85);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
  ctx.beginPath();
  ctx.arc(900, 960, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(900, 960, 70, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * score / 100));
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`${score}`, 900, 975);
  ctx.fillStyle = '#64748b';
  ctx.font = '16px system-ui';
  ctx.fillText('SCORE', 900, 1005);

  // Watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '600 18px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Made with Echo Sound Lab', 540, 1290);

  // Subtle logo
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(540, 1230, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 22px system-ui';
  ctx.fillText('E', 540, 1238);

  const imageDataUrl = canvas.toDataURL('image/png');

  return {
    type: 'echo_report',
    imageDataUrl,
    caption: `Just mastered "${trackName}" with Echo Sound Lab ${genreProfile ? `// ${genreProfile.name} vibe` : ''}`,
    hashtags: ['#mixing', '#mastering', '#producer', '#musicproduction', '#echosoundlab', genreProfile ? `#${genreProfile.id.replace('-', '')}` : ''].filter(Boolean),
  };
};

/**
 * Generate Before/After card
 */
export const generateBeforeAfterCard = async (
  trackName: string,
  beforeMetrics: AudioMetrics,
  afterMetrics: AudioMetrics
): Promise<ShareableCard> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080; // Square for Instagram
  const ctx = canvas.getContext('2d')!;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0a0c12');
  gradient.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Split line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(540, 150);
  ctx.lineTo(540, 900);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('THE GLOW UP', 540, 100);

  // Before side
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 32px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('BEFORE', 270, 200);

  // Before waveform representation (simplified bars)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
  for (let i = 0; i < 15; i++) {
    const height = 50 + Math.random() * 150 * beforeMetrics.rms * 10;
    const x = 70 + i * 28;
    ctx.fillRect(x, 450 - height / 2, 20, height);
  }

  // Before stats
  ctx.fillStyle = '#94a3b8';
  ctx.font = '24px system-ui';
  ctx.fillText(`${beforeMetrics.rms.toFixed(1)} dB`, 270, 650);
  ctx.font = '16px system-ui';
  ctx.fillText('RMS Level', 270, 680);

  // After side
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 32px system-ui';
  ctx.fillText('AFTER', 810, 200);

  // After waveform representation
  ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
  for (let i = 0; i < 15; i++) {
    const height = 80 + Math.random() * 180 * afterMetrics.rms * 8;
    const x = 610 + i * 28;
    ctx.fillRect(x, 450 - height / 2, 20, height);
  }

  // After stats
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px system-ui';
  ctx.fillText(`${afterMetrics.rms.toFixed(1)} dB`, 810, 650);
  ctx.font = '16px system-ui';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('RMS Level', 810, 680);

  // Improvement arrow
  const improvement = ((afterMetrics.rms - beforeMetrics.rms) / beforeMetrics.rms * 100).toFixed(0);
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 28px system-ui';
  ctx.fillText(`+${Math.abs(parseFloat(improvement))}% louder`, 540, 800);

  // Track name
  ctx.fillStyle = '#64748b';
  ctx.font = '20px system-ui';
  const displayName = trackName.length > 40 ? trackName.slice(0, 37) + '...' : trackName;
  ctx.fillText(`"${displayName}"`, 540, 870);

  // Watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '600 14px system-ui';
  ctx.fillText('Echo Sound Lab', 540, 1030);

  const imageDataUrl = canvas.toDataURL('image/png');

  return {
    type: 'before_after',
    imageDataUrl,
    caption: `The glow up is real 🔥 Before & after mastering "${trackName}"`,
    hashtags: ['#beforeafter', '#mixing', '#mastering', '#glowup', '#producer', '#echosoundlab'],
  };
};

/**
 * Generate Chain Recipe card
 */
export const generateChainRecipeCard = async (
  trackName: string,
  config: ProcessingConfig,
  genreProfile: GenreProfile | null
): Promise<ShareableCard> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i < canvas.height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(canvas.width, i);
    ctx.stroke();
  }

  // Header
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 24px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('MY CHAIN TODAY', 540, 80);

  // Track name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px system-ui';
  const displayName = trackName.length > 25 ? trackName.slice(0, 22) + '...' : trackName;
  ctx.fillText(`"${displayName}"`, 540, 140);

  // Genre tag
  if (genreProfile) {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    roundRect(ctx, 400, 160, 280, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.font = '16px system-ui';
    ctx.fillText(`${genreProfile.icon} ${genreProfile.name}`, 540, 185);
  }

  // Chain visualization
  const chainItems = [
    {
      name: 'EQ',
      active: !!(config.eq && config.eq.length > 0),
      value: (config.eq && config.eq.length > 0) ? `${config.eq.length} Bands` : 'Flat'
    },
    {
      name: 'Compression',
      active: !!config.compression,
      value: config.compression ? 'Active' : 'Off'
    },
    {
      name: 'Saturation',
      active: !!(config.saturation && config.saturation.amount > 0),
      value: config.saturation ? `${(config.saturation.amount * 100).toFixed(0)}%` : 'Off'
    },
    {
      name: 'Stereo Width',
      active: !!config.stereoImager,
      value: config.stereoImager ? 'Enhanced' : 'Standard'
    },
    {
      name: 'Limiter',
      active: !!config.limiter,
      value: config.limiter ? 'On' : 'Off'
    },
  ];

  let y = 260;
  chainItems.forEach((item, index) => {
    // Connection line
    if (index > 0) {
      ctx.strokeStyle = item.active ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(540, y - 30);
      ctx.lineTo(540, y);
      ctx.stroke();
    }

    // Node
    ctx.fillStyle = item.active ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, 140, y, 800, 120, 16);
    ctx.fill();

    if (item.active) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 2;
      roundRect(ctx, 140, y, 800, 120, 16);
      ctx.stroke();
    }

    // Status indicator
    ctx.fillStyle = item.active ? '#10b981' : '#64748b';
    ctx.beginPath();
    ctx.arc(190, y + 60, 12, 0, Math.PI * 2);
    ctx.fill();

    // Name
    ctx.fillStyle = item.active ? '#ffffff' : '#64748b';
    ctx.font = 'bold 28px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(item.name, 230, y + 50);

    // Value
    ctx.fillStyle = item.active ? '#f59e0b' : '#475569';
    ctx.font = '22px system-ui';
    ctx.fillText(item.value, 230, y + 85);

    // Index number
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`${index + 1}`, 900, y + 75);

    y += 150;
  });

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '18px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Processing chain used for this master', 540, 1050);

  // Watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '600 14px system-ui';
  ctx.fillText('Echo Sound Lab', 540, 1300);

  const imageDataUrl = canvas.toDataURL('image/png');

  return {
    type: 'chain_recipe',
    imageDataUrl,
    caption: `My chain for "${trackName}" ${genreProfile ? `// ${genreProfile.name}` : ''} 🎛️`,
    hashtags: ['#mixingchain', '#processingchain', '#producer', '#mixing', '#echosoundlab'],
  };
};

// ============================================
// NUDGE SYSTEM
// ============================================

const NUDGE_TEMPLATES: Record<string, NudgeMessage[]> = {
  export_ready: [
    { text: "This is ready to share.", tone: 'subtle' },
    { text: "Producers would want to hear this.", tone: 'hype' },
    { text: "You've created something worth amplifying.", tone: 'mentor' },
    { text: "This energy deserves eyes.", tone: 'mysterious' },
  ],
  big_improvement: [
    { text: "The glow-up is real.", tone: 'hype' },
    { text: "This would make a fire before/after.", tone: 'subtle' },
    { text: "Major transformation detected.", tone: 'mentor' },
  ],
  first_session: [
    { text: "Welcome to the lab.", tone: 'mysterious' },
    { text: "Your first master. This is history.", tone: 'mentor' },
  ],
  genre_nailed: [
    { text: "You understood the assignment.", tone: 'hype' },
    { text: "That's the sound.", tone: 'subtle' },
    { text: "Vibe achieved.", tone: 'mysterious' },
  ],
};

/**
 * Get contextual nudge message
 */
export const getNudge = (context: string): NudgeMessage => {
  const templates = NUDGE_TEMPLATES[context] || NUDGE_TEMPLATES.export_ready;
  return randomFrom(templates);
};

// ============================================
// WATERMARKING
// ============================================

/**
 * Add metadata watermark to audio file
 */
export const addAudioMetadata = (blob: Blob, trackName: string): Blob => {
  // Note: Full ID3 tagging would require a library like jsmediatags
  // For now, we return the blob as-is but this is where we'd inject metadata
  // The metadata would include:
  // - Comment: "Mastered with Echo Sound Lab"
  // - Software: "Echo Sound Lab"
  // - URL: "echosoundlab.com"
  console.log(`[V.E.N.U.M.] Watermark metadata for "${trackName}"`);
  return blob;
};

/**
 * Generate visual watermark overlay
 */
export const generateWatermarkOverlay = (width: number, height: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, width, height);

  // Subtle corner watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('Echo Sound Lab', width - 10, height - 10);

  return canvas.toDataURL('image/png');
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  // Corrected typo here
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY);
      line = word + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
};

// ============================================
// MAIN V.E.N.U.M. CLASS
// ============================================

class VenumEngine {
  private viralMoments: ViralMoment[] = [];
  private sessionCount: number = 0;

  constructor() {
    this.sessionCount = parseInt(localStorage.getItem('venom_sessions') || '0');
  }

  /**
   * Track a user action and detect viral moments
   */
  trackAction(
    action: string,
    before: AudioMetrics | null,
    after: AudioMetrics | null,
    config?: ProcessingConfig,
    genreProfile?: GenreProfile | null
  ): ViralMoment | null {
    const moment = detectViralMoment(action, before, after, config, genreProfile);
    if (moment) {
      this.viralMoments.push(moment);
      console.log(`[V.E.N.U.M.] Viral moment detected: ${moment.type} (score: ${moment.score})`);
    }
    return moment;
  }

  /**
   * Get nudge for current context
   */
  getNudgeForContext(context: string): NudgeMessage {
    return getNudge(context);
  }

  /**
   * Check if this is user's first session
   */
  isFirstSession(): boolean {
    return this.sessionCount === 0;
  }

  /**
   * Mark session as started
   */
  startSession(): void {
    this.sessionCount++;
    localStorage.setItem('venom_sessions', this.sessionCount.toString());
  }

  /**
   * Get recent viral moments
   */
  getRecentMoments(limit: number = 5): ViralMoment[] {
    return this.viralMoments.slice(-limit);
  }

  /**
   * Get highest scoring viral moment
   */
  getBestMoment(): ViralMoment | null {
    if (this.viralMoments.length === 0) return null;
    return this.viralMoments.reduce((best, current) =>
      current.score > best.score ? current : best
    );
  }
}

export const venumEngine = new VenumEngine();
export default venumEngine;