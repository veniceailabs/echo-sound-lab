/**
 * Share Proof Service
 * Generate shareable proof URLs and QR codes
 */

interface ProofData {
  trackName: string;
  originalLUFS: number;
  processedLUFS: number;
  dynamicRange: number;
  truePeak: number;
  stereoWidth: number;
  timestamp: string;
}

/**
 * Encode proof data to base64 for URL
 */
export const encodeProofData = (data: ProofData): string => {
  return btoa(JSON.stringify(data));
};

/**
 * Decode proof data from base64
 */
export const decodeProofData = (encoded: string): ProofData | null => {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
};

/**
 * Generate shareable proof URL
 */
export const generateProofURL = (data: ProofData): string => {
  const encoded = encodeProofData(data);
  // Use current domain + proof path
  const baseURL = window.location.origin;
  return `${baseURL}/proof/${encoded}`;
};

/**
 * Generate QR code URL using QR server API
 */
export const generateQRCode = (text: string): string => {
  // Use qr-server.com free API
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
};

/**
 * Copy proof URL to clipboard
 */
export const copyProofURLToClipboard = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  }
};

/**
 * Generate email share template
 */
export const generateEmailTemplate = (data: ProofData, proofURL: string): string => {
  return `
Hi,

I just mastered "${data.trackName}" and wanted to share the before/after proof with you.

📊 Loudness:
• Original: ${data.originalLUFS.toFixed(1)} LUFS
• Mastered: ${data.processedLUFS.toFixed(1)} LUFS
• Improvement: ${Math.abs(data.processedLUFS - data.originalLUFS).toFixed(1)} dB

📈 Technical:
• Dynamic Range: ${data.dynamicRange.toFixed(1)} LU
• True Peak: ${data.truePeak.toFixed(1)} dBTP
• Stereo Width: ${data.stereoWidth.toFixed(1)}%

View the full proof here:
${proofURL}

Mastered with Echo Sound Lab
https://echo-sound-lab.vercel.app
  `.trim();
};

/**
 * Generate Twitter share text
 */
export const generateTwitterShare = (data: ProofData): string => {
  const improvement = Math.abs(data.processedLUFS - data.originalLUFS).toFixed(1);
  return `Just mastered "${data.trackName}" with @echosoundlab! 🎵 +${improvement}dB LUFS improvement. #MusicProduction #Mastering`;
};
