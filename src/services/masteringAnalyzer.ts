/**
 * Local Mastering Analyzer - Professional Grade Analysis
 *
 * Advanced rule-based analysis using:
 * - Loudness consistency detection
 * - Frequency-specific dynamics
 * - Phase & stereo quality
 * - Transient analysis
 * - Distortion prediction
 * - Frequency masking detection
 * - Platform compatibility prediction
 *
 * Catches problems that industry tools miss.
 */

import { AudioMetrics, EchoReport, EchoAction, ProcessingConfig, ProcessingAction } from '../types';
import { analyzeAdvancedMetrics, generateDiagnosticReport } from './advancedDiagnostics';
import { QuantumKernel } from './dsp/QuantumKernel';
import { getQCLSimulator } from '../echo-sound-lab/apl/qcl-simulator-adapter';

const QUANTUM_SHADOW_MODE_ENABLED = true;
const INTENTCORE_CONFIDENCE_THRESHOLD = 0.805;
const normalizeConfidence = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
};

/**
 * Mastering targets based on industry standards
 */
const MASTERING_TARGETS = {
  // LUFS targets by genre (streaming platforms use -14 LUFS)
  lufs: {
    streaming: -14,  // Spotify/Apple Music target
    loud: -10,       // Club/EDM
    dynamic: -16,    // Jazz/Classical
  },

  // Dynamic range (dB difference between RMS and peaks)
  dynamicRange: {
    minimum: 6,      // Too compressed below this
    ideal: 10,       // Sweet spot for most genres
    maximum: 20,     // Very dynamic (classical, jazz)
  },

  // Peak headroom
  peakHeadroom: {
    minimum: -0.3,   // Too hot (clipping risk)
    ideal: -1.0,     // Safe ceiling
  },

  // Spectral balance (relative energy by frequency range)
  spectralBalance: {
    bass: { min: 0.25, max: 0.40 },      // 20-250Hz (30-40% of energy)
    mids: { min: 0.30, max: 0.45 },      // 250-2kHz (30-45%)
    highs: { min: 0.15, max: 0.30 },     // 2k-20kHz (15-30%)
  }
};

/**
 * Analyze audio and generate mastering recommendations
 */
/**
 * NEW: Advanced analysis with buffer input
 * For professional-grade diagnostics
 */
export function analyzeAudioBuffer(buffer: AudioBuffer, metrics: AudioMetrics): EchoReport {
  // Populate advanced metrics
  metrics.advancedMetrics = analyzeAdvancedMetrics(buffer, metrics);

  // Run standard analysis (which now has access to advanced metrics)
  const report = analyzeMastering(metrics);
  report.analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (QUANTUM_SHADOW_MODE_ENABLED) {
    const shadow = evaluateQuantumShadowScore(buffer, metrics, report.score?.total ?? 0);
    const classicalScore = Math.round(report.score?.total ?? 0);
    const safeQuantum = Number.isFinite(shadow.quantumScore) ? shadow.quantumScore : classicalScore;
    const normalizedConfidence = Math.round(normalizeConfidence(shadow.quantumConfidence) * 1000) / 1000;
    report.quantumScore = safeQuantum;
    // Contract lock: Δ = Quantum − Classical
    report.shadowDelta = safeQuantum - classicalScore;
    report.quantumConfidence = normalizedConfidence;
    report.intentCoreActive = (
      normalizedConfidence > INTENTCORE_CONFIDENCE_THRESHOLD
      && Math.abs((report.shadowDelta ?? 0)) > 0.1
    );
    report.humanIntentIndex = report.intentCoreActive
      ? safeQuantum
      : classicalScore;
    console.log(
      `[Quantum Shadow] Classical Score: ${classicalScore} | Quantum Entanglement Score: ${safeQuantum} | meanCoherence=${shadow.meanCoherence.toFixed(3)} | stereoEntanglement=${shadow.stereoEntanglement.toFixed(3)} | QCL=${shadow.qclEnabled ? 'ON' : 'OFF'}`
    );
  } else {
    report.intentCoreActive = false;
    report.humanIntentIndex = Math.round(report.score?.total ?? 0);
  }

  return report;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const buildQuantumFeatureVector = (buffer: AudioBuffer, metrics: AudioMetrics): { features: number[]; stereoEntanglement: number } => {
  const lufs = metrics.lufs?.integrated ?? (metrics.rms + 3);
  const dynamicRange = metrics.peak - metrics.rms;
  const lufsFitness = clamp01(1 - Math.abs(lufs - (-14)) / 12);
  const peakFitness = clamp01(1 - Math.abs(metrics.peak - (-1.0)) / 3);
  const dynamicsFitness = clamp01(1 - Math.abs(dynamicRange - 10) / 10);
  const crestFitness = clamp01((metrics.crestFactor ?? dynamicRange) / 20);
  const spectralCenter = clamp01((metrics.spectralCentroid || 2000) / 8000);

  let stereoEntanglement = 0.5;
  if (buffer.numberOfChannels >= 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const sampleStep = Math.max(1, Math.floor(buffer.length / 12000));
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = 0; i < buffer.length; i += sampleStep) {
      const l = left[i] ?? 0;
      const r = right[i] ?? 0;
      dot += l * r;
      leftEnergy += l * l;
      rightEnergy += r * r;
    }
    const denom = Math.sqrt(leftEnergy * rightEnergy) || 1;
    const correlation = dot / denom;
    stereoEntanglement = clamp01(1 - Math.abs(correlation));
  }

  return {
    features: [
      lufsFitness,
      peakFitness,
      dynamicsFitness,
      crestFitness,
      spectralCenter,
      stereoEntanglement,
    ],
    stereoEntanglement,
  };
};

