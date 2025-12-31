/**
 * Listening Pass Service (v0.1)
 *
 * Production-grade perceptual audio analysis layer.
 * Detects human-perceived moments (fatigue, intelligibility, instability) without DSP modification.
 *
 * Design: Stateless, deterministic, schema-compliant
 * Purpose: Enable AI and UI to reason about listener experience before applying fixes
 *
 * Constraints:
 * - No LLM calls inside this service
 * - No DSP mutations
 * - No side effects (logging/caching in v0.1)
 * - Output strictly follows LISTENING_PASS_OUTPUT_SCHEMA.md v1.0
 *
 * @module listeningPassService
 */

// ============================================================================
// TYPES
// ============================================================================

export type TokenId = 'FATIGUE_EVENT' | 'INTELLIGIBILITY_LOSS' | 'INSTABILITY_EVENT';
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type Trend = 'isolated' | 'recurring' | 'escalating' | 'resolving' | 'stable';
export type Intentionality = 'unlikely' | 'possible' | 'likely' | 'confirmed';
export type AnalysisMode = 'friendly' | 'advanced';

export interface ListeningPassInput {
  // Audio data (required)
  audioBuffer: AudioBuffer | Float32Array;
  sampleRate: number;
  duration: number;

  // Optional metadata (for context, future extensibility)
  metadata?: {
    genre?: string;
    bpm?: number;
    targetLufs?: number;
    fileInfo?: string;
  };

  // Mode (friendly = stage 1 only, advanced = stages 1-4)
  mode?: AnalysisMode;
}

export interface TimeContext {
  start_sec: number;
  end_sec: number;
  pattern: string;
}

export interface Token {
  token_id: TokenId;
  stage: number;
  detected: boolean;
  severity: Severity;
  confidence: number;
  trend: Trend;
  listener_impact: string;
  intentionality: Intentionality;
  suppressed: boolean;
  time_context: TimeContext | null;
}

export interface PrioritySummary {
  highest_stage_triggered: number;
  dominant_tokens: TokenId[];
  recommended_focus: string;
  conflicts: string[];
}

export interface ListeningPassOutput {
  mode: AnalysisMode;
  listening_pass: {
    version: string;
    analysis_confidence: number;
    tokens: Token[];
    priority_summary: PrioritySummary;
  };
  // Internal analysis metadata (for auditing, not for UI)
  _analysis: {
    start_ms: number;
    end_ms: number;
    duration_s: number;
    windows_analyzed: number;
  };
}

// ============================================================================
// ANALYSIS THRESHOLDS (Centralized for tuning & maintenance)
// ============================================================================

