import type { AudioMetrics } from '../types';

/**
 * Certificate Generator
 * Creates a professional mastering certificate PDF
 */

export interface CertificateData {
  trackName: string;
  timestamp: Date;
  certificateNumber: string;
  originalLUFS: number;
  processedLUFS: number;
  dynamicRange: number;
  truePeak: number;
  stereoWidth: number;
  bpm?: number;
  key?: string;
  genre?: string;
}

/**
 * Generate SVG certificate (can be converted to PDF on backend)
 */
export const generateCertificateSVG = (data: CertificateData): string => {
  const formattedDate = data.timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const svg = `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
      <!-- Background gradient -->
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#22d3ee;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="800" height="600" fill="url(#bgGrad)"/>

      <!-- Top accent line -->
      <rect x="50" y="40" width="700" height="3" fill="url(#accentGrad)"/>

      <!-- Logo/Title -->
      <text x="400" y="90" font-size="42" font-weight="bold" text-anchor="middle" fill="#22d3ee" font-family="Arial, sans-serif">
        MASTERING CERTIFICATE
      </text>

      <!-- Subtitle -->
      <text x="400" y="120" font-size="14" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif">
        Professional Audio Mastering by Echo Sound Lab
      </text>

      <!-- Divider -->
      <line x1="100" y1="140" x2="700" y2="140" stroke="#334155" stroke-width="1"/>

      <!-- Certificate Number -->
      <text x="100" y="170" font-size="11" fill="#94a3b8" font-family="Arial, sans-serif">Certificate Number</text>
      <text x="100" y="190" font-size="16" font-weight="bold" fill="#e2e8f0" font-family="monospace">${data.certificateNumber}</text>

      <!-- Track Info Section -->
      <text x="100" y="230" font-size="12" fill="#64748b" font-family="Arial, sans-serif">TRACK INFORMATION</text>
      <text x="100" y="255" font-size="11" fill="#94a3b8" font-family="Arial, sans-serif">Track Name</text>
      <text x="100" y="275" font-size="18" font-weight="bold" fill="#f1f5f9" font-family="Arial, sans-serif">${data.trackName}</text>

      <!-- Metrics Grid -->
      <text x="100" y="320" font-size="12" fill="#64748b" font-family="Arial, sans-serif">LOUDNESS METRICS</text>

      <!-- Original LUFS -->
      <rect x="100" y="335" width="140" height="70" fill="#1e293b" stroke="#475569" stroke-width="1" rx="4"/>
      <text x="170" y="355" font-size="11" fill="#94a3b8" text-anchor="middle" font-family="Arial, sans-serif">Original</text>
      <text x="170" y="375" font-size="24" font-weight="bold" fill="#64748b" text-anchor="middle" font-family="monospace">${data.originalLUFS.toFixed(1)}</text>
      <text x="170" y="395" font-size="10" fill="#475569" text-anchor="middle" font-family="Arial, sans-serif">LUFS</text>

      <!-- Arrow -->
      <text x="270" y="375" font-size="28" fill="#22d3ee" text-anchor="middle" font-family="Arial, sans-serif">→</text>

      <!-- Processed LUFS -->
      <rect x="320" y="335" width="140" height="70" fill="#0c4a6e" stroke="#0369a1" stroke-width="2" rx="4"/>
      <text x="390" y="355" font-size="11" fill="#7dd3fc" text-anchor="middle" font-family="Arial, sans-serif">Mastered</text>
      <text x="390" y="375" font-size="24" font-weight="bold" fill="#22d3ee" text-anchor="middle" font-family="monospace">${data.processedLUFS.toFixed(1)}</text>
      <text x="390" y="395" font-size="10" fill="#0ea5e9" text-anchor="middle" font-family="Arial, sans-serif">LUFS</text>

      <!-- Improvement Badge -->
      <rect x="540" y="335" width="140" height="70" fill="#064e3b" stroke="#059669" stroke-width="1" rx="4"/>
      <text x="610" y="355" font-size="11" fill="#6ee7b7" text-anchor="middle" font-family="Arial, sans-serif">Improvement</text>
      <text x="610" y="375" font-size="24" font-weight="bold" fill="#10b981" text-anchor="middle" font-family="monospace">${Math.abs(data.processedLUFS - data.originalLUFS).toFixed(1)}</text>
      <text x="610" y="395" font-size="10" fill="#059669" text-anchor="middle" font-family="Arial, sans-serif">dB</text>

      <!-- Additional Metrics -->
      <text x="100" y="440" font-size="12" fill="#64748b" font-family="Arial, sans-serif">TECHNICAL SPECIFICATIONS</text>

      <!-- 3x2 metrics grid -->
      <g id="metric1">
        <rect x="100" y="455" width="100" height="50" fill="#1e293b" stroke="#475569" stroke-width="1" rx="2"/>
        <text x="150" y="472" font-size="9" fill="#94a3b8" text-anchor="middle" font-family="Arial, sans-serif">Dynamic Range</text>
        <text x="150" y="490" font-size="14" font-weight="bold" fill="#22d3ee" text-anchor="middle" font-family="monospace">${data.dynamicRange.toFixed(1)} LU</text>
      </g>

      <g id="metric2">
        <rect x="220" y="455" width="100" height="50" fill="#1e293b" stroke="#475569" stroke-width="1" rx="2"/>
        <text x="270" y="472" font-size="9" fill="#94a3b8" text-anchor="middle" font-family="Arial, sans-serif">True Peak</text>
        <text x="270" y="490" font-size="14" font-weight="bold" fill="#22d3ee" text-anchor="middle" font-family="monospace">${data.truePeak.toFixed(1)} dBTP</text>
      </g>

      <g id="metric3">
        <rect x="340" y="455" width="100" height="50" fill="#1e293b" stroke="#475569" stroke-width="1" rx="2"/>
        <text x="390" y="472" font-size="9" fill="#94a3b8" text-anchor="middle" font-family="Arial, sans-serif">Stereo Width</text>
        <text x="390" y="490" font-size="14" font-weight="bold" fill="#22d3ee" text-anchor="middle" font-family="monospace">${data.stereoWidth.toFixed(1)}%</text>
      </g>

      ${data.bpm ? `
      <g id="metric4">
        <rect x="460" y="455" width="100" height="50" fill="#1e293b" stroke="#475569" stroke-width="1" rx="2"/>
        <text x="510" y="472" font-size="9" fill="#94a3b8" text-anchor="middle" font-family="Arial, sans-serif">Tempo</text>
        <text x="510" y="490" font-size="14" font-weight="bold" fill="#22d3ee" text-anchor="middle" font-family="monospace">${data.bpm} BPM</text>
      </g>
      ` : ''}

      <!-- Certification Mark -->
      <circle cx="650" cy="480" r="35" fill="none" stroke="#22d3ee" stroke-width="2"/>
      <text x="650" y="490" font-size="32" text-anchor="middle" fill="#22d3ee">✓</text>

      <!-- Footer -->
      <line x1="100" y1="540" x2="700" y2="540" stroke="#334155" stroke-width="1"/>
      <text x="100" y="565" font-size="10" fill="#64748b" font-family="Arial, sans-serif">Certified by Echo Sound Lab</text>
      <text x="100" y="580" font-size="9" fill="#475569" font-family="Arial, sans-serif">Mastered: ${formattedDate}</text>
      <text x="700" y="565" font-size="10" fill="#64748b" text-anchor="end" font-family="Arial, sans-serif">echo-sound-lab.vercel.app</text>

      <!-- Bottom accent -->
      <rect x="50" y="595" width="700" height="2" fill="url(#accentGrad)"/>
    </svg>
  `;

  return svg;
};

/**
 * Download certificate as SVG (or PDF via backend)
 */
export const downloadCertificate = (data: CertificateData) => {
  const svg = generateCertificateSVG(data);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ESL-Certificate-${data.certificateNumber}.svg`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Get next certificate number from localStorage
 */
export const getNextCertificateNumber = (): string => {
  const stored = localStorage.getItem('esl:certificateCount');
  const count = (stored ? parseInt(stored) : 0) + 1;
  localStorage.setItem('esl:certificateCount', count.toString());
  return `ESL-${String(count).padStart(6, '0')}`;
};