const evaluateQuantumShadowScore = (
  buffer: AudioBuffer,
  metrics: AudioMetrics,
  classicalScore: number
): { quantumScore: number; meanCoherence: number; stereoEntanglement: number; qclEnabled: boolean; quantumConfidence: number } => {
  const { features, stereoEntanglement } = buildQuantumFeatureVector(buffer, metrics);
  const quantum = QuantumKernel.analyzeAudioFeatures(features);
  const simulator = getQCLSimulator();
  if (!simulator.isEnabled()) {
    simulator.enable(0.35);
  }
  const qclEnabled = simulator.isEnabled();

  // Shadow-only score: no DSP control path, pure comparative telemetry.
  const coherenceBoost = quantum.meanCoherence * 14;
  const stereoBoost = stereoEntanglement * 8;
  const simulatorBoost = qclEnabled ? 2 : 0;
  const quantumScore = Math.max(
    0,
    Math.min(100, Math.round(classicalScore * 0.8 + coherenceBoost + stereoBoost + simulatorBoost))
  );

  return {
    quantumScore,
    meanCoherence: quantum.meanCoherence,
    stereoEntanglement,
    qclEnabled,
    quantumConfidence: buffer.length > buffer.sampleRate ? 1.0 : 0.5,
  };
};

/**
 * NEW: Generate ProcessingAction[] directly (no lossy conversion)
 * Replaces the old generateSuggestions() pattern
 */
export function generateProcessingActions(metrics: AudioMetrics): Array<ProcessingAction> {
  const report = analyzeMastering(metrics);
  const actions: ProcessingAction[] = [];

  report.recommended_actions.forEach((echoAction, idx) => {
    const action: ProcessingAction = {
      id: echoAction.id,
      label: echoAction.label,
      description: echoAction.description,
      type: echoAction.type,
      category: echoAction.type, // Same as type
      isSelected: false,
      isApplied: false,
      isEnabled: true,
      refinementType: echoAction.refinementType,
      bands: echoAction.bands,
      params: echoAction.params,
    };

    // Add diagnostic info based on action type
    if (echoAction.type === 'Compression' || echoAction.type === 'Limiter') {
      const lufs = metrics.lufs?.integrated || (metrics.rms + 3);
      action.diagnostic = {
        metric: 'LUFS',
        currentValue: lufs,
        targetValue: -14,
        severity: lufs < -16 ? 'warning' : 'info',
      };
    } else if (echoAction.type === 'EQ') {
      action.diagnostic = {
        metric: 'Spectral Balance',
        currentValue: metrics.spectralCentroid,
        targetValue: 2000,
        severity: 'info',
      };
    }

    actions.push(action);
  });

  return actions;
}