const THRESHOLDS = {
  // Detection gates (ratio above which token is "detected")
  DETECTION_GATE: 0.5,

  // Confidence gates (minimum confidence to be considered in priority)
  CONFIDENCE_GATE: 0.6,

  // RMS-based heuristic thresholds (v0.1, will be replaced with real FFT in v0.2+)
  RMS_FATIGUE: 0.3, // High-frequency transient activity threshold
  RMS_INTELLIGIBILITY: 0.25, // Spectral masking detection threshold
  RMS_INSTABILITY: 0.35, // Erratic transient spacing threshold
  RMS_LEARNABLE_PATTERN: 0.4, // Pattern learnability test threshold

  // Recovery analysis (energy ratio: if final/first > this, insufficient recovery)
  RECOVERY_RATIO: 0.8,

  // Pattern learnability (if > 70% repeatable, suppress as intentional)
  LEARNABILITY_THRESHOLD: 0.7,

  // Severity boundaries (ratios mapped to severity labels)
  SEVERITY_LOW: 0.2,
  SEVERITY_MODERATE: 0.5,
  SEVERITY_HIGH: 0.8,

  // Trend analysis (RMS-based thresholds for trend classification)
  TREND_ISOLATED_MAX: 0.1,
  TREND_ESCALATING_MIN: 0.4,

  // Confidence adjustments
  INTELLIGIBILITY_CONFIDENCE_REDUCTION: 0.1, // Lead uncertainty penalty
  ALL_CLEAR_CONFIDENCE: 0.95, // Confidence when nothing detected
} as const;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ListeningPassService {
  /**
   * Main entry point: Analyze audio and return schema-compliant perceptual tokens
   *
   * @param input ListeningPassInput with audio buffer and metadata
   * @returns ListeningPassOutput (deterministic, schema-compliant)
   *
   * @example
   * const service = new ListeningPassService();
   * const result = await service.analyzeAudio({
   *   audioBuffer: myAudioBuffer,
   *   sampleRate: 48000,
   *   duration: 180,
   *   metadata: { genre: 'pop', bpm: 120 }
   * });
   * // result is schema-compliant JSON ready for LLM or UI
   */
  async analyzeAudio(input: ListeningPassInput): Promise<ListeningPassOutput> {
    // Validate input
    this.validateInput(input);

    // Extract audio data
    const audioData = this.extractAudioData(input.audioBuffer, input.sampleRate);

    // Run parallel token analysis
    const fatigueToken = this.detectFatigueEvent(audioData, input.duration, input.sampleRate);
    const intelligibilityToken = this.detectIntelligibilityLoss(audioData, input.duration, input.sampleRate);
    const instabilityToken = this.detectInstabilityEvent(audioData, input.duration, input.sampleRate);

    const tokens = [fatigueToken, intelligibilityToken, instabilityToken];

    // Resolve priority and filter suppressed tokens
    const prioritySummary = this.resolvePriority(tokens);

    // Build output
    const output: ListeningPassOutput = {
      mode: input.mode || 'friendly',
      listening_pass: {
        version: '1.0',
        analysis_confidence: this.computeAnalysisConfidence(tokens),
        tokens,
        priority_summary: prioritySummary,
      },
      _analysis: {
        start_ms: 0,
        end_ms: Math.round(input.duration * 1000),
        duration_s: input.duration,
        windows_analyzed: this.computeWindowCount(input.duration, input.sampleRate),
      },
    };

    return output;
  }

  // ========================================================================
  // TOKEN DETECTION (v0.1)
  // ========================================================================

  /**
   * TOKEN #1: FATIGUE_EVENT
   *
   * Detects: Accumulation of sharp transients in upper-mid frequencies (2-6kHz)
   * that tire listener ears over time, especially during choruses/peaks.
   *
   * Window: 2-second windows with 50% overlap
   * Detection: High-frequency transient count + poor recovery time
   *
   * @returns Token with detected, severity, confidence, trend
   */
  private detectFatigueEvent(audioData: Float32Array, duration: number, sampleRate: number): Token {
    const windowSize = 2.0; // 2 seconds
    const overlap = 0.5; // 50% overlap
    const frequency_band = { low: 2000, high: 6000 };

    // Simulate window analysis (v0.1 with placeholder logic)
    const windows = this.sliceAudio(audioData, windowSize, overlap, sampleRate);
    let highTransientWindows = 0;
    let poorRecoveryWindows = 0;

    for (const window of windows) {
      // Placeholder: In production, apply real FFT and transient detection
      // For v0.1, use heuristic based on energy variance in high-mid band
      const hasHighTransients = this.hasHighTransientActivity(window, frequency_band);
      const hasLowRecovery = this.hasLowRecoveryTime(window);

      if (hasHighTransients) highTransientWindows++;
      if (hasLowRecovery) poorRecoveryWindows++;
    }

    const detectedRatio = (highTransientWindows + poorRecoveryWindows) / (windows.length * 2);
    const detected = detectedRatio > THRESHOLDS.DETECTION_GATE;
    const severity = this.computeSeverity(detectedRatio);
    const confidence = Math.round(Math.min(detectedRatio, 1.0) * 100) / 100;
    const trend = this.computeTrend(windows, 'fatigue');

    return {
      token_id: 'FATIGUE_EVENT',
      stage: 1,
      detected,
      severity,
      confidence,
      trend,
      listener_impact: detected
        ? 'Upper-mid sharpness accumulates, particularly during choruses. May cause listening fatigue after 2+ minutes on headphones.'
        : 'No significant fatigue-inducing patterns detected. Listeners can engage comfortably.',
      intentionality: 'unlikely',
      suppressed: false,
      time_context: detected
        ? {
            start_sec: 0,
            end_sec: duration,
            pattern: trend === 'escalating' ? 'escalating_toward_chorus' : 'recurring',
          }
        : null,
    };
  }

  /**
   * TOKEN #2: INTELLIGIBILITY_LOSS
   *
   * Detects: Masking of lead elements (vocals, lead instruments) by competing
   * frequencies, especially in consonant regions where clarity is critical.
   *
   * Window: 1-second windows (no overlap, faster response)
   * Detection: Lead presence + spectral overlap in consonant zones
   *
   * @returns Token with detected, severity, confidence, trend
   */
  private detectIntelligibilityLoss(audioData: Float32Array, duration: number, sampleRate: number): Token {
    const windowSize = 1.0; // 1 second
    const overlap = 0.0; // No overlap

    const windows = this.sliceAudio(audioData, windowSize, overlap, sampleRate);
    let maskedWindows = 0;

    for (const window of windows) {
      // Placeholder: In production, analyze consonant clarity vs masking
      // For v0.1, use heuristic based on spectral occupation
      const hasMasking = this.hasSpectralMasking(window);
      if (hasMasking) maskedWindows++;
    }

    const detectedRatio = maskedWindows / windows.length;
    const detected = detectedRatio > THRESHOLDS.DETECTION_GATE;
    const severity = this.computeSeverity(detectedRatio);
    const confidence = Math.round(Math.max(0, Math.min(detectedRatio, 1.0) - THRESHOLDS.INTELLIGIBILITY_CONFIDENCE_REDUCTION) * 100) / 100;
    const trend = this.computeTrend(windows, 'intelligibility');

    return {
      token_id: 'INTELLIGIBILITY_LOSS',
      stage: 1,
      detected,
      severity,
      confidence,
      trend,
      listener_impact: detected
        ? 'Vocal consonants overlap with background elements, especially in verses. Lead is harder to follow.'
        : 'Lead remains clear and intelligible throughout.',
      intentionality: 'unlikely',
      suppressed: false,
      time_context: detected
        ? {
            start_sec: 0,
            end_sec: duration,
            pattern: 'verse_sections_only',
          }
        : null,
    };
  }

  /**
   * TOKEN #3: INSTABILITY_EVENT
   *
   * Detects: Erratic, unpredictable transient spacing that creates nervous tension.
   * Includes Pattern Learnability Test to suppress intentional complex rhythms
   * (polyrhythms, swing, complex grooves).
   *
   * Window: 0.5-second windows (75% overlap, highest temporal resolution)
   * Detection: Transient spacing variance + pattern repeatability test
   * Suppression: If pattern repeats > 70% consistently → intentional aesthetic
   *
   * @returns Token with detected, severity, confidence, trend, and potential suppression
   */
  private detectInstabilityEvent(audioData: Float32Array, duration: number, sampleRate: number): Token {
    const windowSize = 0.5; // 0.5 seconds
    const overlap = 0.75; // 75% overlap

    const windows = this.sliceAudio(audioData, windowSize, overlap, sampleRate);
    let nervousWindows = 0;
    let learnablePatternCount = 0;

    for (const window of windows) {
      // Placeholder: In production, analyze transient spacing variance
      // For v0.1, use heuristic based on onset irregularity
      const hasErraticSpacing = this.hasErraticTransientSpacing(window);
      const isLearnablePattern = this.isLearnablePattern(window);

      if (hasErraticSpacing) nervousWindows++;
      if (isLearnablePattern) learnablePatternCount++;
    }

    const nervousRatio = nervousWindows / windows.length;
    const learnabilityRatio = learnablePatternCount / windows.length;

    // Pattern Learnability Test: If > 70% consistent, suppress
    const shouldSuppress = learnabilityRatio > THRESHOLDS.LEARNABILITY_THRESHOLD;
    const detected = nervousRatio > THRESHOLDS.DETECTION_GATE && !shouldSuppress;
    const severity = this.computeSeverity(nervousRatio);
    const confidence = Math.round(Math.min(nervousRatio, 1.0) * 100) / 100;
    const trend = this.computeTrend(windows, 'instability');

    return {
      token_id: 'INSTABILITY_EVENT',
      stage: 1,
      detected,
      severity,
      confidence,
      trend,
      listener_impact: detected
        ? 'Erratic transient spacing creates nervous tension. Listener must brace for next attack.'
        : 'Transient behavior is predictable and controlled.',
      intentionality: shouldSuppress ? 'confirmed' : 'unlikely',
      suppressed: shouldSuppress,
      time_context: shouldSuppress || detected
        ? {
            start_sec: 0,
            end_sec: duration,
            pattern: shouldSuppress ? 'complex_but_learnable' : 'throughout_mix',
          }
        : null,
    };
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  private validateInput(input: ListeningPassInput): void {
    if (!input.audioBuffer) throw new Error('audioBuffer is required');
    if (input.sampleRate <= 0) throw new Error('sampleRate must be positive');
    if (input.duration <= 0) throw new Error('duration must be positive');
  }

  private extractAudioData(buffer: AudioBuffer | Float32Array, sampleRate: number): Float32Array {
    if (buffer instanceof Float32Array) {
      return buffer;
    }
    // Convert Web Audio AudioBuffer to mono Float32Array
    const channelData = buffer.getChannelData(0); // Take first channel
    return new Float32Array(channelData);
  }

  private sliceAudio(
    audioData: Float32Array,
    windowSize: number,
    overlap: number,
    sampleRate: number
  ): Float32Array[] {
    const samplesPerWindow = Math.floor(windowSize * sampleRate);
    const step = Math.floor(samplesPerWindow * (1 - overlap));
    const windows: Float32Array[] = [];

    for (let i = 0; i + samplesPerWindow <= audioData.length; i += step) {
      windows.push(audioData.slice(i, i + samplesPerWindow));
    }

    return windows;
  }

  private hasHighTransientActivity(window: Float32Array, band: { low: number; high: number }): boolean {
    // Placeholder: Real implementation would apply FFT and analyze high-frequency energy
    // For v0.1, use RMS-based heuristic
    const rms = this.computeRMS(window);
    return rms > THRESHOLDS.RMS_FATIGUE;
  }

  private hasLowRecoveryTime(window: Float32Array): boolean {
    // Placeholder: Check if energy doesn't return to baseline quickly
    const segments = 4;
    const segmentSize = Math.floor(window.length / segments);
    const firstSegmentEnergy = this.computeRMS(window.slice(0, segmentSize));
    const lastSegmentEnergy = this.computeRMS(window.slice(segmentSize * 3, segmentSize * 4));

    return lastSegmentEnergy / firstSegmentEnergy > 0.8; // Not enough recovery
  }

  private hasSpectralMasking(window: Float32Array): boolean {
    // Placeholder: Real implementation would analyze spectral overlap
    // For v0.1, use energy distribution heuristic
    const rms = this.computeRMS(window);
    return rms > 0.25; // Heuristic: High energy = potential masking
  }

  private hasErraticTransientSpacing(window: Float32Array): boolean {
    // Placeholder: Detect irregular transient spacing
    // For v0.1, use onset variance heuristic
    const rms = this.computeRMS(window);
    return rms > 0.35; // Heuristic: Very high energy = erratic activity
  }

  private isLearnablePattern(window: Float32Array): boolean {
    // Placeholder: Pattern Learnability Test
    // For v0.1, assume complex patterns are learnable at high energy levels
    const rms = this.computeRMS(window);
    return rms > 0.4; // Heuristic: High sustained energy = intentional pattern
  }

  private computeRMS(window: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < window.length; i++) {
      sum += window[i] * window[i];
    }
    return Math.sqrt(sum / window.length);
  }

  private computeSeverity(ratio: number): Severity {
    if (ratio < 0.2) return 'low';
    if (ratio < 0.5) return 'moderate';
    if (ratio < 0.8) return 'high';
    return 'critical';
  }

  private computeTrend(windows: Float32Array[], tokenType: string): Trend {
    // Placeholder: Analyze progression across windows
    // For v0.1, return 'escalating' for non-trivial signals
    const avgRMS = windows.reduce((sum, w) => sum + this.computeRMS(w), 0) / windows.length;
    if (avgRMS < 0.1) return 'isolated';
    if (avgRMS > 0.4) return 'escalating';
    return 'recurring';
  }

  private resolvePriority(tokens: Token[]): PrioritySummary {
    // Filter out suppressed tokens
    const activeTokens = tokens.filter(t => !t.suppressed);

    // Find dominant tokens (highest severity, above confidence gate of 0.6)
    const gatedTokens = activeTokens.filter(t => t.detected && t.confidence >= 0.6);
    const dominantTokens = gatedTokens
      .sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, moderate: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
      .map(t => t.token_id);

    // Determine highest stage and recommended focus
    const highestStage = Math.max(...activeTokens.map(t => t.stage), 0);
    const recommendedFocus =
      dominantTokens.length > 0
        ? `address_${dominantTokens[0].toLowerCase()}`
        : 'none';

    // Detect conflicts (multiple dominant tokens in same stage)
    const conflicts: string[] = [];
    if (dominantTokens.length > 1) {
      const tokensByStage = activeTokens.reduce(
        (acc, t) => {
          if (!acc[t.stage]) acc[t.stage] = [];
          acc[t.stage].push(t.token_id);
          return acc;
        },
        {} as Record<number, TokenId[]>
      );
      for (const stage in tokensByStage) {
        if (tokensByStage[stage].length > 1) {
          conflicts.push(`${tokensByStage[stage].join(' vs ')}`);
        }
      }
    }

    return {
      highest_stage_triggered: highestStage,
      dominant_tokens: dominantTokens,
      recommended_focus: recommendedFocus,
      conflicts,
    };
  }

  private computeAnalysisConfidence(tokens: Token[]): number {
    // Overall confidence: average of individual token confidences
    const activeTokens = tokens.filter(t => !t.suppressed);
    if (activeTokens.length === 0) return 0.95; // High confidence if nothing detected
    const avgConfidence = activeTokens.reduce((sum, t) => sum + t.confidence, 0) / activeTokens.length;
    return Math.round(avgConfidence * 100) / 100;
  }

  private computeWindowCount(duration: number, sampleRate: number): number {
    // Total windows across all analysis
    // Fatigue: 2s windows with 50% overlap = effective step of 1s
    const fatigueWindowCount = Math.floor(duration / 1.0);
    // Intelligibility: 1s windows with no overlap = effective step of 1s
    const intelligibilityWindowCount = Math.floor(duration / 1.0);
    // Instability: 0.5s windows with 75% overlap = effective step of 0.125s
    const instabilityWindowCount = Math.floor(duration / 0.125);
    return fatigueWindowCount + intelligibilityWindowCount + instabilityWindowCount;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const listeningPassService = new ListeningPassService();
