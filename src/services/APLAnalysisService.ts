/**
 * APL ANALYSIS SERVICE
 * Orchestrates end-to-end analysis: File → Audio Decode → Spectral Analysis → Signal Intelligence → Proposals
 *
 * This is the real entry point for smart proposal generation.
 * Previously we used mock data; now we generate based on actual audio forensics.
 */

import { SpectralAnalyzer } from './dsp/SpectralAnalyzer';
import {
  VocalIntakeConditioningReport,
  VocalIntakeConditioningService,
} from './vocal/intakeConditioning';
import {
  VocalProfile,
  VocalProfiler,
} from './vocal/vocalProfiler';
import {
  DeEssingAnalysis,
  VocalDeEssingZoneDetector,
} from './vocal/deEssingZones';
import {
  CompressionStackAnalysis,
  VocalCompressionStackLogic,
} from './vocal/compressionStackLogic';
import {
  PresenceAirAnalysis,
  VocalPresenceAirTuning,
} from './vocal/presenceAirTuning';
import {
  DelayAutomationAnalysis,
  VocalDelayAutomationLogic,
} from './vocal/delayAutomationLogic';
import {
  VocalIntentAnalysis,
  VocalIntentDetector,
} from './vocal/vocalIntentDetector';
import {
  HookLiftAnalysis,
  VocalHookLiftLogic,
} from './vocal/hookLiftLogic';
import {
  AdLibPlacementAnalysis,
  VocalAdLibPlacementLogic,
} from './vocal/adlibPlacement';
import {
  VocalGuardrailAnalysis,
  VocalGuardrails,
} from './vocal/guardrails';
import {
  VocalContextAwarenessAnalysis,
  VocalContextAwareness,
} from './vocal/contextAwareness';
import {
  LowEndDisciplineAnalysis,
  LowEndDiscipline,
} from './lowend/lowEndDiscipline';
import {
  PhaseCMasteringAnalysis,
  PhaseCMastering,
} from './master/phaseCMastering';
import {
  SessionNarrativeAnalysis,
  SessionNarrativeEngine,
} from './finishing/sessionNarrativeEngine';
import {
  PerceptualConsequenceAnalysis,
  PerceptualConsequenceEngine,
} from './finishing/perceptualConsequenceEngine';
import {
  ReferenceWorldAnalysis,
  ReferenceWorldEngine,
} from './finishing/referenceWorldEngine';
import { analyzeArrangement, ArrangementAnalysis } from './arrangementAnalyzer';
import { buildAPLPerceptualField, type APLPerceptualField } from './aplPerceptualField';
import { buildAPLAutomationPlan, type APLAutomationPlan } from './aplAutomationPlanner';
import {
  APLSignalIntelligence,
  APLSignalMetrics,
  APLAnomaly,
  createSignalIntelligence
} from '../echo-sound-lab/apl/signal-intelligence';
import { APLProposal, APLProposalEngine, getAPLProposalEngine } from '../echo-sound-lab/apl/proposal-engine';

export interface AnalysisRequest {
  file: File;
  trackId?: string;
  trackName?: string;
  sessionId?: string;
}

export interface AnalysisResult {
  success: boolean;
  proposals: APLProposal[];
  signalIntelligence?: APLSignalIntelligence;
  intakeConditioning?: VocalIntakeConditioningReport;
  vocalProfile?: VocalProfile;
  deEssingAnalysis?: DeEssingAnalysis;
  compressionStack?: CompressionStackAnalysis;
  presenceAirAnalysis?: PresenceAirAnalysis;
  delayAutomationAnalysis?: DelayAutomationAnalysis;
  vocalIntentAnalysis?: VocalIntentAnalysis;
  arrangementAnalysis?: ArrangementAnalysis;
  contextAwarenessAnalysis?: VocalContextAwarenessAnalysis;
  hookLiftAnalysis?: HookLiftAnalysis;
  adLibPlacementAnalysis?: AdLibPlacementAnalysis;
  guardrailAnalysis?: VocalGuardrailAnalysis;
  lowEndAnalysis?: LowEndDisciplineAnalysis;
  phaseCMasteringAnalysis?: PhaseCMasteringAnalysis;
  sessionNarrativeAnalysis?: SessionNarrativeAnalysis;
  perceptualConsequenceAnalysis?: PerceptualConsequenceAnalysis;
  referenceWorldAnalysis?: ReferenceWorldAnalysis;
  perceptualMixField?: APLPerceptualField;
  automationPlan?: APLAutomationPlan;
  error?: string;
}

/**
 * APL Analysis Service
 */
export class APLAnalysisService {
  private static buildDeterministicTrackId(file: File): string {
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'track';
    const safe = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const sizePart = file.size.toString(36);
    const modPart = (file.lastModified || 0).toString(36);
    return `track_${safe || 'untitled'}_${sizePart}_${modPart}`;
  }