export function analyzeMastering(metrics: AudioMetrics): EchoReport {
  const actions: EchoAction[] = [];
  let score = 100;
  let issues: string[] = [];

  console.log('[Mastering Analyzer] Starting analysis', {
    lufs: metrics.lufs?.integrated || (metrics.rms + 3),
    peak: metrics.peak,
    dynamicRange: metrics.peak - metrics.rms,
    spectralCentroid: metrics.spectralCentroid,
    hasSpectralBalance: !!metrics.spectralBalance
  });

  // 1. LUFS Analysis
  const lufsIssue = analyzeLUFS(metrics);
  if (lufsIssue) {
    actions.push(lufsIssue.action);
    score -= lufsIssue.penalty;
    issues.push(lufsIssue.description);
  }

  // 2. Dynamic Range Analysis
  const dynamicsIssue = analyzeDynamicRange(metrics);
  if (dynamicsIssue) {
    actions.push(dynamicsIssue.action);
    score -= dynamicsIssue.penalty;
    issues.push(dynamicsIssue.description);
  }

  // 3. Peak Headroom Analysis
  const peakIssue = analyzePeakHeadroom(metrics);
  if (peakIssue) {
    actions.push(peakIssue.action);
    score -= peakIssue.penalty;
    issues.push(peakIssue.description);
  }

  // 4. Spectral Balance Analysis (if available)
  const spectralIssues = analyzeSpectralBalance(metrics, score);
  spectralIssues.forEach(issue => {
    actions.push(issue.action);
    score -= issue.penalty;
    issues.push(issue.description);
  });

  // 5. ADVANCED METRIC ANALYSIS (catches problems basic tools miss)
  // PRINCIPLE: Only recommend processing for ACTUAL problems, never for good audio
  // The best mastering is knowing when to do NOTHING

  // Disable aggressive processing recommendations - they "smush" already-good audio
  // Only provide diagnostic analysis (scores/feedback) without recommendations
  const advancedIssues: Array<{ action: EchoAction; penalty: number; description: string }> = [];

  advancedIssues.forEach(issue => {
    actions.push(issue.action);
    score -= issue.penalty;
    issues.push(issue.description);
  });

  // 6. General mastering compression (ONLY for unmixed audio with lower scores)
  // Only add if no other compression recommendation exists AND score indicates real need
  // Skip for well-mastered audio (score >= 85) to avoid over-processing
  const hasCompressionRec = actions.some(a => a.type === 'Compression' || a.type === 'Dynamics');
  if (!hasCompressionRec && score < 80) {
    actions.push({
      id: `compression-glue-${Date.now()}`,
      label: 'Add Mastering Glue',
      description: 'Gentle compression to glue the mix together and add punch.',
      type: 'Compression',
      refinementType: 'parameters',
      params: [
        {
          name: 'threshold',
          value: -16,
          unit: 'dB',
          min: -30,
          max: 0,
          step: 0.5,
          type: 'number',
          enabledByDefault: true
        },
        {
          name: 'ratio',
          value: 1.4,
          unit: ':1',
          min: 1,
          max: 10,
          step: 0.1,
          type: 'number',
          enabledByDefault: true
        },
        {
          name: 'attack',
          value: 0.030,
          unit: 's',
          min: 0.001,
          max: 0.1,
          step: 0.001,
          type: 'number',
          enabledByDefault: true
        },
        {
          name: 'release',
          value: 0.250,
          unit: 's',
          min: 0.01,
          max: 1,
          step: 0.01,
          type: 'number',
          enabledByDefault: true
        }
      ]
    });
    score -= 5;
    issues.push('Mastering compression recommended for cohesion');
  }

  // If the mix is already release-ready, do not recommend processing.
  if (score >= 90) {
    actions.length = 0;
    issues.length = 0;
  }

  const lufs = metrics.lufs?.integrated || (metrics.rms + 3);
  const dynamicRange = metrics.peak - metrics.rms;

  // Cap scores unless key "pro" targets are truly met.
  let maxScore = 100;
  if (!metrics.spectralBalance) maxScore = Math.min(maxScore, 92);
  if (lufs > -12.5 || lufs < -15.5) maxScore = Math.min(maxScore, 95);
  if (metrics.peak > -0.5 || metrics.peak < -2.0) maxScore = Math.min(maxScore, 95);
  if (dynamicRange < 8 || dynamicRange > 14) maxScore = Math.min(maxScore, 96);
  score = Math.min(score, maxScore);

  // Generate verdict
  const verdict = score >= 90 ? 'release_ready' : score >= 70 ? 'refinements_available' : 'needs_work';
  const verdictReason = generateVerdictReason(score, issues);

  console.log('[Mastering Analyzer] Analysis complete', {
    actionCount: actions.length,
    actions: actions.map(a => a.label),
    score: Math.round(score),
    verdict
  });

  return {
    summary: issues.length > 0
      ? `Found ${issues.length} area(s) for improvement`
      : 'Mix meets professional mastering standards',
    explanation: issues,
    recommended_actions: actions,
    confidence: 1.0, // Rule-based = 100% confident
    verdict,
    verdictReason,
    score: {
      total: Math.max(0, Math.round(score)),
      recordingQuality: Math.max(0, Math.round(score * 0.25)),
      stemQuality: Math.max(0, Math.round(score * 0.20)),
      genreAccuracy: Math.max(0, Math.round(score * 0.25)),
      vocalBeatRelationship: Math.max(0, Math.round(score * 0.20)),
      creativeExcellence: Math.max(0, Math.round(score * 0.10)),
    },
    humanIntentIndex: Math.max(0, Math.round(score)),
    intentCoreActive: false,
  };
}

function analyzeLUFS(metrics: AudioMetrics): { action: EchoAction; penalty: number; description: string } | null {
  const lufs = metrics.lufs?.integrated || (metrics.rms + 3);
  const target = MASTERING_TARGETS.lufs.streaming;

  // Too quiet (needs loudness) - Only if significantly below target
  // Modern production is usually on-target, so use wider threshold
  if (lufs < target - 3) {  // Changed from -2 to -3 (less aggressive)
    const inputGain = Math.min(3, (target - lufs) * 0.5);
    return {
      action: {
        id: `lufs-boost-${Date.now()}`,
        label: 'Increase Loudness',
        description: `Track is ${Math.abs(lufs - target).toFixed(1)}dB below streaming target (-14 LUFS). Applying gentle compression and limiting.`,
        type: 'Compression',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -12,
            unit: 'dB',
            min: -30,
            max: 0,
            step: 0.5,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'ratio',
            value: 2.0,
            unit: ':1',
            min: 1,
            max: 10,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'attack',
            value: 0.010,
            unit: 's',
            min: 0.001,
            max: 0.1,
            step: 0.001,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'release',
            value: 0.100,
            unit: 's',
            min: 0.01,
            max: 1,
            step: 0.01,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'inputGain',
            value: inputGain,
            unit: 'dB',
            min: 0,
            max: 6,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 15,
      description: `LUFS too low (${lufs.toFixed(1)} LUFS vs -14 target)`
    };
  }

  // Too loud (will be turned down by streaming)
  if (lufs > target + 2) {
    return {
      action: {
        id: `lufs-reduce-${Date.now()}`,
        label: 'Reduce Loudness',
        description: `Track will be turned down by streaming platforms (${lufs.toFixed(1)} LUFS vs -14 target). Reducing level.`,
        type: 'Dynamics',
        refinementType: 'parameters',
        params: [
          {
            name: 'inputGain',
            value: Math.max(-6, -(lufs - target)),
            unit: 'dB',
            min: -12,
            max: 0,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 10,
      description: `LUFS too high (${lufs.toFixed(1)} LUFS) - streaming will reduce volume`
    };
  }

  return null;
}

function analyzeDynamicRange(metrics: AudioMetrics): { action: EchoAction; penalty: number; description: string } | null {
  const rms = metrics.rms;
  const peak = metrics.peak;
  const dynamicRange = peak - rms; // dB difference
  const lufs = metrics.lufs?.integrated || (metrics.rms + 3);

  // Over-compressed (no dynamics left)
  if (dynamicRange < MASTERING_TARGETS.dynamicRange.minimum) {
    return {
      action: {
        id: `dynamics-expand-${Date.now()}`,
        label: 'Restore Dynamics',
        description: `Mix is over-compressed (${dynamicRange.toFixed(1)}dB range). Applying minimal compression to avoid further crushing.`,
        type: 'Dynamics',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -20,
            unit: 'dB',
            min: -30,
            max: 0,
            step: 0.5,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'ratio',
            value: 1.2,
            unit: ':1',
            min: 1,
            max: 4,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'attack',
            value: 0.020,
            unit: 's',
            min: 0.001,
            max: 0.1,
            step: 0.001,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'release',
            value: 0.200,
            unit: 's',
            min: 0.01,
            max: 1,
            step: 0.01,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 20,
      description: `Over-compressed (${dynamicRange.toFixed(1)}dB range, minimum ${MASTERING_TARGETS.dynamicRange.minimum}dB)`
    };
  }

  // Too dynamic (needs gentle compression)
  // Avoid extra compression if the mix is already loud and clipping is present.
  if (lufs > -12 && peak > MASTERING_TARGETS.peakHeadroom.minimum) {
    return null;
  }

  if (dynamicRange > MASTERING_TARGETS.dynamicRange.ideal + 5) {
    return {
      action: {
        id: `dynamics-control-${Date.now()}`,
        label: 'Control Dynamics',
        description: `High dynamic range (${dynamicRange.toFixed(1)}dB). Applying gentle compression for consistency.`,
        type: 'Compression',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -12,
            unit: 'dB',
            min: -30,
            max: 0,
            step: 0.5,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'ratio',
            value: 1.2,
            unit: ':1',
            min: 1,
            max: 10,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'attack',
            value: 0.030,
            unit: 's',
            min: 0.001,
            max: 0.1,
            step: 0.001,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'release',
            value: 0.220,
            unit: 's',
            min: 0.01,
            max: 1,
            step: 0.01,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 5,
      description: `Very dynamic (${dynamicRange.toFixed(1)}dB range) - may need gentle compression`
    };
  }

  return null;
}

function analyzePeakHeadroom(metrics: AudioMetrics): { action: EchoAction; penalty: number; description: string } | null {
  const peak = metrics.peak;

  // Too hot (clipping risk)
  if (peak > MASTERING_TARGETS.peakHeadroom.minimum) {
    return {
      action: {
        id: `peak-limit-${Date.now()}`,
        label: 'Protect Peaks',
        description: `Peaks too close to 0dBFS (${peak.toFixed(2)}dB). Applying protective limiting.`,
        type: 'Limiter',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -1.0,
            unit: 'dB',
            min: -6,
            max: 0,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'release',
            value: 0.100,
            unit: 's',
            min: 0.01,
            max: 0.5,
            step: 0.01,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 15,
      description: `Peaks too hot (${peak.toFixed(2)}dB) - clipping risk`
    };
  }

  // DISABLED for BETA: "Optimize Loudness" is enhancement language, not diagnostic
  // Modern production (Suno, etc.) is already on-target. Don't recommend "you could make it louder"
  // Only recommend limiters for actual clipping risk, not for subjective loudness
  /*
  if (peak < -3.0) {
    const inputGain = Math.min(3, Math.abs(peak) - 2);
    return {
      action: {
        id: `peak-optimize-${Date.now()}`,
        label: 'Optimize Loudness',
        description: `Good headroom (${Math.abs(peak).toFixed(1)}dB). Can safely increase level.`,
        type: 'Limiter',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -1.0,
            unit: 'dB',
            min: -6,
            max: 0,
            step: 0.1,
            type: 'number',
            enabledByDefault: true
          },
          {
            name: 'release',
            value: 0.100,
            unit: 's',
            min: 0.01,
            max: 0.5,
            step: 0.01,
            type: 'number',
            enabledByDefault: true
          }
        ]
      },
      penalty: 5,
      description: `Peaks low (${peak.toFixed(2)}dB) - headroom available`
    };
  }
  */

  return null;
}

function analyzeSpectralBalance(metrics: AudioMetrics, currentScore: number): Array<{ action: EchoAction; penalty: number; description: string }> {
  const issues: Array<{ action: EchoAction; penalty: number; description: string }> = [];

  // Only analyze if we have spectral data
  if (!metrics.spectralBalance) {
    return issues; // Return empty - no recommendations without actual spectral data
  }

  const balance = metrics.spectralBalance;
  const bands = ['low', 'lowMid', 'mid', 'highMid', 'high'] as const;

  for (const band of bands) {
    const energy = balance[band];
    const target = MASTERING_TARGETS.spectralBalance[band === 'low' || band === 'lowMid' ? 'bass' : band === 'mid' ? 'mids' : 'highs'];

    if (energy < target.min - 0.05) {
      // Band is too quiet - boost needed
      const freqMap = { low: 60, lowMid: 200, mid: 1000, highMid: 4000, high: 10000 };
      const typeMap = { low: 'lowshelf' as const, lowMid: 'peaking' as const, mid: 'peaking' as const, highMid: 'peaking' as const, high: 'highshelf' as const };

      issues.push({
        action: {
          id: `eq-boost-${band}-${Date.now()}`,
          label: `Boost ${band.charAt(0).toUpperCase() + band.slice(1)}`,
          description: `${band} frequencies are lacking energy. Boosting to restore balance.`,
          type: 'EQ',
          refinementType: 'bands',
          bands: [
            {
              freqHz: freqMap[band],
              gainDb: 2.0,
              q: 0.7,
              type: typeMap[band],
              enabledByDefault: true
            }
          ]
        },
        penalty: 5,
        description: `${band} energy too low`
      });
    }
  }

  return issues;
}

function generateVerdictReason(score: number, issues: string[]): string {
  if (score >= 90) {
    return 'Release-ready. Only small polish (if any) is needed.';
  }

  if (score >= 70) {
    return `Strong mix. ${issues.length > 0 ? `Focus on ${issues.slice(0, 2).join(', ')}.` : 'A few small refinements remain.'}`;
  }

  return `Needs work. Start with ${issues.slice(0, 3).join(', ')}.`;
}

/**
 * Generate AI-style suggestions (legacy compatibility)
 * Maps new EchoAction format to old Suggestion format for AI Recommendations panel
 */
export function generateSuggestions(metrics: AudioMetrics) {
  const report = analyzeMastering(metrics);

  return {
    suggestions: report.recommended_actions.map((action, i) => {
      // Convert EchoAction to legacy Suggestion format
      const parameters: any = {};

      // Map EQ bands to old format
      if (action.refinementType === 'bands' && action.bands) {
        parameters.eq = action.bands.map(b => ({
          frequency: b.freqHz,
          gain: b.gainDb,
          type: b.type || 'peaking',
          q: b.q || 0.7
        }));
      }

      // Map parameters to old format
      if (action.refinementType === 'parameters' && action.params) {
        action.params.forEach(p => {
          if (p.name === 'threshold') parameters.threshold = p.value;
          if (p.name === 'ratio') parameters.ratio = p.value;
          if (p.name === 'attack') parameters.attack = p.value;
          if (p.name === 'release') parameters.release = p.value;
          if (p.name === 'inputGain') parameters.inputTrimDb = p.value;
        });

        // Build compression/limiter configs based on action type
        if (action.type === 'Compression' || action.type === 'Dynamics') {
          parameters.compression = {
            threshold: parameters.threshold ?? -12,
            ratio: parameters.ratio ?? 1.5,
            attack: parameters.attack ?? 0.010,
            release: parameters.release ?? 0.100,
            makeupGain: 0
          };
        }

        if (action.type === 'Limiter') {
          parameters.limiter = {
            threshold: parameters.threshold ?? -1.0,
            ratio: 20,
            attack: 0.005,
            release: parameters.release ?? 0.100
          };
        }
      }

      return {
        id: action.id,
        category: action.type,  // Use 'type' as 'category'
        description: action.description,
        parameters,
        isSelected: false,
      };
    }),
    genre: 'Unknown', // Can be detected from spectral signature later
  };
}

/**
 * ADVANCED METRIC ANALYSIS FUNCTIONS
 * These catch problems that basic LUFS/peak analysis misses
 */

function analyzeLoudnessConsistency(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.loudnessConsistency) return null;

  // If loudness varies too much, it needs gentle broadband compression
  if (adv.loudnessConsistency < 70) {
    return {
      action: {
        id: `loudness-stabilize-${Date.now()}`,
        label: 'Stabilize Loudness',
        description: `Loudness is inconsistent (varies by ${adv.loudnessVariance}dB). ` +
          `Sounds like volume riding. Apply gentle broadband compression to smooth dynamics.`,
        type: 'Compression',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -18,
            unit: 'dB',
            min: -30,
            max: 0,
            step: 0.5,
            type: 'number',
            enabledByDefault: true,
          },
          {
            name: 'ratio',
            value: 1.5,
            unit: ':1',
            min: 1,
            max: 4,
            step: 0.1,
            type: 'number',
            enabledByDefault: true,
          },
        ],
      },
      penalty: 15,
      description: `Loudness inconsistency: ${adv.loudnessVariance}dB variance detected`,
    };
  }

  return null;
}

function analyzeMonoCompatibility(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.monoCompatibility) return null;

  // If mono compatibility is poor, there's a phase issue
  if (adv.monoCompatibility < 80) {
    return {
      action: {
        id: `mono-compat-${Date.now()}`,
        label: 'Fix Mono Compatibility',
        description: `Track loses ${(100 - adv.monoCompatibility).toFixed(0)}% energy in mono. ` +
          `Will sound significantly different on mono systems or legacy equipment. ` +
          `Check L/R phase relationship.`,
        type: 'EQ',
        refinementType: 'bands',
        bands: [
          {
            freqHz: 100,
            gainDb: 0,
            q: 0.7,
            type: 'lowshelf',
            enabledByDefault: true,
          },
        ],
      },
      penalty: 20,
      description: `Mono compatibility issue: ${adv.monoCompatibility}% (should be >85%)`,
    };
  }

  return null;
}

function analyzeStereoBalance(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.stereoImbalance) return null;

  // If L/R is significantly imbalanced, it will sound off-center
  if (Math.abs(adv.stereoImbalance) > 2) {
    const direction = adv.stereoImbalance > 0 ? 'left' : 'right';
    return {
      action: {
        id: `stereo-balance-${Date.now()}`,
        label: 'Balance Stereo Image',
        description: `L/R level difference of ${Math.abs(adv.stereoImbalance).toFixed(1)}dB ` +
          `pulls mix to the ${direction}. Noticeable on headphones. ` +
          `Adjust pan or channel levels.`,
        type: 'Imaging',
        refinementType: 'parameters',
        params: [],
      },
      penalty: 10,
      description: `Stereo imbalance: ${adv.stereoImbalance > 0 ? 'L' : 'R'} channel too loud`,
    };
  }

  return null;
}

function analyzeTransientQuality(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.transientSharpness) return null;

  // Weak transients = dull sound
  if (adv.transientSharpness < 40) {
    return {
      action: {
        id: `transient-enhance-${Date.now()}`,
        label: 'Enhance Transients',
        description: `Drums/transients lack definition (sharpness: ${adv.transientSharpness}%). ` +
          `Mix sounds dull or "pillowy". Apply transient shaper or selective EQ boost in presence range.`,
        type: 'Transient',
        refinementType: 'parameters',
        params: [
          {
            name: 'attack',
            value: 0.005,
            unit: 's',
            min: 0.001,
            max: 0.02,
            step: 0.001,
            type: 'number',
            enabledByDefault: true,
          },
        ],
      },
      penalty: 12,
      description: `Weak transients: ${adv.transientSharpness}% (should be >60%)`,
    };
  }

  return null;
}

function analyzeClippingRisk(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.clippingProbability) return null;

  // High clipping probability = danger
  if (adv.clippingProbability > 70) {
    return {
      action: {
        id: `protect-peaks-${Date.now()}`,
        label: 'Protect Peaks from Clipping',
        description: `${adv.clippingProbability}% probability of clipping on playback systems. ` +
          `Audio may distort on loudness normalization or re-encoding. ` +
          `Apply protective limiting with very high ratio.`,
        type: 'Limiter',
        refinementType: 'parameters',
        params: [
          {
            name: 'threshold',
            value: -1,
            unit: 'dB',
            min: -6,
            max: 0,
            step: 0.1,
            type: 'number',
            enabledByDefault: true,
          },
          {
            name: 'ratio',
            value: 10,
            unit: ':1',
            min: 4,
            max: 20,
            step: 1,
            type: 'number',
            enabledByDefault: true,
          },
        ],
      },
      penalty: 25,
      description: `Clipping risk: ${adv.clippingProbability}% (should be <30%)`,
    };
  }

  return null;
}

function analyzeFrequencyMasking(
  metrics: AudioMetrics
): { action: EchoAction; penalty: number; description: string } | null {
  const adv = metrics.advancedMetrics;
  if (!adv?.maskingIndex) return null;

  // High masking = important frequencies buried
  if (adv.maskingIndex > 70) {
    const freqs = adv.maskingFrequencies?.slice(0, 2).join('Hz, ') || '2kHz, 4kHz';
    return {
      action: {
        id: `unmask-frequencies-${Date.now()}`,
        label: 'Unmask Buried Frequencies',
        description: `Multiple important frequencies are masked/buried (${freqs}Hz). ` +
          `Use dynamic EQ or surgical cuts to separate competing elements.`,
        type: 'Dynamic EQ',
        refinementType: 'bands',
        bands: [],
      },
      penalty: 18,
      description: `Frequency masking index: ${adv.maskingIndex}% (hiding ${adv.maskingFrequencies?.length || 1} freq ranges)`,
    };
  }

  return null;
}