  /**
   * Main entry point: Analyze a file and generate proposals
   */
  public static async analyzeFile(request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      // 1. Decode audio file to AudioBuffer
      const audioBuffer = await this.decodeAudioFile(request.file);
      const trackId = request.trackId || this.buildDeterministicTrackId(request.file);
      const trackName = request.trackName || request.file.name.replace(/\.[^/.]+$/, '');
      const sessionId = request.sessionId || `session_${trackId}`;

      // 2. Run intake conditioning before spectral analysis
      const conditioning = VocalIntakeConditioningService.condition(audioBuffer);

      // 3. Build vocal profile from the conditioned view and intake report
      const vocalProfile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);

      // 4. Build de-essing zones from the conditioned view, profile, and intake report
      const deEssingAnalysis = VocalDeEssingZoneDetector.analyze(
        conditioning.conditionedBuffer,
        vocalProfile,
        conditioning.report
      );

      const compressionStack = VocalCompressionStackLogic.analyze(
        vocalProfile,
        conditioning.report,
        deEssingAnalysis
      );

      const presenceAirAnalysis = VocalPresenceAirTuning.analyze(
        vocalProfile,
        conditioning.report,
        deEssingAnalysis,
        compressionStack
      );

      const delayAutomationAnalysis = VocalDelayAutomationLogic.analyze(
        vocalProfile,
        compressionStack,
        presenceAirAnalysis
      );

      const vocalIntentAnalysis = VocalIntentDetector.analyze(
        vocalProfile,
        conditioning.report,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis
      );

      const arrangementAnalysis = analyzeArrangement(conditioning.conditionedBuffer as AudioBuffer);

      const contextAwarenessAnalysis = VocalContextAwareness.analyze(
        vocalProfile,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis,
        arrangementAnalysis,
        vocalIntentAnalysis
      );

      const hookLiftAnalysis = VocalHookLiftLogic.analyze(
        vocalProfile,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis,
        arrangementAnalysis,
        vocalIntentAnalysis,
        contextAwarenessAnalysis
      );

      const adLibPlacementAnalysis = VocalAdLibPlacementLogic.analyze(
        vocalProfile,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis,
        hookLiftAnalysis,
        arrangementAnalysis,
        vocalIntentAnalysis,
        contextAwarenessAnalysis
      );

      const guardrailAnalysis = VocalGuardrails.analyze(
        vocalProfile,
        deEssingAnalysis,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis,
        hookLiftAnalysis,
        adLibPlacementAnalysis,
        arrangementAnalysis
      );

      const lowEndAnalysis = LowEndDiscipline.analyze(
        conditioning.conditionedBuffer,
        arrangementAnalysis,
        contextAwarenessAnalysis
      );

      // 5. Run spectral analysis on the conditioned view
      const spectralProfile = SpectralAnalyzer.analyze(conditioning.conditionedBuffer);

      // 6. Build signal metrics
      const metrics = this.buildSignalMetrics(spectralProfile);

      // 7. Detect anomalies
      const anomalies = this.detectAnomalies(spectralProfile, metrics);

      const phaseCMasteringAnalysis = PhaseCMastering.analyze(
        metrics,
        spectralProfile,
        arrangementAnalysis,
        lowEndAnalysis,
        vocalProfile,
        vocalIntentAnalysis
      );

      const sessionNarrativeAnalysis = SessionNarrativeEngine.analyze({
        arrangement: arrangementAnalysis,
        lowEnd: lowEndAnalysis,
        phaseCMastering: phaseCMasteringAnalysis,
        vocalIntent: vocalIntentAnalysis,
        sessionId,
        trackName,
        narrativePriorityBias: contextAwarenessAnalysis.densityScore,
      });

      const perceptualConsequenceAnalysis = PerceptualConsequenceEngine.analyze({
        metrics,
        spectralProfile,
        arrangement: arrangementAnalysis,
        lowEnd: lowEndAnalysis,
        phaseCMastering: phaseCMasteringAnalysis,
        vocalProfile,
        sessionNarrative: sessionNarrativeAnalysis,
      });

      const referenceWorldAnalysis = ReferenceWorldEngine.analyze({
        referenceDelta: undefined,
        phaseCMastering: phaseCMasteringAnalysis,
        lowEnd: lowEndAnalysis,
        vocalIntent: vocalIntentAnalysis,
        sessionFinish: undefined,
        album: undefined,
        finishLoop: undefined,
        perceptualConsequence: perceptualConsequenceAnalysis,
      });

      const perceptualMixField = buildAPLPerceptualField({
        arrangement: arrangementAnalysis,
        vocalIntent: vocalIntentAnalysis,
        contextAwareness: contextAwarenessAnalysis,
        hookLift: hookLiftAnalysis,
        adLibPlacement: adLibPlacementAnalysis,
        delayAutomation: delayAutomationAnalysis,
        guardrails: guardrailAnalysis,
      });

      const automationPlan = buildAPLAutomationPlan({
        trackId,
        trackName,
        arrangement: arrangementAnalysis,
        perceptualField: perceptualMixField,
        hookLift: hookLiftAnalysis,
        adLibPlacement: adLibPlacementAnalysis,
      });

      // 8. Create signal intelligence
      const analyzedAt = request.file.lastModified || Date.now();

      const signalIntelligence = createSignalIntelligence({
        trackId,
        trackName,
        sessionId,
        metrics,
        anomalies,
        analyzedAt,
      });

      // 9. Generate proposals
      const engine = getAPLProposalEngine();
      const proposals = engine.generateProposals(signalIntelligence);

      return {
        success: true,
        proposals,
        signalIntelligence,
        intakeConditioning: conditioning.report,
        vocalProfile,
        deEssingAnalysis,
        compressionStack,
        presenceAirAnalysis,
        delayAutomationAnalysis,
        vocalIntentAnalysis,
        arrangementAnalysis,
        contextAwarenessAnalysis,
        hookLiftAnalysis,
        adLibPlacementAnalysis,
        guardrailAnalysis,
        lowEndAnalysis,
        phaseCMasteringAnalysis,
        sessionNarrativeAnalysis,
        perceptualConsequenceAnalysis,
        referenceWorldAnalysis,
        perceptualMixField,
        automationPlan,
      };
    } catch (error) {
      console.error('[APLAnalysisService] Analysis failed:', error);
      return {
        success: false,
        proposals: [],
        error: error instanceof Error ? error.message : 'Unknown analysis error'
      };
    }
  }

  public async analyzeFile(request: AnalysisRequest): Promise<AnalysisResult> {
    return APLAnalysisService.analyzeFile(request);
  }

  /**
   * Decode audio file to AudioBuffer
   */
  private static async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  }

  /**
   * Build APLSignalMetrics from SpectralProfile
   */
  private static buildSignalMetrics(profile: any): APLSignalMetrics {
    return {
      loudnessLUFS: profile.loudnessLUFS,
      loudnessRange: 0, // Not computed yet
      truePeakDB: profile.truePeakDB,
      peakLevel: profile.peakLevel,
      crestFactor: profile.crestFactor,
      spectralCentroid: profile.spectralCentroid,
      spectralSpread: 0, // Not computed yet
      clippingDetected: profile.clippingDetected,
      dcOffsetDetected: profile.dcOffsetDetected,
      silenceDetected: profile.silenceDetected,
      duration: profile.duration,
      sampleRate: profile.sampleRate,
      bitDepth: 24 // Default assumption
    };
  }

  /**
   * Detect anomalies from spectral data
   */
  private static detectAnomalies(profile: any, metrics: APLSignalMetrics): APLAnomaly[] {
    const anomalies: APLAnomaly[] = [];

    // CLIPPING DETECTION
    if (profile.clippingDetected) {
      anomalies.push({
        type: 'CLIPPING',
        severity: 'CRITICAL',
        startMs: 0,
        endMs: profile.duration,
        description: `True peak detected at ${profile.truePeakDB.toFixed(1)} dBFS (${profile.clippingEvents} clipped samples). Digital clipping will cause distortion and platform rejection.`,
        suggestedFix: 'Apply limiting or reduce gain before clipping point'
      });
    }

    // DC OFFSET DETECTION
    if (profile.dcOffsetDetected) {
      anomalies.push({
        type: 'DC_OFFSET',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: `DC offset detected (${Math.abs(profile.dcOffset).toFixed(4)}V). This can cause artifacts in processing chains.`,
        suggestedFix: 'Apply highpass filter at 20Hz to remove DC component'
      });
    }

    // LOUDNESS OUT OF RANGE
    const targetLUFS = -14;
    if (Math.abs(metrics.loudnessLUFS - targetLUFS) > 2.0) {
      const severity = metrics.loudnessLUFS < -20 ? 'WARNING' : 'INFO';
      anomalies.push({
        type: 'LOUDNESS_OUT_OF_RANGE',
        severity,
        startMs: 0,
        endMs: profile.duration,
        description: `Loudness is ${metrics.loudnessLUFS.toFixed(1)} LUFS (target: ${targetLUFS} LUFS for streaming). ${
          metrics.loudnessLUFS < targetLUFS ? 'Too quiet' : 'Too loud'
        } for streaming platforms.`,
        suggestedFix: metrics.loudnessLUFS < targetLUFS ? 'Increase gain' : 'Apply limiting'
      });
    }

    // LOW-END RUMBLE
    if (profile.hasLowEndRumble && profile.lowEndEnergy > 0.3) {
      anomalies.push({
        type: 'SPECTRAL_SKEW',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: `Excessive low-frequency energy detected (${(profile.lowEndEnergy * 100).toFixed(1)}% of spectrum below 80Hz). May indicate rumble or mic noise.`,
        suggestedFix: 'Apply highpass filter around 80Hz'
      });
    }

    // SILENCE
    if (profile.silenceDetected) {
      anomalies.push({
        type: 'SILENCE',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: 'File is mostly silence. No processing recommendations.',
        suggestedFix: 'Check if file uploaded correctly'
      });
    }

    return anomalies;
  }
}

/**
 * Convenience singleton
 */
export const aplAnalysisService = new APLAnalysisService();
